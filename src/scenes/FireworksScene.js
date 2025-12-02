import { Scene } from './Scene.js';

class Firework {
    constructor(indices, startX, startY, targetY, color, solver) {
        this.indices = indices; // [leader, ...payload]
        this.solver = solver;
        this.color = color;
        this.state = 'RISING';
        this.age = 0;

        // Physics Simulation for CPU tracking
        this.pos = { x: startX, y: startY };

        // Calculate required velocity to reach targetY
        const dist = startY - targetY;
        const g = this.solver.gravity * 500; // Pixel scale gravity

        // User Setting: Rocket Speed Multiplier (0.5 - 3.0)
        const speedMult = this.solver.fireworksRocketSpeed || 1.5;

        // Launch Vector Variety
        // 1. Randomize X velocity more (wind/angle) - Spread of -75 to +75
        const xVel = (Math.random() - 0.5) * 150;

        // 2. Randomize Speed Multiplier slightly so they don't all peak exactly at targetY
        const randomSpeed = speedMult * (0.9 + Math.random() * 0.2);

        this.vel = { x: xVel, y: -Math.sqrt(2 * g * dist) * randomSpeed };

        this.explodeTime = 0; // Will be determined by peak
    }

    update(dt) {
        this.age += dt;

        if (this.state === 'RISING') {
            // Integrate CPU physics
            const g = this.solver.gravity * 500;
            const damping = this.solver.damping;

            this.vel.x *= Math.pow(damping, dt * 60);
            this.vel.y *= Math.pow(damping, dt * 60);
            this.vel.y += g * dt;

            this.pos.x += this.vel.x * dt;
            this.pos.y += this.vel.y * dt;

            // SYNC: Force GPU particle to match CPU position
            const leaderIdx = this.indices[0];
            const posVelData = new Float32Array([
                this.pos.x, this.pos.y,
                this.vel.x, this.vel.y
            ]);
            this.solver.device.queue.writeBuffer(
                this.solver.particleBuffer,
                leaderIdx * 40, // Offset 0 (pos) + 4 floats
                posVelData
            );

            // Check if reached peak (velocity turns positive/down or very slow up)
            if (this.vel.y > -20) {
                this.explode();
            }
        } else if (this.state === 'EXPLODED') {
            if (this.age - this.explodeTime > 4.0) {
                this.state = 'DEAD';
            }
        }
    }

    explode() {
        this.state = 'EXPLODED';
        this.explodeTime = this.age;

        const count = this.indices.length;
        const type = Math.random();

        // User Setting: Explosion Speed Multiplier
        // Apply power function to make it feel more "powerful" at high values
        let expSpeedMult = this.solver.fireworksExplosionSpeed || 1.0;
        expSpeedMult = Math.pow(expSpeedMult, 2.0); // Square it for exponential control

        // Calculate required space to avoid massive overlap repulsion
        // Area = count * PI * r^2
        // Radius of cluster = sqrt(Area / PI) * packing_factor
        const r = this.solver.ballRadius;
        const requiredArea = count * Math.PI * r * r;
        const clusterRadius = Math.sqrt(requiredArea / Math.PI) * 1.2; // 1.2 for breathing room

        for (let i = 0; i < count; i++) {
            const idx = this.indices[i];

            // Position: Distribute within cluster radius to minimize overlap
            // Use random point in circle
            const anglePos = Math.random() * Math.PI * 2;

            // Jitter: Apply to all EXCEPT the leader (index 0) to maintain visual continuity
            // The leader should stay exactly where the rocket was.
            let distPos = Math.sqrt(Math.random()) * clusterRadius;
            if (i === 0) distPos = 0;

            const px = this.pos.x + Math.cos(anglePos) * distPos;
            const py = this.pos.y + Math.sin(anglePos) * distPos;

            // Velocity: Explosion burst
            let angle, speed;

            if (type < 0.2) {
                // Spherical Burst (Classic)
                angle = Math.random() * Math.PI * 2;
                speed = (10 + Math.random() * 50) * expSpeedMult;
            } else if (type < 0.4) {
                // Ring Burst
                angle = (i / count) * Math.PI * 2;
                speed = (40 + Math.random() * 20) * expSpeedMult;
            } else if (type < 0.6) {
                // Double Ring
                angle = Math.random() * Math.PI * 2;
                speed = ((i % 2 === 0) ? 30 : 60) * expSpeedMult;
            } else if (type < 0.8) {
                // Spiral / Galaxy
                // Angle increases with index
                const arms = 3;
                const armOffset = (i % arms) * (Math.PI * 2 / arms);
                const spiral = (i / count) * Math.PI * 2; // Full rotation along arm
                angle = armOffset + spiral;
                speed = (20 + (i / count) * 40) * expSpeedMult;
            } else {
                // Cross / Star
                const points = 5;
                const pointAngle = Math.floor(i / (count / points)) * (Math.PI * 2 / points);
                // Spread slightly around the point angle
                angle = pointAngle + (Math.random() - 0.5) * 0.5;
                speed = (30 + Math.random() * 40) * expSpeedMult;
            }

            // Radial Boost: Force particles away from center to reduce clumping
            const dx = px - this.pos.x;
            const dy = py - this.pos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            let rvx = 0, rvy = 0;
            if (dist > 0.001) {
                rvx = (dx / dist) * speed * 0.5;
                rvy = (dy / dist) * speed * 0.5;
            }

            // Add Rocket Velocity (Reduced influence)
            const vx = Math.cos(angle) * speed + rvx + this.vel.x * 0.1;
            const vy = Math.sin(angle) * speed + rvy + this.vel.y * 0.1;

            // Color
            let color = this.color;
            if (Math.random() < 0.3) {
                color = 0xFFFFFF; // Sparkle
            }

            // Mass
            const mass = Math.pow(r, 3) * 0.01;

            // Write to GPU
            const particleData = new Float32Array([
                px, py,
                vx, vy,
                r,
                0, // Color placeholder (uint)
                mass,
                1.0 / mass,
                0, 0
            ]);
            const uintView = new Uint32Array(particleData.buffer);
            uintView[5] = color;

            this.solver.device.queue.writeBuffer(
                this.solver.particleBuffer,
                idx * 40,
                particleData
            );
        }
    }
}

export class FireworksScene extends Scene {
    init(data, dataUint) {
        this.solver.obstacleCount = 0;
        this.solver.staticCount = 0;
        this.solver.gravityType = 0;
        this.solver.gravity = 4.0;
        this.solver.damping = 0.96; // Good air resistance
        this.solver.restitution = 0.5;

        // User Request: Default ball size 2.0
        // Only apply if it's the generic default (10).
        // This allows users to keep custom values on Reset.
        if (this.solver.ballRadius === 10) {
            this.solver.ballRadius = 2.0;
        }
        this.solver.cellSize = Math.max(20, this.solver.ballRadius * 2.5);

        // Initialize all particles far away (hidden)
        // CRITICAL: Set them to NaN or very far to prevent startup glitch
        for (let i = 0; i < this.solver.particleCount; i++) {
            const offset = i * 10;
            data[offset + 0] = -10000; // Far off screen
            data[offset + 1] = -10000;
            data[offset + 2] = 0;
            data[offset + 3] = 0;
            data[offset + 4] = this.solver.ballRadius;
            dataUint[offset + 5] = 0;
            data[offset + 6] = 1;
            data[offset + 7] = 0;
        }
        // Initial emitted count is 0 because they are all hidden
        this.solver.emittedCount = 0;

        // Pool Management: Circular Buffer
        // We don't "reclaim" indices anymore. We just take the next available one.
        // This ensures particles stay alive until we overwrite them.
        this.nextParticleIndex = 0;

        this.activeFireworks = [];
        this.spawnTimer = 0;
    }

    update(dt) {
        if (this.solver.paused) return;

        // 1. Spawn Logic
        this.spawnTimer += dt;

        // Use user setting: spawnRate (bursts per second)
        const rate = this.solver.fireworksSpawnRate || 3.0;
        const interval = 1.0 / rate;

        // Add some randomness to interval
        if (this.spawnTimer > interval * (0.8 + Math.random() * 0.4)) {
            this.spawnFirework();
            this.spawnTimer = 0;
        }

        // 2. Update Active Fireworks
        let liveCount = 0;
        for (let i = this.activeFireworks.length - 1; i >= 0; i--) {
            const fw = this.activeFireworks[i];
            fw.update(dt);

            if (fw.state === 'DEAD') {
                // We don't need to reclaim indices. They are just forgotten.
                this.activeFireworks.splice(i, 1);
            } else {
                liveCount += fw.indices.length;
            }
        }

        // Update solver emitted count for UI display
        this.solver.emittedCount = liveCount;
    }

    spawnFirework() {
        // Use user setting: explosionSize
        const baseSize = this.solver.fireworksExplosionSize || 100;
        // Randomize size around base
        const size = Math.floor(baseSize * (0.8 + Math.random() * 0.4));

        // CRITICAL: Check against "Max Balls" slider (solver.particleCount)
        // If adding this firework would exceed the user's set limit, don't spawn it.
        // Also check against hard buffer limit.
        let currentLiveCount = this.solver.emittedCount || 0;
        const maxUserParticles = this.solver.particleCount;

        // Force Spawn Logic:
        // If adding this firework exceeds the limit, remove the oldest fireworks until we have room.
        // This ensures the flow is never disrupted by a hard limit.
        while (currentLiveCount + size > maxUserParticles && this.activeFireworks.length > 0) {
            const oldest = this.activeFireworks.shift(); // Remove oldest
            currentLiveCount -= oldest.indices.length;
            // Oldest is now garbage collected and won't update anymore.
            // Its GPU particles will be overwritten by the circular buffer eventually.
        }

        // Get indices from circular buffer
        const indices = [];
        // CRITICAL: Ensure we don't exceed the actual GPU buffer size
        // The solver has a hard maxParticles limit (300,000)
        const maxBufferParticles = Math.floor(this.solver.particleBuffer.size / 40);

        for (let i = 0; i < size; i++) {
            // Safety check: wrap around maxBufferParticles
            if (this.nextParticleIndex >= maxBufferParticles) {
                this.nextParticleIndex = 0;
            }

            indices.push(this.nextParticleIndex);
            this.nextParticleIndex = (this.nextParticleIndex + 1) % maxBufferParticles;
        }

        const width = window.innerWidth;
        const height = window.innerHeight;

        const startX = width * 0.2 + Math.random() * width * 0.6;
        const startY = height + 20; // Just below screen
        const targetY = height * 0.1 + Math.random() * height * 0.4; // Upper half

        const hue = Math.random() * 360;
        const color = this.solver.hslToRgb(hue, 1.0, 0.6);

        const fw = new Firework(indices, startX, startY, targetY, color, this.solver);
        this.activeFireworks.push(fw);

        // Upload Leader Particle (Index 0)
        const leaderIdx = indices[0];
        const buffer = new Float32Array(10);
        const uintView = new Uint32Array(buffer.buffer);

        buffer[0] = fw.pos.x;
        buffer[1] = fw.pos.y;
        buffer[2] = fw.vel.x;
        buffer[3] = fw.vel.y;
        buffer[4] = 4.0; // Leader is slightly bigger
        uintView[5] = 0xFFFFFF; // White trail

        const mass = Math.pow(4.0, 3) * 0.01;
        buffer[6] = mass;
        buffer[7] = 1.0 / mass;

        this.solver.device.queue.writeBuffer(
            this.solver.particleBuffer,
            leaderIdx * 40,
            buffer
        );
    }
}
