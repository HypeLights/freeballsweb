import { Scene } from './Scene.js';

export class FountainScene extends Scene {
    init(data, dataUint) {
        this.solver.obstacleCount = 0;
        this.solver.staticCount = 0;
        this.solver.emittedCount = 0;

        // Add a floor
        const obstacleData = new Float32Array(this.solver.maxObstacles * 8);
        this.solver.addObstacle(obstacleData, this.solver.width / 2, this.solver.height - 10, this.solver.width / 2, 10, 0);
        this.solver.device.queue.writeBuffer(this.solver.obstacleBuffer, 0, obstacleData.slice(0, 8));

        // Reset spawn accumulator
        this.solver.spawnAccumulator = 0;
    }

    update(dt) {
        if (this.solver.paused) return;

        const rate = this.solver.fountainSpawnRate || 500; // particles per second
        if (!this.solver.spawnAccumulator) this.solver.spawnAccumulator = 0;
        this.solver.spawnAccumulator += rate * dt;

        const maxEmitted = this.solver.particleCount;
        const bufferLimit = this.solver.maxParticles - this.solver.staticCount;
        const effectiveLimit = Math.min(maxEmitted, bufferLimit);

        if (this.solver.emittedCount < effectiveLimit) {
            let countToEmit = Math.floor(this.solver.spawnAccumulator);
            this.solver.spawnAccumulator -= countToEmit;
            countToEmit = Math.min(countToEmit, effectiveLimit - this.solver.emittedCount);

            if (countToEmit > 0) {
                const startIndex = this.solver.staticCount + this.solver.emittedCount;
                const updateBuffer = new ArrayBuffer(countToEmit * 10 * 4);
                const updateData = new Float32Array(updateBuffer);
                const updateDataUint = new Uint32Array(updateBuffer);

                const spawnX = this.solver.width / 2;
                const spawnY = this.solver.height - 50;

                for (let i = 0; i < countToEmit; i++) {
                    const offset = i * 10;

                    updateData[offset + 0] = spawnX + (Math.random() - 0.5) * 20;
                    updateData[offset + 1] = spawnY;
                    // Upward velocity with spread
                    updateData[offset + 2] = (Math.random() - 0.5) * 100;
                    updateData[offset + 3] = -300 - Math.random() * 200;
                    updateData[offset + 4] = this.solver.ballRadius;

                    updateDataUint[offset + 5] = this.solver.getColor(this.solver.emittedCount + i, maxEmitted);

                    const r = this.solver.ballRadius;
                    const mass = Math.pow(r, 3) * 0.01;
                    updateData[offset + 6] = mass;
                    updateData[offset + 7] = 1.0 / mass;
                    updateData[offset + 8] = 0;
                    updateData[offset + 9] = 0;
                }

                this.solver.device.queue.writeBuffer(
                    this.solver.particleBuffer,
                    startIndex * 40,
                    updateDataUint
                );

                this.solver.emittedCount += countToEmit;
                this.solver.updateParams();
            }
        }
    }
}
