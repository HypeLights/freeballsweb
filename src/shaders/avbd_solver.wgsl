struct Particle {
    pos: vec2<f32>,
    vel: vec2<f32>,
    radius: f32,
    color: u32,
    mass: f32,
    invMass: f32,
    padding: vec2<f32>
};

struct GridParams {
    width: f32,
    height: f32,
    cellSize: f32,
    cols: u32,
    rows: u32,
    maxParticles: u32
};

struct SimParams {
    dt: f32,
    gravity: f32,
    damping: f32,
    restitution: f32,
    mousePos: vec2<f32>,
    mouseRadius: f32,
    mousePower: f32,
    mouseDelta: vec2<f32>,
    mouseButton: u32,
    iterations: u32,
    alpha: f32, // Softness parameter
    obstacleCount: u32,
    gravityType: u32, // 0 = Down, 1 = Center
    blackHoleGravity: f32,
    blackHoleSwirl: f32,
    blackHoleRadius: f32,
    blackHoleRepulsion: f32
};

struct Obstacle {
    pos: vec2<f32>,
    halfSize: vec2<f32>,
    rotation: f32,
    padding: vec3<f32> // Align to 32 bytes (2+2+1+3 = 8 floats)
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> gridCounters: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read> gridCells: array<u32>;
@group(0) @binding(3) var<uniform> gridParams: GridParams;
@group(0) @binding(4) var<uniform> simParams: SimParams;
@group(0) @binding(5) var<storage, read> obstacles: array<Obstacle>;

const MAX_PER_CELL: u32 = 256;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
    let index = GlobalInvocationID.x;
    if (index >= gridParams.maxParticles) {
        return;
    }

    var p = particles[index];
    
    // Skip static particles
    if (p.invMass == 0.0) {
        return;
    }

    let dt = simParams.dt;
    let mass = p.mass; // Assuming mass = 1/invMass, or stored. Let's use 1.0 for now if not stored.
    // Actually p.mass is in struct.
    
    // --- Pre-Solve Restitution (Momentum Transfer) ---
    // Apply elastic impulses to velocity BEFORE predicting position 'y'.
    // This ensures the solver tries to reach the 'bounced' position.
    let cellX = i32(p.pos.x / gridParams.cellSize);
    let cellY = i32(p.pos.y / gridParams.cellSize);

    for (var cy = -1; cy <= 1; cy++) {
        for (var cx = -1; cx <= 1; cx++) {
            let neighborX = cellX + cx;
            let neighborY = cellY + cy;
            
            if (neighborX >= 0 && neighborX < i32(gridParams.cols) && neighborY >= 0 && neighborY < i32(gridParams.rows)) {
                let cellIndex = u32(neighborY) * gridParams.cols + u32(neighborX);
                let count = min(atomicLoad(&gridCounters[cellIndex]), MAX_PER_CELL);
                
                for (var i = 0u; i < count; i++) {
                    let otherIdx = gridCells[cellIndex * MAX_PER_CELL + i];
                    if (otherIdx != index) {
                        let other = particles[otherIdx];
                        
                        let dx = p.pos.x - other.pos.x;
                        let dy = p.pos.y - other.pos.y;
                        let distSq = dx * dx + dy * dy;
                        let rSum = p.radius + other.radius;
                        
                        if (distSq < rSum * rSum && distSq > 0.00001) {
                            let dist = sqrt(distSq);
                            let dir = vec2<f32>(dx, dy) / dist;
                            
                            // Relative Velocity
                            let vRel = p.vel - other.vel;
                            let vRelNorm = dot(vRel, dir);
                            
                            // Restitution Impulse
                            if (vRelNorm < 0.0) {
                                let e = simParams.restitution;
                                let combinedInvMass = p.invMass + other.invMass;
                                // Standard Restitution: J = -(1+e) * vRel / (1/m1 + 1/m2)
                                let j = -(1.0 + e) * vRelNorm / combinedInvMass;
                                
                                // Apply impulse to self
                                p.vel += j * dir * p.invMass;
                            }
                        }
                    }
                }
            }
        }
    }

    // --- AVBD Step 1: Predict Position (y) ---
    // y = x + v * dt + a * dt^2
    // We use the updated velocity (with bounce) to predict y.
    // dt is already declared above.
    let dt2 = dt * dt;
    let a_ext = vec2<f32>(0.0, simParams.gravity); // Gravity (Removed 10x multiplier)
    
    var y = p.pos + p.vel * dt + a_ext * dt2;
    
    // Mouse Interaction (Add to 'y' as external force/acceleration)
    if (simParams.mouseButton > 0u) {
        let dx = simParams.mousePos.x - p.pos.x;
        let dy = simParams.mousePos.y - p.pos.y;
        let distSq = dx * dx + dy * dy;
        let rSq = simParams.mouseRadius * simParams.mouseRadius;
        
        if (distSq < rSq && distSq > 0.001) {
            let dist = sqrt(distSq);
            let dir = vec2<f32>(dx, dy) / dist;
            // Quadratic falloff for "fatter" influence (stronger further out)
            let d = dist / simParams.mouseRadius;
            let falloff = 1.0 - d * d;
            
            if (simParams.mouseButton == 1u) {
                // Drag: Add to acceleration (God Mode: Ignore mass)
                let attractAcc = dir * simParams.mousePower * 30.0 * falloff;
                y += attractAcc * dt2;
                
                // Mouse Velocity Drag (Restored drag effect)
                let dragAcc = simParams.mouseDelta * simParams.mousePower * 0.005 * falloff; 
                y += dragAcc * dt; 
            } else if (simParams.mouseButton == 3u) {
                // Repel (Stronger, God Mode)
                let repelAcc = -dir * simParams.mousePower * 100.0 * falloff;
                y += repelAcc * dt2;
            }
        }
    }
    // --- Velocity Clamping (Anti-Tunneling) ---
    // Limit the maximum distance traveled in one substep to a fraction of the radius
    let maxDist = p.radius * 0.9;
    let travel = y - p.pos;
    let travelLen = length(travel);
    if (travelLen > maxDist) {
        y = p.pos + (travel / travelLen) * maxDist;
    }

    // Initialize x (Optimization Variable)
    // Warm start with y is usually good
    var x = y; 
    
    // --- AVBD Step 2: Primal-Dual Loop ---
    // We solve H * dx = f
    // f = -M/dt^2 * (x - y) + f_con
    // H = M/dt^2 + H_con
    
    let inertiaStiffness = p.mass / dt2;
    
    // Stiffness Ramping Parameters
    // inertiaStiffness = M/dt^2.
    // To prevent crushing, we need k >> inertiaStiffness.
    // Compromise: 5000x (Strong but stable)
    let alpha = simParams.alpha;
    let baseStiffness = inertiaStiffness * 5000.0 * alpha;
    
    var k_wall = baseStiffness; 
    var k_col = baseStiffness;
    let beta = baseStiffness * 0.1; // Smoother ramping
    
    for (var iter = 0u; iter < simParams.iterations; iter++) {
        var f = vec2<f32>(0.0, 0.0);
        var H = 0.0; // Scalar Hessian (Isotropic)
        
        // 1. Inertial Term
        // f_inertial = -M/dt^2 * (x - y)
        // H_inertial = M/dt^2
        f += -inertiaStiffness * (x - y);
        H += inertiaStiffness;
        
        // 2. Wall Constraints
        let r = p.radius;
        let width = gridParams.width;
        let height = gridParams.height;
        
        // Helper to add constraint
        // C(x) <= 0 is satisfied. C(x) > 0 is violation.
        // We define C(x) as penetration depth (positive = violation)
        
        // Left Wall: x < r -> C = r - x
        if (x.x < r) {
            let C = r - x.x;
            let grad = vec2<f32>(-1.0, 0.0);
            f -= k_wall * C * grad;
            H += k_wall; 
            k_wall += beta * C; 
        }
        // Right Wall: x > w - r -> C = x - (w - r)
        if (x.x > width - r) {
            let C = x.x - (width - r);
            let grad = vec2<f32>(1.0, 0.0);
            f -= k_wall * C * grad;
            H += k_wall;
            k_wall += beta * C;
        }
        // Floor: y > h - r -> C = y - (h - r)
        if (x.y > height - r) {
            let C = x.y - (height - r);
            let grad = vec2<f32>(0.0, 1.0);
            f -= k_wall * C * grad;
            H += k_wall;
            k_wall += beta * C;
        }
        // Ceiling: y < r -> C = r - y
        if (x.y < r) {
            let C = r - x.y;
            let grad = vec2<f32>(0.0, -1.0);
            f -= k_wall * C * grad;
            H += k_wall;
            k_wall += beta * C;
        }

        // 3. Obstacle Collisions (Rectangles)
        // Iterate over active obstacles only
        let numObstacles = simParams.obstacleCount;
        for (var i = 0u; i < numObstacles; i++) {
            let obs = obstacles[i];
            
            // Transform particle to local space of obstacle
            let relPos = x - obs.pos;
            let c = cos(-obs.rotation);
            let s = sin(-obs.rotation);
            let localPos = vec2<f32>(
                relPos.x * c - relPos.y * s,
                relPos.x * s + relPos.y * c
            );
            
            // Box SDF
            // d = length(max(q, 0)) + min(max(q.x, q.y), 0)
            // q = abs(p) - b
            let q = abs(localPos) - (obs.halfSize + vec2<f32>(r, r)); // Expand box by radius
            
            // We only care if inside (dist <= 0)
            // In our constraint formulation, C > 0 is violation.
            // SDF returns negative inside. So C = -SDF.
            
            // Optimized check: if q.x < 0 and q.y < 0, we are inside
            if (q.x < 0.0 && q.y < 0.0) {
                // Inside!
                // Find closest edge
                // Since we are inside, max(q, 0) is 0.
                // dist = max(q.x, q.y) (negative value)
                
                var localNormal = vec2<f32>(0.0, 0.0);
                var dist = 0.0;
                
                if (q.x > q.y) {
                    dist = q.x;
                    // Normal points outwards. If localPos.x > 0, normal is (1,0), else (-1,0)
                    localNormal = vec2<f32>(sign(localPos.x), 0.0);
                } else {
                    dist = q.y;
                    localNormal = vec2<f32>(0.0, sign(localPos.y));
                }
                
                // Transform normal back to world space
                // Rotate by +obs.rotation
                let wc = cos(obs.rotation);
                let ws = sin(obs.rotation);
                let worldNormal = vec2<f32>(
                    localNormal.x * wc - localNormal.y * ws,
                    localNormal.x * ws + localNormal.y * wc
                );
                
                // Constraint Violation C = -dist (since dist is negative inside)
                let C = -dist;
                let grad = -worldNormal; // Gradient of C w.r.t x is -normal (pushes in direction of normal)
                // Wait, C = penetration. Force should push opposite to penetration?
                // If C > 0 (violation), we want to reduce C.
                // x_new = x - C * grad / |grad|^2 ?
                // Force direction: -grad * C.
                // If normal points OUT of box, we want to push along normal.
                // So force = k * C * normal.
                // grad = -normal.
                // f = -k * C * grad = -k * C * (-normal) = k * C * normal. Correct.
                
                f -= k_wall * C * grad;
                H += k_wall;
                k_wall += beta * C;
            }
        }

        // 3. Particle Collisions (Spatial Hash)
        let cellX = i32(x.x / gridParams.cellSize);
        let cellY = i32(x.y / gridParams.cellSize);

        for (var cy = -1; cy <= 1; cy++) {
            for (var cx = -1; cx <= 1; cx++) {
                let neighborX = cellX + cx;
                let neighborY = cellY + cy;
                
                if (neighborX >= 0 && neighborX < i32(gridParams.cols) && neighborY >= 0 && neighborY < i32(gridParams.rows)) {
                    let cellIndex = u32(neighborY) * gridParams.cols + u32(neighborX);
                    let count = min(atomicLoad(&gridCounters[cellIndex]), MAX_PER_CELL);
                    
                    for (var i = 0u; i < count; i++) {
                        let otherIdx = gridCells[cellIndex * MAX_PER_CELL + i];
                        if (otherIdx != index) {
                            let other = particles[otherIdx];
                            
                            // Distance constraint
                            // C(x) = (r1 + r2) - dist > 0
                            let dx = x.x - other.pos.x; // Use other.pos (Jacobi style)
                            let dy = x.y - other.pos.y;
                            let distSq = dx * dx + dy * dy;
                            let rSum = p.radius + other.radius;
                            
                            if (distSq < rSum * rSum && distSq > 0.00001) {
                                let dist = sqrt(distSq);
                                let C = rSum - dist;
                                let dir = vec2<f32>(dx, dy) / dist; // Gradient of dist w.r.t x
                                // Gradient of C w.r.t x is -dir
                                let grad = -dir; 
                                
                                // Actually, let's define C as penetration: C = rSum - dist
                                // We want C <= 0. So violation is C > 0.
                                // Force direction should push x away.
                                // f_con = -k * C * dir
                                
                                // Normal Force (Constraint)
                                let fNormal = -k_col * C * grad;
                                f += fNormal;
                                H += k_col; // Anisotropic stiffness
                                
                                // --- Restitution (Bounce) ---
                                // Correct Impulse-based collision response:
                                // J = -(1+e) * vRel / (1/m1 + 1/m2)
                                // Force = J / dt
                                // PROBLEM: High stiffness (k_col) suppresses this force in the solver (dx = f/H).
                                // We need to scale the force so that dx corresponds to the bounce displacement.
                                // dx_target = J * dt / mass
                                // f_required = dx_target * H  ~= dx_target * k_col
                                // f_current = J / dt
                                // Ratio = (J * dt / mass * k_col) / (J / dt) = k_col * dt^2 / mass = k_col / inertiaStiffness
                                
                                // Ramp stiffness based on violation
                                // k_col += beta * C; 
                                // Note: Ramping inside neighbor loop might be aggressive, but valid for AVBD
                            }
                        }
                    }
                }
            }
        }
        
        // 4. Update x (Component-wise division for Diagonal Hessian)
        // x_new = x + H^-1 * f
        // Note: f calculated above is the residual force? 
        // Wait, Newton step: H * dx = -Gradient(E)
        // Gradient(E) = f_total (forces are negative gradient)
        // So H * dx = f_total
        // dx = H^-1 * f_total
        // x_new = x + dx
        
        // Wait, 'f' accumulated above:
        // Inertial: -k * (x - y) -> Force pulling towards y
        // Constraint: -k * C * grad -> Force pushing out of constraint
        // These are Forces.
        // So yes, dx = f / H
        
        x += f / H;
    }
    
    // --- Final Update ---
    // Update Velocity
    p.vel = (x - p.pos) / dt; // v = (x - x^t) / dt
    // 1. Prediction (y = x + v * dt)
    // Apply Gravity
    var gravityForce = vec2<f32>(0.0, simParams.gravity);
    
    if (simParams.gravityType == 1u) {
        // Central Gravity (Black Hole)
        let center = vec2<f32>(gridParams.width * 0.5, gridParams.height * 0.5);
        let toCenter = center - p.pos;
        let dist = length(toCenter);
        if (dist > 10.0) {
            let dir = normalize(toCenter);
            // F = G * M / r^2. 
            // Newtonian Gravity (Keplerian orbits)
            // Constant tuned for G=4.0 and typical screen distances (100-500px)
            // Use simParams.blackHoleGravity instead of simParams.gravity
            // SWITCH BACK TO 1/r GRAVITY for better screen containment
            // F = G / r
            // This creates a "Logarithmic Potential" where orbital velocity is constant.
            // Much better for keeping particles on screen.
            let force = dir * (simParams.blackHoleGravity * 5000000.0) / (dist + 10.0); 
            
            // Tangential "Swirl" Force
            // Hybrid: Constant base (for outer) + Strong 1/r (for inner)
            // "Much stronger toward inside"
            let tangent = vec2<f32>(-dir.y, dir.x);
            let baseSwirl = 100.0;
            let innerSwirl = 200000.0 / (dist + 10.0);
            let swirl = tangent * (simParams.blackHoleSwirl * (baseSwirl + innerSwirl));

            // Repulsion Force (Restored & Boosted)
            // User said it "is just more gravity" -> Fixed direction to be OUTWARDS (-dir).
            // F = k / r (1/r falloff to match gravity range)
            let repulsion = -dir * (simParams.blackHoleRepulsion * 20000000.0) / (dist + 10.0);

            gravityForce = force + swirl + repulsion;
        } else {
            // Inside Event Horizon: Slingshot!
            // Apply massive gravity to accelerate them through
             let force = normalize(toCenter) * (simParams.blackHoleGravity * 5000000.0) / (max(dist, 10.0) + 10.0);
             gravityForce = force;
        }
    }
    p.vel = p.vel + gravityForce * dt;
    p.pos = x;
    
    // Damping (Global)
    p.vel *= pow(simParams.damping, dt * 60.0);
    
    // Boundary Restitution (Bounce)
    // Explicit bounce check on velocity since AVBD is position-based
    let r = p.radius;
    let width = gridParams.width;
    let height = gridParams.height;
    let rest = simParams.restitution;

    if (p.pos.x <= r && p.vel.x < 0.0) { p.vel.x *= -rest; }
    if (p.pos.x >= width - r && p.vel.x > 0.0) { p.vel.x *= -rest; }
    if (p.pos.y <= r && p.vel.y < 0.0) { p.vel.y *= -rest; }
    if (p.pos.y >= height - r && p.vel.y > 0.0) { p.vel.y *= -rest; }

    // Hard Position Clamping (Safety Net)
    p.pos.x = clamp(p.pos.x, r, width - r);
    p.pos.y = clamp(p.pos.y, r, height - r);

    particles[index] = p;
}
