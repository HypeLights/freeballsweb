import { Scene } from './Scene.js';

export class BlackHoleScene extends Scene {
    init(data, dataUint) {
        this.solver.obstacleCount = 0;
        this.solver.staticCount = 0; // Reset static count to prevent peg logic interference
        this.solver.gravityType = 1; // Enable Central Gravity
        this.solver.damping = 1.0; // No damping for space-like physics
        this.solver.restitution = 0.95; // High bounciness to conserve energy
        this.solver.blackHoleRadius = 30.0; // Default radius
        this.solver.blackHoleGravity = 4.0;
        this.solver.blackHoleSwirl = 1.5;
        this.solver.blackHoleRepulsion = 0.0; // Disabled as requested

        const cx = this.solver.width / 2;
        const cy = this.solver.height / 2;

        // Match shader constant:
        // Shader uses: simParams.blackHoleGravity * 5,000,000.0 (1/r gravity)
        const G_shader = this.solver.blackHoleGravity * 5000000.0;

        // Central Black Hole (Static Particle at Index 0)
        // Color: Dark Grey (0x222222) to be visible against black background
        this.addParticle(0, cx, cy, 0, 0, this.solver.blackHoleRadius, 0x222222);

        // Make it static (Infinite Mass)
        const offset = 0;
        this.solver.simData[offset + 7] = 0; // invMass = 0

        // FORCE PADDING TO 0 (Shape = Circle)
        // Offset 9 is padding.x (at byte offset 36 if using float32 array index 9)
        this.solver.simData[offset + 9] = 0;

        // Spiral Spawning to prevent overlap
        // A = area per particle approx (pi * r^2)
        // We want spacing > 2 * radius
        const spacing = this.solver.ballRadius * 2.2; // 10% buffer

        let currentRadius = 100;
        let currentAngle = Math.random() * Math.PI * 2; // Randomize start angle

        for (let i = 1; i < this.solver.particleCount; i++) {
            // Calculate circumference at current radius
            const circumference = 2 * Math.PI * currentRadius;
            const particlesPerRing = Math.floor(circumference / spacing);

            // Increment angle based on arc length
            const angleIncrement = (2 * Math.PI) / Math.max(1, particlesPerRing);
            currentAngle += angleIncrement;

            // If we completed a full circle, move out
            if (currentAngle >= 2 * Math.PI) {
                currentAngle -= 2 * Math.PI;
                currentRadius += spacing;
            }

            // Add some randomness to angle and radius for natural look
            const angle = currentAngle;
            const dist = currentRadius;

            const x = cx + Math.cos(angle) * dist;
            const y = cy + Math.sin(angle) * dist;

            // Orbital Velocity for 1/r^2 Gravity (Newtonian)
            // F = K / r^2
            // mv^2/r = K / r^2
            // v^2 = K / r
            // v = sqrt(K / r)

            // K matches shader: simParams.blackHoleGravity * 5000000.0 * 300.0
            const K = this.solver.blackHoleGravity * 5000000.0 * 300.0;
            const v = Math.sqrt(K / dist);

            const speed = v; // No randomness

            const vx = -Math.sin(angle) * speed;
            const vy = Math.cos(angle) * speed;

            // Color based on distance
            const maxR = Math.min(this.solver.width, this.solver.height) * 0.5;
            const t = 1.0 - Math.min(1.0, (dist - 80) / (maxR - 80));
            const color = this.solver.getColor(Math.floor(t * this.solver.particleCount), this.solver.particleCount);

            this.addParticle(i, x, y, vx, vy, this.solver.ballRadius, color);

            // Explicitly ensure it's dynamic
            const pOffset = i * 10; // 10 floats per particle
            this.solver.simData[pOffset + 7] = 1.0; // invMass = 1.0
        }
        this.solver.emittedCount = this.solver.particleCount;
    }

    update(dt) {
        // Ensure gravity type stays set
        this.solver.gravityType = 1;

        // Force Obstacle Count to 0 (just in case)
        this.solver.obstacleCount = 0;

        // Update Black Hole Radius and Position dynamically
        // We must write directly to the GPU buffer.

        // 1. Update Radius (Offset 4 in Particle struct)
        const radiusData = new Float32Array([this.solver.blackHoleRadius]);
        this.solver.device.queue.writeBuffer(this.solver.particleBuffer, 16, radiusData);

        // 2. Update Position (Offset 0 in Particle struct)
        // Ensure the visual black hole stays at the center of the screen
        const cx = this.solver.width / 2;
        const cy = this.solver.height / 2;
        const posData = new Float32Array([cx, cy]);
        this.solver.device.queue.writeBuffer(this.solver.particleBuffer, 0, posData);

        // 3. Update Velocity to 0 (Offset 2 floats = 8 bytes)
        const velData = new Float32Array([0, 0]);
        this.solver.device.queue.writeBuffer(this.solver.particleBuffer, 8, velData);

        // 4. FORCE PADDING TO 0 (Offset 9 floats = 36 bytes)
        // This ensures the shape is always a CIRCLE (0), never a square (1).
        // Particle 0 is at offset 0. Padding is at offset 36 bytes (9th float).
        // Struct: pos(0,4), vel(8,12), radius(16), color(20), mass(24), invMass(28), padding(32,36)
        // Wait, padding is vec2. padding.x is at 32. padding.y is at 36.
        // Let's check struct alignment.
        // pos: vec2 (0, 4)
        // vel: vec2 (8, 12)
        // radius: f32 (16)
        // color: u32 (20)
        // mass: f32 (24)
        // invMass: f32 (28)
        // padding: vec2 (32, 36)
        // So padding.x is at 32.
        const paddingData = new Float32Array([0, 0]);
        this.solver.device.queue.writeBuffer(this.solver.particleBuffer, 32, paddingData);
    }

    cleanup() {
        this.solver.gravityType = 0; // Reset to Down
        this.solver.damping = 0.999; // Reset damping
        this.solver.restitution = 0.8; // Reset restitution

        // Clear obstacles
        this.solver.obstacleCount = 0;
        const empty = new Float32Array(8); // Clear first obstacle
        this.solver.device.queue.writeBuffer(this.solver.obstacleBuffer, 0, empty);
    }
}
