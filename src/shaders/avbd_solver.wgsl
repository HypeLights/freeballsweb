struct Particle {
    pos: vec2<f32>,
    vel: vec2<f32>,
    radius: f32,
    color: u32,
    mass: f32,
    invMass: f32,
    padding: vec2<f32>
};

struct SimParams {
    dt: f32,
    gravity: f32,
    damping: f32,
    restitution: f32,
    mouseX: f32,
    mouseY: f32,
    mouseRadius: f32,
    mousePower: f32,
    mouseDx: f32,
    mouseDy: f32,
    mouseButton: u32,
    iterations: u32,
    alpha: f32,
    obstacleCount: u32,
    gravityType: u32,
    blackHoleGravity: f32,
    blackHoleSwirl: f32,
    blackHoleRadius: f32,
    blackHoleRepulsion: f32,
    beta: f32
};

struct GridParams {
    width: f32,
    height: f32,
    cellSize: f32,
    gridCols: u32,
    gridRows: u32,
    maxParticles: u32,
    galtonSpawnerDistance: f32,
    padding: f32
};

struct Obstacle {
    pos: vec2<f32>,
    halfSize: vec2<f32>,
    rotation: f32,
    color: u32,
    pad1: f32,
    pad2: f32
};

struct WallLambda {
    lambdaX: f32,
    lambdaY: f32,
    stiffness: f32,
    padding: f32
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> gridCounters: array<atomic<u32>>; // Not used in solver, but needed for bind group layout
@group(0) @binding(2) var<storage, read_write> gridCells: array<u32>;
@group(0) @binding(3) var<uniform> gridParams: GridParams;
@group(0) @binding(4) var<uniform> simParams: SimParams;
@group(0) @binding(5) var<storage, read> obstacles: array<Obstacle>;
@group(0) @binding(6) var<storage, read_write> wallLambdas: array<WallLambda>;

const PI: f32 = 3.14159265359;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= gridParams.maxParticles) { return; }

    var p = particles[idx];
    if (p.invMass == 0.0) { return; } // Static particle

    // 1. Inertial Target (y)
    // y = x + v * dt + g * dt^2
    // We apply gravity here.
    
    var gravity = vec2<f32>(0.0, simParams.gravity);
    if (simParams.gravityType == 1u) {
        // Center gravity
        let center = vec2<f32>(gridParams.width * 0.5, gridParams.height * 0.5);
        let dir = center - p.pos;
        let dist = length(dir);
        if (dist > 1.0) {
            gravity = normalize(dir) * simParams.gravity;
        }
    }

    // Black Hole Logic
    if (simParams.blackHoleGravity > 0.0) {
        let center = vec2<f32>(gridParams.width * 0.5, gridParams.height * 0.5);
        let dir = center - p.pos;
        let dist = length(dir);
        
        // Pull
        gravity += normalize(dir) * simParams.blackHoleGravity * 100.0;
        
        // Swirl (Tangential)
        let tangent = vec2<f32>(-dir.y, dir.x);
        gravity += normalize(tangent) * simParams.blackHoleSwirl * 50.0;

        // Repulsion (Event Horizon)
        if (dist < simParams.blackHoleRadius) {
             gravity -= normalize(dir) * simParams.blackHoleRepulsion * 500.0;
        }
    }

    // Mouse Interaction (Add to gravity/force)
    if (simParams.mouseButton > 0u) {
        let mousePos = vec2<f32>(simParams.mouseX, simParams.mouseY);
        let dir = mousePos - p.pos;
        let dist = length(dir);
        
        if (dist < simParams.mouseRadius) {
            let strength = (1.0 - dist / simParams.mouseRadius) * simParams.mousePower * 100.0;
            
            if (simParams.mouseButton == 1u) { // Left Click: Pull
                gravity += normalize(dir) * strength;
            } else if (simParams.mouseButton == 3u) { // Right Click: Push
                gravity -= normalize(dir) * strength;
            }
        }
    }

    // Predict Position y
    let dt = simParams.dt;
    let y = p.pos + p.vel * dt + gravity * dt * dt;
    
    // Initialize Solver State
    var x = y; 
    
    // Load Persistent Wall Lambdas
    var wLambda = wallLambdas[idx];
    var k_wall = wLambda.stiffness;
    if (k_wall == 0.0) { k_wall = 100.0; } // Initial stiffness
    var lambda_wall = vec2<f32>(wLambda.lambdaX, wLambda.lambdaY);

    for (var iter = 0u; iter < simParams.iterations; iter++) {
        var dx_total = vec2<f32>(0.0, 0.0);
        var mass_eff = p.mass; 

        // 2. Wall Constraints
        // Floor
        let groundY = gridParams.height - p.radius;
        var C = x.y - groundY;
        if (C > 0.0) { 
             let compliance = 1.0 / (k_wall * dt * dt); 
             let dLambda = (-C - compliance * lambda_wall.y) / (p.invMass + compliance);
             
             let force = -(k_wall * C + lambda_wall.y);
             let correction = force * dt * dt * p.invMass;
             x.y += correction * 0.2; 
             
             lambda_wall.y = max(0.0, lambda_wall.y + k_wall * C); 
             k_wall += simParams.beta * abs(C);
        } else {
             lambda_wall.y = 0.0;
             lambda_wall.y *= 0.9; 
        }

        // Walls (Left/Right/Top)
        if (x.x < p.radius) { x.x = p.radius; }
        if (x.x > gridParams.width - p.radius) { x.x = gridParams.width - p.radius; }
        if (x.y < p.radius) { x.y = p.radius; }


        // 3. Particle-Particle Constraints
        let gridX = i32(x.x / gridParams.cellSize);
        let gridY = i32(x.y / gridParams.cellSize);
        
        for (var r = -1; r <= 1; r++) {
            for (var c = -1; c <= 1; c++) {
                let checkX = gridX + c;
                let checkY = gridY + r;
                
                if (checkX >= 0 && checkX < i32(gridParams.gridCols) && 
                    checkY >= 0 && checkY < i32(gridParams.gridRows)) {
                    
                    let cellIdx = u32(checkY) * gridParams.gridCols + u32(checkX);
                    let count = atomicLoad(&gridCounters[cellIdx]);
                    
                    for (var k = 0u; k < min(count, 127u); k++) {
                        let otherIdxVal = gridCells[cellIdx * 128u + k];
                        
                        if (otherIdxVal != idx) {
                             let other = particles[otherIdxVal];
                             let dir = x - other.pos; 
                             
                             let distSq = dot(dir, dir);
                             let minDist = p.radius + other.radius;
                             
                             if (distSq < minDist * minDist && distSq > 0.001) {
                                 let dist = sqrt(distSq);
                                 let penetration = minDist - dist;
                                 let normal = dir / dist;
                                 
                                 // XPBD Contact
                                 let w1 = p.invMass;
                                 let w2 = other.invMass;
                                 
                                 // Alpha Slider: 1.0 = Rigid (Alpha ~0), 0.0 = Soft (Alpha Large)
                                 // Multiplier 2.0 allows significant softness at lower slider values.
                                 let alphaConf = max(0.000001, (1.0 - simParams.alpha) * 2.0); 

                                 let dLambda = penetration / (w1 + w2 + alphaConf);
                                 
                                 x += normal * dLambda * w1 * 1.0; 
                             }
                        }
                    }
                }
            }
        }
        
        // Obstacle Collisions (Box SDF)
        for (var i = 0u; i < simParams.obstacleCount; i++) {
            let obs = obstacles[i];
            
            // 1. Transform particle position to obstacle's local space
            let relPos = x - obs.pos;
            let c = cos(-obs.rotation);
            let s = sin(-obs.rotation);
            // Local position relative to center of box
            let localPos = vec2<f32>(relPos.x * c - relPos.y * s, relPos.x * s + relPos.y * c);
            
            // 2. Box SDF
            // d = vector from edge to point (positive outside)
            let d = abs(localPos) - obs.halfSize;
            
            // Signed distance to box surface
            // Outside corner: length(max(d, 0.0)) > 0
            // Inside: min(max(d.x, d.y), 0.0) < 0
            let dist = length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0);
            
            // 3. Collision Check: dist < radius
            if (dist < p.radius) {
                // Collision!
                
                // 4. Calculate Normal & Penetration
                var normal = vec2<f32>(0.0, 0.0);
                var penetration = 0.0;
                
                if (dist > 0.0) {
                    // Outside (Corner region)
                    // d is based on abs(localPos), so it's always positive quadrant.
                    // We need to restore the sign to point away from the box center.
                    let rawNormal = normalize(max(d, vec2<f32>(0.0)));
                    
                    // Multiply by sign of localPos
                    normal = rawNormal * sign(localPos);
                    
                    penetration = p.radius - dist;
                } else {
                    // Inside (Deep penetration)
                    penetration = p.radius - dist;
                    
                    // Heuristic for Tall Walls (Galton Buckets):
                    // If the obstacle is much taller than it is wide, assume it's a vertical wall.
                    // Force Horizontal Resolution to prevent vertical ejection/jitter.
                    let aspect = obs.halfSize.y / (obs.halfSize.x + 0.001);
                    
                    if (aspect > 4.0 || d.x > d.y) {
                         // Closer to X edge OR Tall Wall
                         if (localPos.x > 0.0) { normal.x = 1.0; } else { normal.x = -1.0; }
                    } else {
                         // Closer to Y edge
                         if (localPos.y > 0.0) { normal.y = 1.0; } else { normal.y = -1.0; }
                    }
                }
                
                // 5. Rotate normal back to world space
                let worldNormal = vec2<f32>(
                     normal.x * c + normal.y * s,
                    -normal.x * s + normal.y * c
                );
                
                // 6. Apply Position Correction (Tuned)
                // Stiffness 0.5: Firm enough to resist penetration, soft enough to avoid explosions
                x += worldNormal * penetration * 0.5;
                
                // 7. Friction (Removed to prevent sticking)
                // Walls should be slippery
            }
        }
    }

    // 4. Final Update
    // v = (x - x_prev) / dt
    var v_new = (x - p.pos) / dt;

    // Apply Restitution to Velocity (Floor Only for simplicity & stability)
    // If we hit the floor, we want to reflect the Y velocity component
    let groundY = gridParams.height - p.radius;
    if (x.y >= groundY - 1.0 && v_new.y > 0.0) {
         // We are at floor and moving down (into it? no we projected out)
         // Check pre-correction velocity? No.
         // Simply: if we are clamping to floor, invert Y velocity.
         // But we already updated x to be ON the floor. v_new.y is effectively 0 (or small correction).
         // We need the IMPACT velocity.
         // v_pred = p.vel + g*dt.
         // If v_pred was down, we reflect it.
         
         // Simple Restitution Hack:
         // If we are effectively "resting" or colliding:
         // Reflect the velocity relative to the normal.
         // v_new = v_new - (1 + e) * (v_new . n) * n
         // n = (0, -1) (floor normal points UP)
         
         // Better: Just check if we are very close to floor.
         // And if the previous velocity was downwards.
         
         // Actually, let's just bias the damping.
         // But user wants "Restitution" (Bounciness).
         // If e = 1, we shouldn't lose energy on bounce.
         
         // With PBD, 'v_new' is derived from position change.
         // This kills energy automatically (damping).
         // To add restitution, we must explicitly modify v_new AFTER calculation but BEFORE writeback.
         
         // Check if we hit floor this frame
         // p.pos.y was < ground, x.y is now ground.
         // Or close to it.
         if (x.y > groundY - 2.0) {
            // We are on ground.
            // Invert the part of velocity that pushed us down?
            // Actually, v_new.y is mostly 0 now because x.y ~ p.pos.y (if we were already close)
            // If we FELL into the floor, p.pos.y was high, x.y is low. v_new.y is large positive (down).
            // Wait, x.y is CLAMPED to groundY.
            
            // If we fell:
            // p.pos.y = 500. x = 600 (predicted). Clamped to 500.
            // dx = 0. v_new = 0. Energy lost!
            
            // We need to preserve the incoming velocity magnitude.
            // v_in = p.vel + g*dt
            // If v_in.y > 0 (moving down), and we hit floor:
            // v_out.y = -v_in.y * restitution
            
            let v_in_y = p.vel.y + simParams.gravity * dt;
            if (v_in_y > 0.1) { // Threshold
                 v_new.y = -v_in_y * simParams.restitution;
            }
         }
    }
    
    // Apply Damping
    p.vel = v_new * simParams.damping;
    p.pos = x;
    
    // Store Wall Lambdas
    wLambda.lambdaX = 0.0; 
    wLambda.lambdaY = lambda_wall.y;
    wLambda.stiffness = k_wall;
    wallLambdas[idx] = wLambda;

    particles[idx] = p;
}
