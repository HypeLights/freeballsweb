struct VertexInput {
    @builtin(vertex_index) vertexIndex: u32,
    @builtin(instance_index) instanceIndex: u32
};

struct Particle {
    pos: vec2<f32>,
    vel: vec2<f32>,
    radius: f32,
    color: u32,
    mass: f32,
    invMass: f32,
    padding: vec2<f32>
};

struct RenderParams {
    width: f32,
    height: f32,
    bloomEnabled: f32,
    aaEnabled: f32,
    bloomThreshold: f32, 
    bloomStrength: f32,
    bloomRadius: f32,
    pad1: f32
};

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: RenderParams;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) uv: vec2<f32>,
    @location(2) shape: f32
};

fn unpackColor(packedColor: u32) -> vec4<f32> {
    let u = packedColor;
    let r = f32((u >> 16u) & 0xFFu) / 255.0;
    let g = f32((u >> 8u) & 0xFFu) / 255.0;
    let b = f32(u & 0xFFu) / 255.0;
    return vec4<f32>(r, g, b, 1.0);
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    let p = particles[in.instanceIndex];
    
    // Quad vertices (triangle strip)
    var pos = vec2<f32>(0.0, 0.0);
    var uv = vec2<f32>(0.0, 0.0);
    
    // Expand quad for bloom glow
    // Increased to 8.0 to prevent "square" clipping of the glow for large particles
    let expansion = 8.0; 
    
    if (in.vertexIndex == 0u) { pos = vec2<f32>(-expansion, -expansion); uv = vec2<f32>(0.0, 1.0); }
    else if (in.vertexIndex == 1u) { pos = vec2<f32>(expansion, -expansion); uv = vec2<f32>(1.0, 1.0); }
    else if (in.vertexIndex == 2u) { pos = vec2<f32>(-expansion, expansion); uv = vec2<f32>(0.0, 0.0); }
    else if (in.vertexIndex == 3u) { pos = vec2<f32>(expansion, expansion); uv = vec2<f32>(1.0, 0.0); }
    
    // Scale by radius
    let worldPos = p.pos + pos * p.radius;
    
    // Transform to clip space [-1, 1]
    let x = (worldPos.x / params.width) * 2.0 - 1.0;
    let y = -((worldPos.y / params.height) * 2.0 - 1.0); // Flip Y
    
    var out: VertexOutput;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.color = unpackColor(p.color);
    out.uv = uv; // UVs are now 0-1 across the EXPANDED quad
    out.shape = p.padding.x; // 0 = Circle, 1 = Square
    
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Re-map UVs to center 0.5, 0.5
    // The quad is 8x size (expansion=8.0) -> Total width 16.0 radii
    // UV range 0.0-1.0 covers -8R to +8R.
    // Center is 0.5.
    // Distance from center 0.5 in UV space:
    // 1 Radius = 1/16 = 0.0625 UV units.
    
    let center = vec2<f32>(0.5, 0.5);
    let uvDist = length(in.uv - center);
    
    // 1 Radius = 0.0625 UV distance
    // Normalized distance (0 = center, 1 = edge of particle)
    let dist = uvDist * 16.0; 

    // Shape Logic
    if (in.shape > 0.5) {
        // Square
        // Simple box SDF
        let d = max(abs(in.uv.x - 0.5), abs(in.uv.y - 0.5)) * 4.0;
        if (d > 1.0) { discard; }
        return vec4<f32>(in.color.rgb, 1.0);
    }

    // Circle Logic
    var alpha = 0.0;
    var glow = vec3<f32>(0.0);

    // Hard Core
    if (dist <= 1.0) {
        alpha = 1.0;
        
        // Anti-aliasing
        if (params.aaEnabled > 0.5) {
            // Smooth edge
            alpha = 1.0 - smoothstep(0.9, 1.0, dist);
        }
    }

    // Bloom / Glow
    if (params.bloomEnabled > 0.5) {
        // Glow falls off outside the core (dist > 1.0)
        // bloomThreshold: 0.0 = Start from center, 0.5 = Start from edge of core (approx)
        let threshold = params.bloomThreshold; 
        
        // bloomRadius: Controls spread. Higher = Wider.
        // Exponent = Constant / Radius. 
        // If Radius is 0.5, Exponent ~ 4.0. If Radius is 1.0, Exponent ~ 2.0.
        let exponent = 2.0 / max(0.01, params.bloomRadius);

        let glowDist = max(0.0, dist - threshold); 
        let glowIntensity = exp(-glowDist * exponent) * params.bloomStrength * 0.5;
        glow = in.color.rgb * glowIntensity;
    }

    // Combine core color and glow
    // For Premultiplied Alpha with (One, OneMinusSrcAlpha):
    // RGB = Emitted Light (Color * Alpha + Glow)
    // A = Occlusion (Alpha)
    
    let finalColor = in.color.rgb * alpha + glow;
    let finalAlpha = alpha;

    // Discard only if no light and no occlusion
    if (finalAlpha < 0.01 && length(glow) < 0.01) {
        discard;
    }
    
    return vec4<f32>(finalColor, finalAlpha);
}

// --- Obstacle Rendering ---

struct Obstacle {
    pos: vec2<f32>,
    halfSize: vec2<f32>,
    rotation: f32,
    padding: vec3<f32>
};

@group(0) @binding(2) var<storage, read> obstacles: array<Obstacle>;

struct ObstacleVertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>
};

@vertex
fn vs_obstacle(in: VertexInput) -> ObstacleVertexOutput {
    let obs = obstacles[in.instanceIndex];
    
    // Quad vertices (triangle strip)
    var pos = vec2<f32>(0.0, 0.0);
    var uv = vec2<f32>(0.0, 0.0);
    
    if (in.vertexIndex == 0u) { pos = vec2<f32>(-1.0, -1.0); uv = vec2<f32>(0.0, 1.0); }
    else if (in.vertexIndex == 1u) { pos = vec2<f32>(1.0, -1.0); uv = vec2<f32>(1.0, 1.0); }
    else if (in.vertexIndex == 2u) { pos = vec2<f32>(-1.0, 1.0); uv = vec2<f32>(0.0, 0.0); }
    else if (in.vertexIndex == 3u) { pos = vec2<f32>(1.0, 1.0); uv = vec2<f32>(1.0, 0.0); }
    
    // Rotate and Scale
    // Local pos = pos * halfSize
    let localPos = pos * obs.halfSize;
    
    // Rotate
    let c = cos(obs.rotation);
    let s = sin(obs.rotation);
    let rotatedPos = vec2<f32>(
        localPos.x * c - localPos.y * s,
        localPos.x * s + localPos.y * c
    );
    
    // Translate
    let worldPos = obs.pos + rotatedPos;
    
    // Clip Space
    let x = (worldPos.x / params.width) * 2.0 - 1.0;
    let y = -((worldPos.y / params.height) * 2.0 - 1.0);
    
    var out: ObstacleVertexOutput;
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = uv;
    return out;
}

@fragment
fn fs_obstacle(in: ObstacleVertexOutput) -> @location(0) vec4<f32> {
    // Simple gray color for obstacles
    return vec4<f32>(0.5, 0.5, 0.5, 1.0);
}
