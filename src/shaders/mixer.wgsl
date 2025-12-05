struct Particle {
    pos: vec2<f32>,
    vel: vec2<f32>,
    radius: f32,
    color: u32,
    mass: f32,
    invMass: f32,
    padding: vec2<f32>
};

struct MixerParams {
    width: f32,
    height: f32,
    time: f32,
    power: f32,
    mode: u32, // 0=Vortex, 1=Vertical, 2=Horizontal, 3=Turbulence, 4=Corners
    count: u32,
    pad1: u32,
    pad2: u32
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: MixerParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= params.count) { return; }

    var p = particles[idx];
    
    // Skip static particles
    if (p.invMass == 0.0) { return; }

    let cx = params.width * 0.5;
    let cy = params.height * 0.5;
    let x = p.pos.x;
    let y = p.pos.y;
    
    var force = vec2<f32>(0.0, 0.0);
    let power = params.power;

    switch (params.mode) {
        case 0u: { // Vortex
            let dx = cx - x;
            let dy = cy - y;
            let dist = sqrt(dx*dx + dy*dy);
            if (dist > 10.0) {
                // Tangential force (Rotation)
                let tx = -dy / dist;
                let ty = dx / dist;
                
                // Radial force (Pull in)
                let rx = dx / dist;
                let ry = dy / dist;

                force = vec2<f32>(
                    tx * power * 0.8 + rx * power * 0.2,
                    ty * power * 0.8 + ry * power * 0.2
                );
            }
        }
        case 1u: { // Vertical Shear
            // Left side moves UP, Right side moves DOWN
            var dirY = 1.0;
            if (x < cx) { dirY = -1.0; }
            
            force.y = dirY * power;
            force.x = sin(y * 0.1 + params.time * 5.0) * power * 0.2;
        }
        case 2u: { // Horizontal Shear
            // Top moves RIGHT, Bottom moves LEFT
            var dirX = -1.0;
            if (y < cy) { dirX = 1.0; }
            
            force.x = dirX * power;
            force.y = sin(x * 0.1 + params.time * 5.0) * power * 0.2;
        }
        case 3u: { // Turbulence (Cellular Flow)
            let scale = 0.03;
            let t = params.time * 2.0;
            
            force.x = sin(y * scale + t) * power;
            force.y = sin(x * scale - t) * power;
            
            force.x += sin(y * 0.1 - t * 2.0) * power * 0.5;
            force.y += cos(x * 0.1 + t * 2.0) * power * 0.5;
        }
        case 4u: { // Corners
            let phase = params.time * 2.0;
            let cornerIdx = u32(floor(phase)) % 4u;
            
            var tx = 0.0;
            var ty = 0.0;
            
            if (cornerIdx == 0u) { tx = params.width; ty = 0.0; }
            else if (cornerIdx == 1u) { tx = params.width; ty = params.height; }
            else if (cornerIdx == 2u) { tx = 0.0; ty = params.height; }
            else { tx = 0.0; ty = 0.0; } // 3u
            
            let dx = tx - x;
            let dy = ty - y;
            let dist = sqrt(dx*dx + dy*dy);
            
            if (dist > 10.0) {
                force.x = (dx / dist) * power;
                force.y = (dy / dist) * power;
            }
        }
        case 5u: { // Smash (Center Pull)
            let dx = cx - x;
            let dy = cy - y;
            let dist = sqrt(dx*dx + dy*dy);
            
            if (dist > 10.0) {
                // Strong pull to center
                force.x = (dx / dist) * power * 5.0;
                force.y = (dy / dist) * power * 5.0;
            }
        }
        default: {}
    }

    // Apply force to velocity (F = ma, assume dt=1/60 roughly for visual effect)
    // We just add directly to velocity for "mixer" feel
    let dt = 0.016;
    p.vel += force * dt;

    particles[idx] = p;
}
