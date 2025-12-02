import { Scene } from './Scene.js';

export class GaltonScene extends Scene {
    init(data, dataUint) {
        // Clear obstacles first
        this.solver.obstacleCount = 0;

        const pegRadius = this.solver.galtonPegSize || 3.0;
        const pegSpacingX = 30;
        const pegSpacingY = 30;
        const startY = 150;

        // Bucket Settings
        const bucketHeight = this.solver.galtonBucketHeight || (window.innerHeight * 0.4);
        const bucketY = window.innerHeight - bucketHeight;

        // Calculate Peg Count dynamically based on available space
        const availableHeight = bucketY - startY - 50;
        const rows = Math.floor(availableHeight / pegSpacingY);

        const cols = Math.floor(window.innerWidth / pegSpacingX);
        const startX = (window.innerWidth - (cols * pegSpacingX)) / 2;

        let index = 0;

        // 1. Create Pegs (Static)
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                // If we run out of space, we MUST stop.
                if (index >= this.solver.maxParticles) {
                    console.error("CRITICAL: Galton Peg Loop ran out of buffer space! Increase safety margin.");
                    break;
                }

                const offset = index * 10;
                const stagger = (r % 2) * (pegSpacingX / 2);

                data[offset + 0] = startX + c * pegSpacingX + stagger;
                data[offset + 1] = startY + r * pegSpacingY;
                data[offset + 2] = 0;
                data[offset + 3] = 0;
                data[offset + 4] = pegRadius;
                dataUint[offset + 5] = 0x555555; // Gray
                data[offset + 6] = 0.0; // Static
                data[offset + 7] = 0.0;
                data[offset + 8] = 0; // Circle
                data[offset + 9] = 0;

                index++;
            }
        }

        this.solver.staticCount = index;
        this.solver.emittedCount = 0;

        // 2. Create Buckets
        const bucketSpacing = this.solver.galtonBucketSpacing || 40;
        const bucketCols = Math.ceil(window.innerWidth / bucketSpacing) + 2;
        const totalBucketWidth = bucketCols * bucketSpacing;
        const bucketStartX = (window.innerWidth - totalBucketWidth) / 2;
        const bucketWidth = 8; // Thicker walls

        const obstacleData = new Float32Array(this.solver.maxObstacles * 8);
        this.solver.obstacleCount = 0;

        for (let i = 0; i < bucketCols; i++) {
            const wallX = bucketStartX + i * bucketSpacing;

            if (wallX < -50 || wallX > window.innerWidth + 50) continue;

            this.solver.addObstacle(
                obstacleData,
                wallX, bucketY + bucketHeight / 2,
                bucketWidth / 2, bucketHeight / 2,
                0
            );
        }

        // Upload Obstacles
        this.solver.device.queue.writeBuffer(this.solver.obstacleBuffer, 0, obstacleData.slice(0, this.solver.obstacleCount * 8));
    }

    update(dt) {
        if (this.solver.paused) return;

        const spawnRate = this.solver.galtonSpawnRate || 5; // Balls per second

        // Accumulate spawn count based on dt
        if (!this.solver.spawnAccumulator) this.solver.spawnAccumulator = 0;
        this.solver.spawnAccumulator += spawnRate * dt;

        // Track Simulation Time for deterministic checks
        if (this.solver.simTime === undefined) this.solver.simTime = 0;
        this.solver.simTime += dt;

        // Use particleCount as the limit for EMITTED balls only
        const maxEmitted = this.solver.particleCount;

        // Hard safety limit based on buffer size
        const bufferLimit = this.solver.maxParticles - this.solver.staticCount;
        const effectiveLimit = Math.min(maxEmitted, bufferLimit);

        if (this.solver.emittedCount < effectiveLimit) {
            let countToEmit = Math.floor(this.solver.spawnAccumulator);
            this.solver.spawnAccumulator -= countToEmit; // Keep fractional part

            // Clamp to remaining capacity
            countToEmit = Math.min(countToEmit, effectiveLimit - this.solver.emittedCount);

            if (countToEmit > 0) {
                const startIndex = this.solver.staticCount + this.solver.emittedCount;

                // Use ArrayBuffer to have both Float and Uint views
                const updateBuffer = new ArrayBuffer(countToEmit * 10 * 4);
                const updateData = new Float32Array(updateBuffer);
                const updateDataUint = new Uint32Array(updateBuffer);

                // Ensure centerX is based on current window width
                const centerX = window.innerWidth / 2;
                const spread = this.solver.galtonSpawnerDistance || 100;

                // 3 Spawner Positions (Top Middle)
                const spawners = [
                    centerX,
                    centerX - spread,
                    centerX + spread
                ];

                // Initialize lastSpawnSimTimes if not exists
                if (!this.solver.lastSpawnSimTimes) this.solver.lastSpawnSimTimes = [-1, -1, -1];

                let actualEmitted = 0;

                for (let i = 0; i < countToEmit; i++) {
                    // Round-robin or random selection of spawner
                    let spawnerIdx = Math.floor(Math.random() * 3);

                    // Robust Physics Clearance Check (GPU-based)
                    // We use the 'spawnerBlocked' array updated from the GPU readback.
                    // 0 = Free, 1 = Blocked

                    let safe = false;

                    // Try all 3 spawners
                    for (let attempt = 0; attempt < 3; attempt++) {
                        const tryIdx = (spawnerIdx + attempt) % 3;

                        if (this.solver.spawnerBlocked[tryIdx] === 0) {
                            spawnerIdx = tryIdx;
                            safe = true;
                            // Mark as blocked locally to prevent multiple spawns in same frame
                            this.solver.spawnerBlocked[spawnerIdx] = 1;
                            break;
                        }
                    }

                    if (!safe) {
                        // All spawners blocked by particles in the grid.
                        // Skip this spawn.
                        continue;
                    }

                    const spawnX = spawners[spawnerIdx];
                    const spawnY = 50;

                    const offset = actualEmitted * 10;

                    updateData[offset + 0] = spawnX + (Math.random() - 0.5) * 2;
                    updateData[offset + 1] = spawnY;
                    updateData[offset + 2] = (Math.random() - 0.5) * 2;
                    updateData[offset + 3] = 10 + (Math.random() * 10); // Random downward velocity
                    updateData[offset + 4] = this.solver.ballRadius;

                    // Use Uint view for color
                    updateDataUint[offset + 5] = this.solver.getColor(this.solver.emittedCount + actualEmitted, maxEmitted);

                    const r = this.solver.ballRadius;
                    const mass = Math.pow(r, 3) * 0.01;
                    updateData[offset + 6] = mass;
                    updateData[offset + 7] = 1.0 / mass;
                    updateData[offset + 8] = 0;
                    updateData[offset + 9] = 0;

                    actualEmitted++;
                }

                if (actualEmitted > 0) {
                    // Use Uint32Array view to prevent NaN corruption when writing colors
                    // We must slice the Uint32Array, not the Float32Array
                    this.solver.device.queue.writeBuffer(
                        this.solver.particleBuffer,
                        startIndex * 40,
                        updateDataUint.slice(0, actualEmitted * 10)
                    );

                    this.solver.emittedCount += actualEmitted;
                }
                this.solver.updateParams();
            }
        } else if (this.solver.emittedCount > maxEmitted) {
            this.solver.updateParams();
        }
    }
}
