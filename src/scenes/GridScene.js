import { Scene } from './Scene.js';

export class GridScene extends Scene {
    init(data, dataUint) {
        this.solver.obstacleCount = 0;

        const aspect = window.innerWidth / window.innerHeight;
        const cols = Math.floor(Math.sqrt(this.solver.particleCount * aspect));
        const rows = Math.ceil(this.solver.particleCount / cols);
        const startX = (window.innerWidth - cols * this.solver.ballRadius * 2.5) / 2;
        const startY = (window.innerHeight - rows * this.solver.ballRadius * 2.5) / 2;

        for (let i = 0; i < this.solver.particleCount; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);

            const x = startX + col * this.solver.ballRadius * 2.5;
            const y = startY + row * this.solver.ballRadius * 2.5;
            const color = this.solver.getColor(i, this.solver.particleCount);

            this.addParticle(i, x, y, 0, 0, this.solver.ballRadius, color);
        }
        this.solver.emittedCount = this.solver.particleCount;
    }
}
