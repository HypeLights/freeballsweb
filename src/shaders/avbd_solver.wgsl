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
            let strength = (1.0 - dist / simParams.mouseRadius) * simParams.mousePower * 10.0;
            
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
    var x = y; // Start at inertial target (or warm start?)
    // AVBD Paper: x starts at y, then we solve.
    // Actually, for warm start, we might want to start at x_prev + v*dt? That IS y.
    
    // Load Persistent Wall Lambdas
    var wLambda = wallLambdas[idx];
    var k_wall = wLambda.stiffness;
    if (k_wall == 0.0) { k_wall = 100.0; } // Initial stiffness
    var lambda_wall = vec2<f32>(wLambda.lambdaX, wLambda.lambdaY);

    // Warm Start: Apply previous frame's wall force immediately?
    // In AVBD, we solve H dx = f. The force f includes lambda.
    // But here we are doing an iterative update of x directly.
    // x_new = (x_inertial + ... forces ...) / mass_term
    
    // We will use a "Position-Based" approach with AVBD augmentation.
    // Minimize 0.5*M/dt^2 ||x - y||^2 + E(x)
    // Gradient: M/dt^2 (x - y) + k C gradC + lambda gradC = 0
    // x = y - (dt^2/M) * (k C + lambda) gradC
    
    // We iterate this.
    
    for (var iter = 0u; iter < simParams.iterations; iter++) {
        var dx_total = vec2<f32>(0.0, 0.0);
        var mass_eff = p.mass; // Effective mass (simplification)

        // 2. Wall Constraints
        // C(x) = x - clamp(x, min, max)
        // We handle 4 walls.
        
        // Floor
        let groundY = gridParams.height - p.radius;
        var C = x.y - groundY;
        if (C > 0.0) { // Penetration (y is down)
             // Gradient is (0, 1)
             // Force mag = k * C + lambda
             // We want to push UP (negative Y)
             // Wait, C > 0 means we are BELOW the floor.
             // We need to move to groundY.
             // Correction = -C
             
             // AVBD Update:
             // lambda_new = lambda + k * C
             // k_new = k + beta * C
             
             // Apply correction to x
             // x -= (k * C + lambda) / (M/dt^2 + k) * gradC
             // This is the Newton Step.
             
             // Simplified PBD-style with AVBD terms:
             // The "stiffness" k acts as a weight.
             // If k is huge, we move exactly to surface.
             
             // Let's use the explicit update rule from the paper:
             // x = x - H^-1 * grad E
             // H approx = M/dt^2 + k
             // grad E = M/dt^2(x-y) + k*C + lambda
             
             // But we are doing this iteratively.
             // Let's just accumulate the correction vector.
             
             // For walls, it's simpler.
             // Just project?
             // No, we need the "stickiness" of lambda for friction/stacking.
             // But for a simple floor, hard constraint is fine.
             // AVBD is specifically for "Hard Constraints" that VBD fails at.
             
             // Let's implement the ramping logic.
             let compliance = 1.0 / (k_wall * dt * dt); // alpha in XPBD terms
             let dLambda = (-C - compliance * lambda_wall.y) / (p.invMass + compliance);
             
             // Update Position
             // x.y += dLambda * p.invMass; // This is XPBD
             
             // AVBD way:
             // Update x based on current k and lambda.
             // Then update k and lambda.
             
             let force = -(k_wall * C + lambda_wall.y);
             // Apply force to position
             // F = ma => a = F/m => dx = 0.5 * a * dt^2 ? No, implicit Euler.
             // dx = force * dt^2 / M
             
             let correction = force * dt * dt * p.invMass;
             // Dampen correction to avoid instability
             x.y += correction * 0.2; 
             
             // Update Duals (at end of iter, but we do it here for walls)
             lambda_wall.y = max(0.0, lambda_wall.y + k_wall * C); // Clamp to >= 0 (push only)
             k_wall += simParams.beta * abs(C);
        } else {
             lambda_wall.y = 0.0; // Reset if not touching? Or keep for warm start?
             // If we separate, lambda should decay.
             lambda_wall.y *= 0.9; 
        }

        // Walls (Left/Right/Top) - Simplified hard constraints for now to save perf
        x.x = max(p.radius, min(gridParams.width - p.radius, x.x));
        x.y = max(p.radius, x.y); // Top

        // 3. Particle-Particle Constraints (Spatial Hash)
        // We can't store lambdas for these, so we use standard XPBD/VBD for collisions.
        // Or we use a high fixed stiffness.
        
        let gridX = i32(x.x / gridParams.cellSize);
        let gridY = i32(x.y / gridParams.cellSize);
        
        for (var r = -1; r <= 1; r++) {
            for (var c = -1; c <= 1; c++) {
                let checkX = gridX + c;
                let checkY = gridY + r;
                
                if (checkX >= 0 && checkX < i32(gridParams.gridCols) && 
                    checkY >= 0 && checkY < i32(gridParams.gridRows)) {
                    
                    let cellIdx = u32(checkY) * gridParams.gridCols + u32(checkX);
                    let startIdx = gridCells[cellIdx * 128u]; // Counter is at 0? No, structure is different.
                    // gridCells buffer is flat array?
                    // AVBDSolver.js: maxGridCells * 128 * 4 bytes.
                    // It's a flat array of u32.
                    // Layout: [count, p1, p2, p3...] for each cell?
                    // No, usually we use a separate counter buffer and a flat index buffer.
                    // Let's check AVBDSolver.js createBuffers.
                    // gridCellsBuffer size: maxGridCells * 128 * 4.
                    // It seems it stores up to 128 particles per cell.
                    // But how do we know the count?
                    // gridCountersBuffer stores the count.
                    
                    let count = atomicLoad(&gridCounters[cellIdx]);
                    
                    // Iterate particles in cell
                    for (var k = 0u; k < min(count, 127u); k++) {
                        let otherIdx = gridCells[cellIdx * 128u + k + 1u]; // +1 because index 0 might be count? 
                        // Wait, gridCounters is separate.
                        // So gridCells is just the list.
                        // But we need to know how it was filled.
                        // spatial_hash.wgsl fills it.
                        // Assuming gridCells[cellIdx * 128 + k] is the particle index.
                        
                        let otherIdxVal = gridCells[cellIdx * 128u + k];
                        
                        if (otherIdxVal != idx) {
                             let other = particles[otherIdxVal];
                             let dir = x - other.pos; // Use current pos of other? Or predicted?
                             // Ideally predicted, but we only have 'pos' in buffer.
                             // 'pos' in buffer is x_prev (start of frame).
                             // We should use 'other.pos + other.vel * dt' (Inertial target)
                             // Or just 'other.pos' if we assume it hasn't moved much.
                             // Using 'other.pos' (start of frame) is Jacobi-style.
                             
                             let distSq = dot(dir, dir);
                             let minDist = p.radius + other.radius;
                             
                             if (distSq < minDist * minDist && distSq > 0.001) {
                                 let dist = sqrt(distSq);
                                 let penetration = minDist - dist;
                                 let normal = dir / dist;
                                 
                                 // XPBD Contact
                                 // w1 = invMass1, w2 = invMass2
                                 // alpha = 1 / (k * dt^2)
                                 // lambda = -C / (w1 + w2 + alpha)
                                 // dx = w1 * lambda * n
                                 
                                 let w1 = p.invMass;
                                 let w2 = other.invMass;
                                 let alpha = 0.001; // Compliance
                                 
                                 let dLambda = penetration / (w1 + w2 + alpha);
                                 
                                 // Apply 100% of correction to self (Jacobi)
                                 // Because we can't move the other particle (read-only effectively)
                                 // We assume the other particle will move itself in its own thread.
                                 // So we move by w1 * dLambda.
                                 // But since we both move, we effectively resolve it.
                                 
                                 x += normal * dLambda * w1 * 1.0; // 1.0 is relaxation factor
                                 
                                 // Friction?
                                 // Tangent velocity
                                 // ...
                             }
                        }
                    }
                }
            }
        }
        
        // Obstacle Collisions
        for (var i = 0u; i < simParams.obstacleCount; i++) {
            let obs = obstacles[i];
            // Simple Box SDF
            // Rotate point into box space
            let relPos = x - obs.pos;
            let c = cos(-obs.rotation);
            let s = sin(-obs.rotation);
            let localPos = vec2<f32>(relPos.x * c - relPos.y * s, relPos.x * s + relPos.y * c);
            
            let d = abs(localPos) - obs.halfSize - vec2<f32>(p.radius);
            let dist = length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0);
            
            if (dist < 0.0) {
                // Collision
                // Gradient?
                // Closest point on box
                let clamped = clamp(localPos, -(obs.halfSize + p.radius), (obs.halfSize + p.radius));
                // This is rough.
                
                // Just push out along normal
                // ...
                // For now, simple repulsion
                let normal = normalize(relPos); // Approx
                x -= normal * dist;
            }
        }
    }

    // 4. Final Update
    // v = (x - x_prev) / dt
    let v_new = (x - p.pos) / dt;
    
    // Apply Damping
    p.vel = v_new * simParams.damping;
    p.pos = x;
    
    // Store Wall Lambdas
    wLambda.lambdaX = 0.0; // Not used yet
    wLambda.lambdaY = lambda_wall.y;
    wLambda.stiffness = k_wall;
    wallLambdas[idx] = wLambda;

    particles[idx] = p;
}
