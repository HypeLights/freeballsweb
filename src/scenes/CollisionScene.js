import { Scene } from './Scene.js';

export class CollisionScene extends Scene {
    init(data, dataUint) {
        this.solver.obstacleCount = 0;
        this.solver.gravityType = 0; // Standard Gravity (but we'll set G to 0)
        this.solver.gravity = 0.0;   // Zero Gravity
        this.solver.damping = 1.0;   // No air resistance
        this.solver.restitution = 0.9; // Bouncy

        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const width = window.innerWidth;
        const height = window.innerHeight;

        const groupSize = Math.floor(this.solver.particleCount / 2);

        // Group 1: Left -> Right (Fire Colors)
        for (let i = 0; i < groupSize; i++) {
            const x = (Math.random() * width * 0.2) + (width * 0.1);
            const y = (Math.random() * height * 0.6) + (height * 0.2);

            const vx = 50 + Math.random() * 50; // Fast right
            const vy = (Math.random() - 0.5) * 20;

            // Fire Colors (Red/Orange/Yellow)
            // H: 0-60
            const hue = Math.random() * 60;
            const color = this.solver.hslToRgb(hue, 1.0, 0.6);

            this.addParticle(i, x, y, vx, vy, this.solver.ballRadius, color);
        }

        // Group 2: Right -> Left (Ice Colors)
        for (let i = groupSize; i < this.solver.particleCount; i++) {
            const x = width - ((Math.random() * width * 0.2) + (width * 0.1));
            const y = (Math.random() * height * 0.6) + (height * 0.2);

            const vx = -(50 + Math.random() * 50); // Fast left
            const vy = (Math.random() - 0.5) * 20;

            // Ice Colors (Cyan/Blue)
            // H: 180-240
            const hue = 180 + Math.random() * 60;
            const color = this.solver.hslToRgb(hue, 1.0, 0.6);

            this.addParticle(i, x, y, vx, vy, this.solver.ballRadius, color);
        }

        this.solver.emittedCount = this.solver.particleCount;
    }

    update(dt) {
        // Ensure gravity stays 0
        this.solver.gravity = 0.0;
    }

    cleanup() {
        this.solver.gravity = 4.0; // Restore gravity
        this.solver.damping = 0.999;
    }
}
