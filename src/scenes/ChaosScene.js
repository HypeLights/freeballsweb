import { Scene } from './Scene.js';

export class ChaosScene extends Scene {
    init(data, dataUint) {
        this.solver.obstacleCount = 0;

        for (let i = 0; i < this.solver.particleCount; i++) {
            const x = Math.random() * this.solver.width;
            const y = Math.random() * this.solver.height;
            const vx = (Math.random() - 0.5) * 500;
            const vy = (Math.random() - 0.5) * 500;
            const color = this.solver.getColor(i, this.solver.particleCount);

            this.addParticle(i, x, y, vx, vy, this.solver.ballRadius, color);
        }
        this.solver.emittedCount = this.solver.particleCount;
    }
}
