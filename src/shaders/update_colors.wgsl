struct Particle {
    pos: vec2<f32>,
    vel: vec2<f32>,
    radius: f32,
    color: u32,
    mass: f32,
    invMass: f32,
    padding: vec2<f32>
};

struct ColorParams {
    startIndex: u32,
    count: u32,
    padding1: u32,
    padding2: u32
};

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read> newColors: array<u32>;
@group(0) @binding(2) var<uniform> params: ColorParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    if (i >= params.count) {
        return;
    }
    
    // Calculate target index in particle buffer
    let particleIdx = params.startIndex + i;
    
    // Safety check
    if (particleIdx >= arrayLength(&particles)) {
        return;
    }

    // Update only the color field
    // newColors is 0-indexed relative to the update batch
    particles[particleIdx].color = newColors[i];
}
