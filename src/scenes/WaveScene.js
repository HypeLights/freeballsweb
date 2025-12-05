import { Scene } from './Scene.js';

export class WaveScene extends Scene {
    init(data, dataUint) {
        this.solver.obstacleCount = 0;
        this.solver.staticCount = 0;
        this.solver.gravityType = 0;
        this.solver.gravity = 0.5;
        this.solver.damping = 0.98;
        this.solver.restitution = 0.9;

        // Set smaller ball size for dense grids
        if (this.solver.ballRadius === 10) {
            this.solver.ballRadius = 4.0;
        }

        // Wave parameters - default to interference mode for best visuals
        if (this.waveMode === undefined) {
            this.waveMode = 'interference';
        }
        this.waveAmplitude = (this.waveAmplitude !== undefined) ? this.waveAmplitude : 200;
        this.waveFrequency = (this.waveFrequency !== undefined) ? this.waveFrequency : 3.0;
        this.waveSpeed = (this.waveSpeed !== undefined) ? this.waveSpeed : 2.0;
        this.time = 0;

        // Particle density control (1-50) - default 10 for good balance
        if (this.particleDensity === undefined) {
            this.particleDensity = 10;
        }

        // Calculate grid size based on density
        // Density 1 = 20x20 (400), Density 25 = 120x120 (14.4K), Density 50 = 226x226 (51K)
        const gridSize = Math.floor(20 + (this.particleDensity - 1) * 4.2);
        const rows = gridSize;
        const cols = gridSize;

        // Add margins to prevent edge glitches (5% on each side)
        const marginX = this.solver.width * 0.05;
        const marginY = this.solver.height * 0.05;
        const usableWidth = this.solver.width - (marginX * 2);
        const usableHeight = this.solver.height - (marginY * 2);

        const spacingX = usableWidth / (cols - 1);
        const spacingY = usableHeight / (rows - 1);

        let particleIndex = 0;
        const maxParticles = Math.min(this.solver.particleCount, rows * cols);

        for (let row = 0; row < rows && particleIndex < maxParticles; row++) {
            for (let col = 0; col < cols && particleIndex < maxParticles; col++) {
                const x = marginX + col * spacingX;
                const y = marginY + row * spacingY;

                const offsetX = (Math.random() - 0.5) * 3;
                const offsetY = (Math.random() - 0.5) * 3;

                const gridX = col / (cols - 1);
                const gridY = row / (rows - 1);

                // Use solver color scheme instead of hardcoded colors
                const colorIndex = row * cols + col;
                const color = this.solver.getColor(colorIndex, rows * cols);

                this.addParticle(particleIndex, x + offsetX, y + offsetY, 0, 0, this.solver.ballRadius, color);
                particleIndex++;
            }
        }

        this.solver.emittedCount = particleIndex;
        this.actualParticleCount = particleIndex;

        this.rows = rows;
        this.cols = cols;
        this.spacingX = spacingX;
        this.spacingY = spacingY;
        this.marginX = marginX;
        this.marginY = marginY;

        // Increase substeps for wave stability
        this.solver.substeps = 64;
    }

    update(dt) {
        if (this.solver.paused) return;

        this.time += dt;

        const particleCount = this.actualParticleCount;

        for (let i = 0; i < particleCount; i++) {
            const offset = i * 10;

            const row = Math.floor(i / this.cols);
            const col = i % this.cols;

            const gridX = col / (this.cols - 1);
            const gridY = row / (this.rows - 1);

            const baseX = this.marginX + col * this.spacingX;
            const baseY = this.marginY + row * this.spacingY;

            let xOffset = 0;
            let yOffset = 0;

            switch (this.waveMode) {
                case 'ocean':
                    const phase1 = gridY * Math.PI * 2 * this.waveFrequency + this.time * this.waveSpeed;
                    const phase2 = gridY * Math.PI * 2 * (this.waveFrequency * 0.5) + this.time * this.waveSpeed * 0.7;

                    xOffset = Math.sin(phase1) * this.waveAmplitude * (0.5 + gridY * 0.5);
                    xOffset += Math.sin(phase2) * this.waveAmplitude * 0.3 * (1 - gridY);

                    yOffset = Math.cos(phase1 * 0.5) * this.waveAmplitude * 0.3;
                    break;

                case 'ripple':
                    const centerX = 0.5;
                    const centerY = 0.5;
                    const dx_c = gridX - centerX;
                    const dy_c = gridY - centerY;
                    const dist = Math.sqrt(dx_c * dx_c + dy_c * dy_c);

                    const ripplePhase = dist * Math.PI * 2 * this.waveFrequency - this.time * this.waveSpeed * 3;
                    const rippleAmp = this.waveAmplitude * (1 - dist);

                    const angle = Math.atan2(dy_c, dx_c);
                    xOffset = Math.cos(angle) * Math.sin(ripplePhase) * rippleAmp;
                    yOffset = Math.sin(angle) * Math.sin(ripplePhase) * rippleAmp;
                    break;

                case 'sound':
                    const soundPhase = gridX * Math.PI * 2 * this.waveFrequency + this.time * this.waveSpeed * 2;
                    yOffset = Math.sin(soundPhase) * this.waveAmplitude * (0.3 + Math.abs(Math.sin(gridY * Math.PI)) * 0.7);
                    xOffset = Math.cos(soundPhase * 0.5) * this.waveAmplitude * 0.2;
                    break;

                case 'interference':
                    const wave1X = Math.sin((gridX + gridY) * Math.PI * 2 * this.waveFrequency + this.time * this.waveSpeed);
                    const wave1Y = Math.cos((gridX - gridY) * Math.PI * 2 * this.waveFrequency + this.time * this.waveSpeed);
                    const wave2X = Math.sin((gridX - gridY * 0.5) * Math.PI * 2 * this.waveFrequency * 1.3 - this.time * this.waveSpeed * 0.8);
                    const wave2Y = Math.cos((gridX + gridY * 0.5) * Math.PI * 2 * this.waveFrequency * 1.3 - this.time * this.waveSpeed * 0.8);

                    xOffset = (wave1X + wave2X) * this.waveAmplitude * 0.5;
                    yOffset = (wave1Y + wave2Y) * this.waveAmplitude * 0.5;
                    break;
            }

            const targetX = baseX + xOffset;
            const targetY = baseY + yOffset;

            const currentX = this.solver.simData[offset + 0];
            const currentY = this.solver.simData[offset + 1];
            const currentVx = this.solver.simData[offset + 2];
            const currentVy = this.solver.simData[offset + 3];

            const springStrength = 100.0;
            const dampingForce = 0.9;

            const dx = targetX - currentX;
            const dy = targetY - currentY;

            const forceX = dx * springStrength * dt;
            const forceY = dy * springStrength * dt;

            const newVx = currentVx * dampingForce + forceX;
            const newVy = currentVy * dampingForce + forceY;

            this.solver.simData[offset + 2] = newVx;
            this.solver.simData[offset + 3] = newVy;

            // Use solver color scheme with motion-based intensity
            const velocity = Math.sqrt(newVx * newVx + newVy * newVy);
            const intensity = Math.min(1, velocity / 200);

            const colorIndex = row * this.cols + col;
            let baseColor = this.solver.getColor(colorIndex, this.rows * this.cols);

            // Extract RGB and brighten based on velocity
            const r = (baseColor >> 16) & 0xFF;
            const g = (baseColor >> 8) & 0xFF;
            const b = baseColor & 0xFF;

            const boost = 1.0 + intensity * 0.5;
            const newR = Math.min(255, Math.floor(r * boost));
            const newG = Math.min(255, Math.floor(g * boost));
            const newB = Math.min(255, Math.floor(b * boost));

            this.solver.simDataUint[offset + 5] = (newR << 16) | (newG << 8) | newB;
        }

        this.solver.device.queue.writeBuffer(
            this.solver.particleBuffer,
            0,
            this.solver.simData.buffer
        );
    }

    cleanup() {
        this.solver.gravity = 4.0;
        this.solver.damping = 0.999;
        // Reset substeps to default
        this.solver.substeps = 32;
    }
}
