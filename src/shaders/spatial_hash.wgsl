struct Particle {
    pos: vec2<f32>,
    vel: vec2<f32>,
    radius: f32,
    color: u32, // packed color
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

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> gridCounters: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> gridCells: array<u32>; // Stores particle indices
@group(0) @binding(3) var<uniform> params: GridParams;
@group(0) @binding(4) var<uniform> simParams: SimParams;

const MAX_PER_CELL: u32 = 128;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) {
    let index = GlobalInvocationID.x;
    if (index >= params.maxParticles) {
        return;
    }

    // EXCLUDE BLACK HOLE (Index 0 in Gravity Type 1)
    if (simParams.gravityType == 1u && index == 0u) {
        return;
    }

    let p = particles[index];
    
    // Calculate grid cell
    let x = u32(clamp(p.pos.x / params.cellSize, 0.0, f32(params.cols - 1u)));
    let y = u32(clamp(p.pos.y / params.cellSize, 0.0, f32(params.rows - 1u)));
    let cellIndex = y * params.cols + x;

    // Add to grid
    let count = atomicAdd(&gridCounters[cellIndex], 1u);
    if (count < MAX_PER_CELL) {
        let bufferIndex = cellIndex * MAX_PER_CELL + count;
        gridCells[bufferIndex] = index;
    }
}
