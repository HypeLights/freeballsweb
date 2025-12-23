import { Scene } from './Scene.js';

export class GridScene extends Scene {
    init(data, dataUint) {
        this.solver.obstacleCount = 0;

        const spacing = this.solver.ballRadius * 2.5;

        // Calculate max columns and rows that fit on screen with a margin
        const maxCols = Math.floor((this.solver.width - spacing) / spacing);
        const maxRows = Math.floor((this.solver.height - spacing) / spacing);
        const maxFit = maxCols * maxRows;

        // Clamp particle count to fit within screen bounds prevents overflow
        if (this.solver.particleCount > maxFit) {
            this.solver.particleCount = maxFit;
        }

        const count = this.solver.particleCount;

        // Calculate grid dimensions trying to match aspect ratio
        const aspect = this.solver.width / this.solver.height;
        let cols = Math.floor(Math.sqrt(count * aspect));

        // Ensure cols don't exceed screen width
        if (cols > maxCols) cols = maxCols;

        let rows = Math.ceil(count / cols);

        const gridWidth = cols * spacing;
        const gridHeight = rows * spacing;

        const startX = (this.solver.width - gridWidth) / 2 + (spacing * 0.5); // Center and offset by half radius
        const startY = (this.solver.height - gridHeight) / 2 + (spacing * 0.5);

        for (let i = 0; i < count; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);

            const x = startX + col * spacing;
            const y = startY + row * spacing;
            const color = this.solver.getColor(i, count);

            this.addParticle(i, x, y, 0, 0, this.solver.ballRadius, color);
        }
        this.solver.emittedCount = count;
    }
}
