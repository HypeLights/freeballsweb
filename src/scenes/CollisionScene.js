import { Scene } from './Scene.js';

export class CollisionScene extends Scene {
    init(data, dataUint) {
        this.solver.obstacleCount = 0;
        this.solver.gravityType = 0; // Standard Gravity (but we'll set G to 0)
        this.solver.gravity = 0.0;   // Zero Gravity
        this.solver.damping = 1.0;   // No air resistance
        this.solver.restitution = 0.9; // Bouncy

        const cx = this.solver.width / 2;
        const cy = this.solver.height / 2;
        const width = this.solver.width;
        const height = this.solver.height;

        const groupSize = Math.floor(this.solver.particleCount / 2);
        const radius = this.solver.ballRadius;
        const spacing = radius * 2.0 + 1.0; // Small gap

        // Mixer settings - preserved across reinits
        if (this.mixerEnabled === undefined) this.mixerEnabled = false;
        if (this.mixerMode === undefined) this.mixerMode = 'vortex';
        if (this.mixerPower === undefined) this.mixerPower = 3000;

        // --- Group 1: Left Side (Fire) ---
        // Target center: 20% width, 50% height
        const pos1 = this.getPackedPositions(groupSize, width * 0.2, height * 0.5, spacing);

        for (let i = 0; i < groupSize; i++) {
            const p = pos1[i];
            const vx = 50 + Math.random() * 50; // Fast right
            const vy = (Math.random() - 0.5) * 20;

            // Fire Colors (Red/Orange/Yellow)
            const hue = Math.random() * 60;
            const color = this.solver.hslToRgb(hue, 1.0, 0.6);

            this.addParticle(i, p.x, p.y, vx, vy, radius, color);
        }

        // --- Group 2: Right Side (Ice) ---
        // Target center: 80% width, 50% height
        const pos2 = this.getPackedPositions(this.solver.particleCount - groupSize, width * 0.8, height * 0.5, spacing);

        for (let i = groupSize; i < this.solver.particleCount; i++) {
            const p = pos2[i - groupSize];
            const vx = -(50 + Math.random() * 50); // Fast left
            const vy = (Math.random() - 0.5) * 20;

            // Ice Colors (Cyan/Blue)
            const hue = 180 + Math.random() * 60;
            const color = this.solver.hslToRgb(hue, 1.0, 0.6);

            this.addParticle(i, p.x, p.y, vx, vy, radius, color);
        }

        this.solver.emittedCount = this.solver.particleCount;
        this.time = 0;

        // --- GPU Mixer Initialization ---
        if (!this.mixerPipeline) {
            this.initMixerGPU();
        }
    }

    getPackedPositions(count, centerX, centerY, spacing) {
        const positions = [];
        // Calculate grid dimensions to be roughly square-ish aspect ratio
        // N = rows * cols
        // cols / rows ~= 1 (square) -> cols ~= sqrt(N)
        const cols = Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);

        const width = (cols - 1) * spacing;
        const height = (rows - 1) * spacing * 0.866; // hex height factor sin(60)

        const startX = centerX - width / 2;
        const startY = centerY - height / 2;

        let placed = 0;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (placed >= count) break;

                // Hex offset for odd rows
                const offsetX = (r % 2 === 1) ? spacing * 0.5 : 0;

                const x = startX + c * spacing + offsetX;
                const y = startY + r * spacing * 0.866;

                positions.push({ x, y });
                placed++;
            }
        }
        return positions;
    }

    async initMixerGPU() {
        try {
            const shaderUrl = new URL('../shaders/mixer.wgsl', import.meta.url).href;
            const shaderCode = await (await fetch(shaderUrl)).text();

            // 1. Create Uniform Buffer
            // Size: 32 bytes (8 floats/uints)
            this.mixerParamsBuffer = this.solver.device.createBuffer({
                label: 'MixerParams',
                size: 32,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });

            // 2. Create Pipeline
            this.mixerPipeline = this.solver.device.createComputePipeline({
                layout: 'auto',
                compute: {
                    module: this.solver.device.createShaderModule({ code: shaderCode }),
                    entryPoint: 'main'
                }
            });

            // 3. Create Bind Group
            this.createMixerBindGroup();
        } catch (e) {
            console.error("Failed to init mixer GPU:", e);
        }
    }

    createMixerBindGroup() {
        if (!this.mixerPipeline) return;

        this.mixerBindGroup = this.solver.device.createBindGroup({
            layout: this.mixerPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.solver.particleBuffer } },
                { binding: 1, resource: { buffer: this.mixerParamsBuffer } }
            ]
        });
        this.currentParticleBuffer = this.solver.particleBuffer;
    }

    update(dt) {
        this.solver.gravity = 0.0;

        if (!this.mixerEnabled || !this.mixerPipeline) return;

        this.time += dt;

        // Check if particle buffer changed (resize)
        if (this.currentParticleBuffer !== this.solver.particleBuffer) {
            this.createMixerBindGroup();
        }

        // Map mode string to uint
        let modeIdx = 0; // Default Vortex
        switch (this.mixerMode) {
            case 'vortex': modeIdx = 0; break;
            case 'vertical': modeIdx = 1; break;
            case 'horizontal': modeIdx = 2; break;
            case 'chaos': modeIdx = 3; break;
            case 'corners': modeIdx = 4; break;
        }

        // Override mode if Smash is active (Button Held)
        if (this.mixerSmash) {
            modeIdx = 5;
        }

        // Update Params
        const params = new Float32Array([
            this.solver.width,      // width
            this.solver.height,     // height
            this.time,             // time
            this.mixerPower,       // power
        ]);

        // Write remaining uint params
        // Offset 4 floats = 16 bytes
        const uintData = new Uint32Array([
            modeIdx,
            this.solver.emittedCount,
            0, 0 // padding
        ]);

        this.solver.device.queue.writeBuffer(this.mixerParamsBuffer, 0, params);
        this.solver.device.queue.writeBuffer(this.mixerParamsBuffer, 16, uintData);

        // Dispatch Compute Shader
        const commandEncoder = this.solver.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.mixerPipeline);
        passEncoder.setBindGroup(0, this.mixerBindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(this.solver.emittedCount / 64));
        passEncoder.end();

        this.solver.device.queue.submit([commandEncoder.finish()]);
    }

    cleanup() {
        this.solver.gravity = 4.0;
        this.solver.damping = 0.999;
    }
}
