import { Scene } from './Scene.js';

export class PlanetaryScene extends Scene {
    init(data, dataUint) {
        this.solver.obstacleCount = 0;
        this.solver.staticCount = 0;
        this.solver.gravityType = 1; // Central Gravity
        this.solver.damping = 1.0;   // No damping
        this.solver.restitution = 0.9;

        // Planetary Settings (Cleaner than Black Hole)
        this.solver.blackHoleGravity = 2.0; // Moderate gravity
        this.solver.blackHoleSwirl = 0.0;   // No swirl
        this.solver.blackHoleRepulsion = 0.0; // No repulsion
        this.solver.blackHoleRadius = 40.0; // Large Sun

        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;

        // Central Sun (Static Particle at Index 0)
        // Color: Yellow/Orange (0xFFCC00)
        this.addParticle(0, cx, cy, 0, 0, this.solver.blackHoleRadius, 0xFFCC00);

        // Make it static (Infinite Mass)
        const offset = 0;
        this.solver.simData[offset + 7] = 0; // invMass = 0
        this.solver.simData[offset + 9] = 0; // Padding (Circle)

        // Force Constant C for v calculation
        // Shader: F = (gravity * 5000000) / r
        // v^2/r = F -> v^2 = F*r = gravity * 5000000
        const G_shader = this.solver.blackHoleGravity * 5000000.0;
        const orbitalSpeed = Math.sqrt(G_shader);

        // Spawn Planets
        for (let i = 1; i < this.solver.particleCount; i++) {
            // Random Distance (avoiding sun)
            const minDist = this.solver.blackHoleRadius + 50;
            const maxDist = Math.min(window.innerWidth, window.innerHeight) * 0.45;
            const dist = minDist + Math.random() * (maxDist - minDist);

            const angle = Math.random() * Math.PI * 2;

            const x = cx + Math.cos(angle) * dist;
            const y = cy + Math.sin(angle) * dist;

            // Velocity perpendicular to radius
            // Clockwise or Counter-Clockwise (random per planet? No, usually same direction for solar system)
            // Let's do Counter-Clockwise
            const vx = -Math.sin(angle) * orbitalSpeed;
            const vy = Math.cos(angle) * orbitalSpeed;

            // Earth-like Colors (Blue, Green, White, Brown)
            let color;
            const rand = Math.random();
            if (rand < 0.6) {
                // Ocean Blue
                color = this.solver.hslToRgb(200 + Math.random() * 40, 0.8, 0.5);
            } else if (rand < 0.8) {
                // Land Green
                color = this.solver.hslToRgb(100 + Math.random() * 40, 0.6, 0.4);
            } else if (rand < 0.9) {
                // Cloud White
                color = this.solver.hslToRgb(0, 0, 0.9);
            } else {
                // Rocky Brown
                color = this.solver.hslToRgb(30, 0.6, 0.4);
            }

            // Varying sizes for planets
            const radius = this.solver.ballRadius * (0.5 + Math.random() * 1.0);

            this.addParticle(i, x, y, vx, vy, radius, color);
        }
        this.solver.emittedCount = this.solver.particleCount;
    }

    update(dt) {
        this.solver.gravityType = 1;

        // Keep Sun at Center
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const posData = new Float32Array([cx, cy]);
        this.solver.device.queue.writeBuffer(this.solver.particleBuffer, 0, posData);

        // Ensure Sun is static
        const velData = new Float32Array([0, 0]);
        this.solver.device.queue.writeBuffer(this.solver.particleBuffer, 8, velData);
    }

    cleanup() {
        this.solver.gravityType = 0;
        this.solver.damping = 0.999;
        this.solver.blackHoleSwirl = 1.0; // Reset defaults
        this.solver.blackHoleRepulsion = 1.0;
    }
}
