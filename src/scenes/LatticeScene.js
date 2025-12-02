import { Scene } from './Scene.js';

export class LatticeScene extends Scene {
    init(data, dataUint) {
        this.solver.obstacleCount = 0;
        this.solver.staticCount = 0;
        this.solver.gravityType = 0;
        this.solver.gravity = 0.0; // Zero Gravity
        this.solver.damping = 0.95; // High damping to stop movement quickly
        this.solver.restitution = 0.5;

        const width = window.innerWidth;
        const height = window.innerHeight;

        // Hexagonal Packing
        // x spacing = 2 * r
        // y spacing = sqrt(3) * r
        const r = this.solver.ballRadius;
        const spacingX = r * 2.2; // Little breathing room
        const spacingY = r * 2.2 * Math.sin(Math.PI / 3);

        const cols = Math.floor(width / spacingX) - 2;
        const rows = Math.floor(height / spacingY) - 2;

        const startX = (width - (cols * spacingX)) / 2;
        const startY = (height - (rows * spacingY)) / 2;

        let index = 0;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (index >= this.solver.particleCount) break;

                const stagger = (row % 2) * (spacingX / 2);
                const x = startX + col * spacingX + stagger;
                const y = startY + row * spacingY;

                // Color Gradient based on position
                // X -> Hue, Y -> Lightness
                // const hue = (x / width) * 360;
                // const light = 0.3 + (y / height) * 0.4;
                // const color = this.solver.hslToRgb(hue, 1.0, light);

                // Use Global Theme
                const color = this.solver.getColor(index, this.solver.particleCount);

                this.addParticle(index, x, y, 0, 0, r, color);
                index++;
            }
        }
        this.solver.emittedCount = index;
    }
}
