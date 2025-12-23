import { Scene } from './Scene.js';

export class GaltonScene extends Scene {
    init(data, dataUint) {
        // Clear obstacles first
        this.solver.obstacleCount = 0;

        // Reset Physics Defaults
        this.solver.gravity = 4.0;
        this.solver.restitution = 0.8;
        this.solver.damping = 0.999;
        this.solver.substeps = 32;
        this.solver.ballRadius = 7.0;
        this.solver.galtonSpawnRate = 10;

        const pegRadius = this.solver.galtonPegSize || 3.0;
        const pegSpacingX = 30;
        const pegSpacingY = 30;
        const startY = 150;

        // Bucket Settings
        const bucketHeight = this.solver.galtonBucketHeight || (this.solver.height * 0.4);
        const bucketY = this.solver.height - bucketHeight;

        // Calculate Peg Count dynamically based on available space
        const availableHeight = bucketY - startY - 50;
        const rows = Math.floor(availableHeight / pegSpacingY);

        const cols = Math.floor(this.solver.width / pegSpacingX);
        const startX = (this.solver.width - (cols * pegSpacingX)) / 2;

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
        const targetSpacing = this.solver.galtonBucketSpacing || 40;
        // Calculate number of bins that fit in the screen
        const numBins = Math.round(this.solver.width / targetSpacing);
        // Recalculate exact spacing to fit perfectly
        const actualSpacing = this.solver.width / numBins;

        const bucketWidth = 8; // Thicker walls
        const numWalls = numBins + 1; // Walls are fences between bins

        const obstacleData = new Float32Array(this.solver.maxObstacles * 8);
        // Zero out the buffer on GPU to prevent ghosts
        this.solver.device.queue.writeBuffer(this.solver.obstacleBuffer, 0, obstacleData);

        this.solver.obstacleCount = 0;

        for (let i = 0; i < numWalls; i++) {
            // Place walls exactly at division points
            // i=0 is left edge (0), i=numBins is right edge (width)
            const wallX = i * actualSpacing;

            // Revert extension: Use standard height.
            // The "Horizontal Force" shader logic now handles stability.
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

                // Ensure centerX is aligned with a bin center, not a wall
                const targetSpacing = this.solver.galtonBucketSpacing || 40;
                const numBins = Math.round(this.solver.width / targetSpacing);
                const actualSpacing = this.solver.width / numBins;

                // Snap centerX to the nearest bin center
                // Bin centers are at (i + 0.5) * actualSpacing
                let centerBinIndex = Math.floor(this.solver.width / 2 / actualSpacing);
                const alignedCenterX = (centerBinIndex + 0.5) * actualSpacing;

                const spread = this.solver.galtonSpawnerDistance || 100;
                // Removed snapping for smooth real-time updates
                const alignedSpread = spread;

                // 3 Spawner Positions (Top Middle)
                const spawners = [
                    alignedCenterX,
                    alignedCenterX - alignedSpread,
                    alignedCenterX + alignedSpread
                ];

                // Initialize lastSpawnSimTimes if not exists
                if (!this.solver.lastSpawnSimTimes) this.solver.lastSpawnSimTimes = [-1, -1, -1];

                let actualEmitted = 0;
                const launchSpeed = 150;
                const clearanceDist = this.solver.ballRadius * 2.2;
                const dynamicCoolDown = clearanceDist / launchSpeed;

                for (let i = 0; i < countToEmit; i++) {
                    // Round-robin or random selection of spawner
                    let spawnerIdx = Math.floor(Math.random() * 3);
                    let safe = false;

                    // Try all 3 spawners
                    for (let attempt = 0; attempt < 3; attempt++) {
                        const tryIdx = (spawnerIdx + attempt) % 3;

                        // Check 1: GPU Grid Check
                        const gpuFree = (this.solver.spawnerBlocked[tryIdx] === 0);

                        // Check 2: Physics Clearance Check (Prevents self-overlap due to latency)
                        const timeFree = (this.solver.simTime - this.solver.lastSpawnSimTimes[tryIdx]) > dynamicCoolDown;

                        if (gpuFree && timeFree) {
                            spawnerIdx = tryIdx;
                            safe = true;
                            // Mark as blocked locally/update time
                            this.solver.spawnerBlocked[spawnerIdx] = 1;
                            this.solver.lastSpawnSimTimes[spawnerIdx] = this.solver.simTime;
                            break;
                        }
                    }

                    if (!safe) {
                        continue;
                    }

                    const spawnX = spawners[spawnerIdx];
                    const spawnY = 50;

                    const offset = actualEmitted * 10;

                    updateData[offset + 0] = spawnX + (Math.random() - 0.5) * 2;
                    updateData[offset + 1] = spawnY;
                    updateData[offset + 2] = (Math.random() - 0.5) * 2;
                    updateData[offset + 3] = launchSpeed + (Math.random() * 50); // Consistent fast launch
                    updateData[offset + 4] = this.solver.ballRadius;

                    // Use Uint view for color
                    updateDataUint[offset + 5] = this.solver.getColor(this.solver.emittedCount + actualEmitted, maxEmitted);

                    const r = this.solver.ballRadius;
                    const mass = Math.pow(r, 2) * 0.1;
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
