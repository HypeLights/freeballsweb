import { Scene } from './Scene.js';

export class WaveScene extends Scene {
    init(data, dataUint) {
        this.solver.obstacleCount = 0;
        this.solver.staticCount = 0;
        this.solver.obstacleCount = 0;
        this.solver.staticCount = 0;
        this.solver.gravityType = 0;
        // Gravity is handled by global defaults (or user override), do not force low gravity
        this.solver.damping = 0.98;
        this.solver.restitution = 0.9;

        // Set ball size for wave scene only on first load (when default 10)
        if (this.solver.ballRadius === 10) {
            this.solver.ballRadius = 3.0;
        }

        // Read from solver params directly
        // Fallbacks are handled by SolverProxy defaults
        this.time = 0;

        // Particle density control (1-50) - default 13 for wave scene
        this.particleDensity = this.solver.particleDensity || 13;

        // Calculate grid based on screen aspect ratio
        const aspect = this.solver.width / this.solver.height;
        const totalParticles = 200 + (this.particleDensity - 1) * 2000; // Scale from 200 to ~100k

        // rows * (rows * aspect) = total
        // rows^2 = total / aspect
        const rows = Math.floor(Math.sqrt(totalParticles / aspect));
        const cols = Math.floor(rows * aspect);

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

                // Removed random offset to eliminate "jitter" in spawning (perfect grid)
                const offsetX = 0;
                const offsetY = 0;

                const gridX = col / (cols - 1);
                const gridY = row / (rows - 1);

                // Use solver color scheme instead of hardcoded colors
                const colorIndex = row * cols + col;
                const color = this.solver.getColor(colorIndex, rows * cols);

                // Use addParticle logic but customized for Kinematic Wave
                const pIdx = particleIndex;
                const offset = pIdx * 10;

                this.solver.simData[offset + 0] = x + offsetX;
                this.solver.simData[offset + 1] = y + offsetY;
                this.solver.simData[offset + 2] = 0; // Vx
                this.solver.simData[offset + 3] = 0; // Vy
                this.solver.simData[offset + 4] = this.solver.ballRadius;
                this.solver.simDataUint[offset + 5] = color;

                // CRITICAL FIX: 
                // Type = 0 ensures it is RENDERED (Sim considers it Dynamic).
                // InvMass = 0.0 ensures PHYSICS ignores it (Infinite Mass = No Acceleration).
                // This allows CPU to control position 100% without fighting gravity.
                this.solver.simData[offset + 6] = 999999; // Mass (Arbitrary, visual only)
                this.solver.simData[offset + 7] = 0.0;    // InvMass (0 = Infinite Mass)
                this.solver.simData[offset + 8] = 0;      // Type (0 = Dynamic/Visible)
                this.solver.simData[offset + 9] = 0;      // Padding

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

        // DEBUG: Log init results
        console.log(`[WaveScene.init] SUCCESS: ${particleIndex} particles created.`);
        console.log(`[WaveScene.init] Grid: ${rows}x${cols}, Spacing: ${spacingX.toFixed(1)}x${spacingY.toFixed(1)}`);
        console.log(`[WaveScene.init] First Particle: pos=[${this.solver.simData[0].toFixed(1)}, ${this.solver.simData[1].toFixed(1)}], rad=${this.solver.simData[4].toFixed(1)}, col=0x${this.solver.simDataUint[5].toString(16)}`);
    }

    update(dt) {
        if (this.solver.paused) return;

        // Guard: Don't run update if scene isn't ready
        if (!this.cols || !this.rows || this.actualParticleCount === 0) {
            return;
        }

        this.time += dt;
        const particleCount = this.actualParticleCount;

        for (let i = 0; i < particleCount; i++) {
            const offset = i * 10;

            const row = Math.floor(i / this.cols);
            const col = i % this.cols;

            // Bounds check
            if (row >= this.rows) continue;

            const gridX = col / (this.cols - 1);
            const gridY = row / (this.rows - 1);

            const baseX = this.marginX + col * this.spacingX;
            const baseY = this.marginY + row * this.spacingY;

            let xOffset = 0;
            let yOffset = 0;

            switch (this.solver.waveMode) {
                case 'interference':
                    const wave1X = Math.sin((gridX + gridY) * Math.PI * 2 * this.solver.waveFrequency + this.time * this.solver.waveSpeed);
                    const wave1Y = Math.cos((gridX - gridY) * Math.PI * 2 * this.solver.waveFrequency + this.time * this.solver.waveSpeed);
                    const wave2X = Math.sin((gridX - gridY * 0.5) * Math.PI * 2 * this.solver.waveFrequency * 1.3 - this.time * this.solver.waveSpeed * 0.8);
                    const wave2Y = Math.cos((gridX + gridY * 0.5) * Math.PI * 2 * this.solver.waveFrequency * 1.3 - this.time * this.solver.waveSpeed * 0.8);

                    xOffset = (wave1X + wave2X) * this.solver.waveAmplitude * 0.5;
                    yOffset = (wave1Y + wave2Y) * this.solver.waveAmplitude * 0.5;
                    break;

                case 'vortex':
                    // Spiral vortex pattern
                    const vDist = Math.sqrt((gridX - 0.5) ** 2 + (gridY - 0.5) ** 2);
                    const vAngle = Math.atan2(gridY - 0.5, gridX - 0.5);
                    const spiralPhase = vAngle * 3 + vDist * Math.PI * 4 * this.solver.waveFrequency - this.time * this.solver.waveSpeed * 2;
                    const spiralAmp = this.solver.waveAmplitude * (0.3 + vDist * 0.7);

                    xOffset = Math.cos(vAngle + Math.PI / 2) * Math.sin(spiralPhase) * spiralAmp;
                    yOffset = Math.sin(vAngle + Math.PI / 2) * Math.sin(spiralPhase) * spiralAmp;
                    break;

                case 'plasma':
                    // Chaotic plasma-like movement with multiple overlapping frequencies
                    const p1 = Math.sin(gridX * Math.PI * 4 * this.solver.waveFrequency + this.time * this.solver.waveSpeed);
                    const p2 = Math.cos(gridY * Math.PI * 3 * this.solver.waveFrequency - this.time * this.solver.waveSpeed * 1.3);
                    const p3 = Math.sin((gridX + gridY) * Math.PI * 2 * this.solver.waveFrequency + this.time * this.solver.waveSpeed * 0.7);
                    const p4 = Math.cos((gridX - gridY) * Math.PI * 5 * this.solver.waveFrequency - this.time * this.solver.waveSpeed * 1.1);

                    xOffset = (p1 + p3) * this.solver.waveAmplitude * 0.4;
                    yOffset = (p2 + p4) * this.solver.waveAmplitude * 0.4;
                    break;

                case 'quantum':
                    // Quantum-like probability wave patterns with multiple interference
                    const q1X = Math.sin((gridX * 2 + gridY) * Math.PI * 2 * this.solver.waveFrequency + this.time * this.solver.waveSpeed);
                    const q1Y = Math.cos((gridX - gridY * 2) * Math.PI * 2 * this.solver.waveFrequency + this.time * this.solver.waveSpeed);
                    const q2X = Math.sin((gridX * 1.5 - gridY * 0.7) * Math.PI * 3 * this.solver.waveFrequency - this.time * this.solver.waveSpeed * 1.2);
                    const q2Y = Math.cos((gridX * 0.7 + gridY * 1.5) * Math.PI * 3 * this.solver.waveFrequency - this.time * this.solver.waveSpeed * 1.2);
                    const q3X = Math.sin((gridX + gridY * 0.3) * Math.PI * 4 * this.solver.waveFrequency + this.time * this.solver.waveSpeed * 0.6);
                    const q3Y = Math.cos((gridX * 0.3 - gridY) * Math.PI * 4 * this.solver.waveFrequency + this.time * this.solver.waveSpeed * 0.6);

                    xOffset = (q1X + q2X + q3X) * this.solver.waveAmplitude * 0.33;
                    yOffset = (q1Y + q2Y + q3Y) * this.solver.waveAmplitude * 0.33;
                    break;

                case 'galaxy':
                    // Rotating galaxy spiral arms
                    const gDist = Math.sqrt((gridX - 0.5) ** 2 + (gridY - 0.5) ** 2);
                    const gAngle = Math.atan2(gridY - 0.5, gridX - 0.5);
                    const armCount = 4;
                    const armPhase = gAngle * armCount + gDist * Math.PI * 6 - this.time * this.solver.waveSpeed;
                    const galaxyWave = Math.sin(armPhase) * Math.cos(gDist * Math.PI * 2 * this.solver.waveFrequency + this.time);

                    xOffset = Math.cos(gAngle) * galaxyWave * this.solver.waveAmplitude * (0.5 + gDist);
                    yOffset = Math.sin(gAngle) * galaxyWave * this.solver.waveAmplitude * (0.5 + gDist);
                    break;

                case 'diamond':
                    // Standing wave pattern creating diamond shapes
                    const dX = Math.sin(gridX * Math.PI * 4 * this.solver.waveFrequency) * Math.cos(this.time * this.solver.waveSpeed);
                    const dY = Math.sin(gridY * Math.PI * 4 * this.solver.waveFrequency) * Math.cos(this.time * this.solver.waveSpeed * 1.1);
                    const dCross = Math.sin((gridX + gridY) * Math.PI * 2 * this.solver.waveFrequency) * Math.sin(this.time * this.solver.waveSpeed * 0.8);

                    xOffset = (dX + dCross * 0.5) * this.solver.waveAmplitude * 0.6;
                    yOffset = (dY + dCross * 0.5) * this.solver.waveAmplitude * 0.6;
                    break;

                case 'tornado':
                    // Continuously rotating spiral - no reset, always flowing
                    const tDist = Math.sqrt((gridX - 0.5) ** 2 + (gridY - 0.5) ** 2);
                    const tAngle = Math.atan2(gridY - 0.5, gridX - 0.5);
                    const tRotation = tAngle + this.time * this.solver.waveSpeed * 0.5 + tDist * Math.PI * 3;
                    const tWave = Math.sin(tDist * Math.PI * 4 * this.solver.waveFrequency - this.time * this.solver.waveSpeed * 2);
                    const tStrength = 0.3 + tDist * 0.7; // Stronger at edges

                    xOffset = Math.cos(tRotation) * tWave * this.solver.waveAmplitude * tStrength;
                    yOffset = Math.sin(tRotation) * tWave * this.solver.waveAmplitude * tStrength;
                    break;

                case 'fractal':
                    // Self-similar fractal-like wave patterns at multiple scales
                    const f1 = Math.sin((gridX + gridY) * Math.PI * 2 * this.solver.waveFrequency + this.time * this.solver.waveSpeed);
                    const f2 = Math.sin((gridX * 2 + gridY * 2) * Math.PI * 2 * this.solver.waveFrequency + this.time * this.solver.waveSpeed * 1.5) * 0.5;
                    const f3 = Math.sin((gridX * 4 + gridY * 4) * Math.PI * 2 * this.solver.waveFrequency + this.time * this.solver.waveSpeed * 2) * 0.25;
                    const f4 = Math.sin((gridX * 8 - gridY * 8) * Math.PI * 2 * this.solver.waveFrequency - this.time * this.solver.waveSpeed * 2.5) * 0.125;

                    const fY1 = Math.cos((gridX - gridY) * Math.PI * 2 * this.solver.waveFrequency + this.time * this.solver.waveSpeed);
                    const fY2 = Math.cos((gridX * 2 - gridY * 2) * Math.PI * 2 * this.solver.waveFrequency + this.time * this.solver.waveSpeed * 1.5) * 0.5;
                    const fY3 = Math.cos((gridX * 4 - gridY * 4) * Math.PI * 2 * this.solver.waveFrequency + this.time * this.solver.waveSpeed * 2) * 0.25;

                    xOffset = (f1 + f2 + f3 + f4) * this.solver.waveAmplitude * 0.4;
                    yOffset = (fY1 + fY2 + fY3) * this.solver.waveAmplitude * 0.4;
                    break;

                case 'electric':
                    // Lightning-like chaotic patterns with sharp movements
                    const ePhase = this.time * this.solver.waveSpeed;
                    const noise1 = Math.sin(gridX * Math.PI * 7 * this.solver.waveFrequency + ePhase * 3) * Math.cos(gridY * Math.PI * 5 + ePhase * 2);
                    const noise2 = Math.sin(gridY * Math.PI * 6 * this.solver.waveFrequency - ePhase * 2.5) * Math.cos(gridX * Math.PI * 8 - ePhase * 1.8);
                    const spark = Math.sin((gridX * gridY) * Math.PI * 10 * this.solver.waveFrequency + ePhase * 4);
                    const bolt = Math.sin((gridX + gridY * 0.5) * Math.PI * 3 * this.solver.waveFrequency + spark * 2 + ePhase);

                    xOffset = (noise1 + bolt * 0.5) * this.solver.waveAmplitude * 0.5;
                    yOffset = (noise2 + spark * 0.3) * this.solver.waveAmplitude * 0.5;
                    break;


                case 'ripple':
                    const centerX = 0.5;
                    const centerY = 0.5;
                    const dx_c = gridX - centerX;
                    const dy_c = gridY - centerY;
                    const dist = Math.sqrt(dx_c * dx_c + dy_c * dy_c);

                    const ripplePhase = dist * Math.PI * 2 * this.solver.waveFrequency - this.time * this.solver.waveSpeed * 3;
                    const rippleAmp = this.solver.waveAmplitude * (1 - dist);

                    const angle = Math.atan2(dy_c, dx_c);
                    xOffset = Math.cos(angle) * Math.sin(ripplePhase) * rippleAmp;
                    yOffset = Math.sin(angle) * Math.sin(ripplePhase) * rippleAmp;
                    break;

                case 'sound':
                    const soundPhase = gridX * Math.PI * 2 * this.solver.waveFrequency + this.time * this.solver.waveSpeed * 2;
                    yOffset = Math.sin(soundPhase) * this.solver.waveAmplitude * (0.3 + Math.abs(Math.sin(gridY * Math.PI)) * 0.7);
                    xOffset = Math.cos(soundPhase * 0.5) * this.solver.waveAmplitude * 0.2;
                    break;

                default: // 'interference2' - simple version
                    const simpleWave1X = Math.sin((gridX + gridY) * Math.PI * 2 * this.solver.waveFrequency + this.time * this.solver.waveSpeed);
                    const simpleWave1Y = Math.cos((gridX - gridY) * Math.PI * 2 * this.solver.waveFrequency + this.time * this.solver.waveSpeed);

                    xOffset = simpleWave1X * this.solver.waveAmplitude * 0.5;
                    yOffset = simpleWave1Y * this.solver.waveAmplitude * 0.5;
                    break;
            }

            const targetX = baseX + xOffset;
            const targetY = baseY + yOffset;

            // Update position
            this.solver.simData[offset + 0] = targetX;
            this.solver.simData[offset + 1] = targetY;

            // Reset velocity to prevent physics drift
            this.solver.simData[offset + 2] = 0;
            this.solver.simData[offset + 3] = 0;

            // Update radius from current solver setting (allows live radius changes)
            this.solver.simData[offset + 4] = this.solver.ballRadius;

            // Update color from current color scheme (allows live color changes)
            const colorIndex = row * this.cols + col;
            const color = this.solver.getColor(colorIndex, this.rows * this.cols);
            this.solver.simDataUint[offset + 5] = color;

            // Ensure InvMass stays 0 (infinite mass - physics ignores these particles)
            this.solver.simData[offset + 7] = 0.0;
        }

        // Upload to GPU
        this.solver.device.queue.writeBuffer(
            this.solver.particleBuffer,
            0,
            this.solver.simData.buffer
        );
    }

    cleanup() {
        this.solver.gravity = 6.0;
        this.solver.damping = 0.999;
        // Reset substeps to default
        this.solver.substeps = 32;
    }
}

