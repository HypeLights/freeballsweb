import { BufferManager } from './BufferManager.js';
import { GridScene } from '../scenes/GridScene.js';
import { ChaosScene } from '../scenes/ChaosScene.js';
import { GaltonScene } from '../scenes/GaltonScene.js';
import { FountainScene } from '../scenes/FountainScene.js';
import { CollisionScene } from '../scenes/CollisionScene.js';
import { FireworksScene } from '../scenes/FireworksScene.js';
import { LatticeScene } from '../scenes/LatticeScene.js';
import { WaveScene } from '../scenes/WaveScene.js';

export class AVBDSolver {
    constructor(gpuContext) {
        this.gpu = gpuContext;
        this.device = gpuContext.device;
        this.bufferManager = new BufferManager(this.device);

        // Scenes
        this.scenes = {
            'grid': new GridScene(this),
            'chaos': new ChaosScene(this),
            'galton': new GaltonScene(this),
            'fountain': new FountainScene(this),
            'collision': new CollisionScene(this),
            'fireworks': new FireworksScene(this),
            'lattice': new LatticeScene(this),
            'wave': new WaveScene(this)
        };
        this.currentSceneObject = this.scenes['grid'];

        // Simulation Parameters
        this.maxParticles = 1000000;
        this.particleCount = 4000; // Updated to match UI default
        this.maxObstacles = 1000; // Increased to allow full screen of buckets
        this.obstacleCount = 0;

        this.gravityType = 0; // 0 = Down, 1 = Center
        // Black Hole params are now backed by fields
        // Physics Parameters
        this._gravity = 4.0;
        this._restitution = 0.8;
        this._damping = 0.999;
        this._alpha = 0.95; // Regularization (Paper value)
        this._beta = 10.0;  // Stiffness Ramping (Paper value)
        this._substeps = 4;
        this._iterations = 4;
        this._ballRadius = 10;

        this._blackHoleGravity = 4.0;
        this._blackHoleRepulsion = 1.0;
        this._blackHoleSwirl = 1.0;
        this._blackHoleRadius = 30.0;
        this._colorScheme = 'rainbow';
        this.spawnRate = 5;

        // Interaction Parameters
        this._mousePower = 250;
        this._mouseRadius = 200;

        // Galton Scene Parameters
        this._galtonSpawnerDistance = 100;
        this._galtonPegSize = 3;
        this._galtonSpawnRate = 5;
        this._galtonBucketSpacing = 40;
        this._galtonBucketHeight = 0; // Will be set in resetParams or init


        // Fireworks Parameters
        this._fireworksSpawnRate = 1.0;
        this._fireworksExplosionSize = 100;
        this._fireworksRocketSpeed = 1.5;
        this._fireworksExplosionSpeed = 1.0;

        // Planetary Parameters
        this._planetaryBallVariance = 0.5;

        // Render Parameters
        this._bloomEnabled = true;
        this._aaEnabled = true;
        this._bloomStrength = 0.2;
        this._bloomThreshold = 0.9;
        this._bloomRadius = 0.2;
        this.simSpeed = 1.0;

        // Grid Parameters
        this.width = 1920; // Default, will be updated by resize
        this.height = 1080;
        this.cellSize = 4; // Min Cell Size (Radius 2.0) for worst-case allocation
        this.gridCols = Math.ceil(this.width / this.cellSize);
        this.gridRows = Math.ceil(this.height / this.cellSize);
        this.maxGridCells = this.gridCols * this.gridRows;

        // Pipelines
        this.spatialHashPipeline = null;
        this.solverPipeline = null;
        this.renderPipeline = null;

        // Bind Groups
        this.computeBindGroup = null;
        this.renderBindGroup = null;

        this.initialized = false;
        this.paused = false;
        this.isReadingSpawns = false;
    }

    resetParams() {
        // Physics
        this._gravity = 4.0;
        this._restitution = 0.8;
        this._damping = 0.999;
        this._substeps = 2;
        this._iterations = 5;
        this.simSpeed = 1.0;
        this.ballRadius = 10;
        this._alpha = 0.001;
        this._beta = 0.2;

        // Interaction
        this._mousePower = 250;
        this._mouseRadius = 200;

        // Render
        this._bloomStrength = 0.2;
        this._bloomRadius = 0.2;
        this._bloomThreshold = 0.9;
        this._aaEnabled = true;
        this._bloomEnabled = true;

        // Particles
        const oldParticleCount = this.particleCount;
        this.particleCount = 4000;

        // Scene Specifics
        // Galton
        this.galtonSpawnerDistance = 100;
        this.galtonPegSize = 3;
        this.galtonSpawnRate = 5;
        this.galtonBucketSpacing = 40;
        this.galtonBucketHeight = Math.floor(this.height * 0.4);

        // Fireworks
        this.fireworksSpawnRate = 3.0; // Default from Overlay
        this.fireworksExplosionSize = 100;
        this.fireworksRocketSpeed = 2.2; // Default from Overlay

        // Planetary
        this.blackHoleGravity = 2.0;
        this.blackHoleSwirl = 0.0;
        this.planetaryBallVariance = 0.5;

        // Fountain
        this._fountainSpawnRate = 500;

        // Wave
        if (this.scenes['wave']) {
            this.scenes['wave'].waveAmplitude = 200;
            this.scenes['wave'].waveSpeed = 2.0;
            this.scenes['wave'].waveFrequency = 3.0;
            this.scenes['wave'].particleDensity = 10;
        }

        // Mixer
        if (this.scenes['collision']) {
            this.scenes['collision'].mixerPower = 3000;
            this.scenes['collision'].mixerMode = 'vortex';
        }

        // Update uniforms
        this.updateParams();

        // Re-init particles to apply all changes (especially scene-specific ones like Galton pegs)
        this.initParticles(this.currentScene);
    }

    async init() {
        await this.loadShaders();
        this.createBuffers();
        this.createPipelines();
        this.createBindGroups();
        this.initParticles('grid');
        this.initialized = true;
        console.log("AVBD Solver Initialized");
    }

    async loadShaders() {
        const loadShader = async (path) => {
            const response = await fetch(new URL(path, import.meta.url).href);
            return await response.text();
        };

        this.spatialHashShader = await loadShader('../shaders/spatial_hash.wgsl');
        this.colorGraphShader = await loadShader('../shaders/color_graph.wgsl');
        this.solverShader = await loadShader('../shaders/avbd_solver.wgsl');
        this.renderShader = await loadShader('../shaders/render.wgsl');
        this.colorUpdateShader = await loadShader('../shaders/update_colors.wgsl');
    }

    createBuffers() {
        // 1. Particle Buffer
        const particleStride = 40;
        this.particleBuffer = this.bufferManager.createBuffer(
            'particles',
            this.maxParticles * particleStride,
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX
        );

        // 2. Grid Buffers
        this.gridCountersBuffer = this.bufferManager.createBuffer(
            'gridCounters',
            this.maxGridCells * 4,
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        );

        this.gridCellsBuffer = this.bufferManager.createBuffer(
            'gridCells',
            this.maxGridCells * 128 * 4,
            GPUBufferUsage.STORAGE
        );

        // 3. Uniform Buffers
        this.gridParamsBuffer = this.bufferManager.createBuffer(
            'gridParams',
            32,
            GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        );

        this.simParamsBuffer = this.device.createBuffer({
            label: 'simParams',
            size: 80, // Increased to include beta
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.renderParamsBuffer = this.bufferManager.createBuffer(
            'renderParams',
            32,
            GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        );

        this.avbdParamsBuffer = this.bufferManager.createBuffer(
            'avbdParams',
            32,
            GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        );

        // 4. Obstacle Buffer
        this.obstacleBuffer = this.bufferManager.createBuffer(
            'obstacles',
            this.maxObstacles * 32, // 8 floats * 4 bytes
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        );

        // 5. Spawn Buffers
        this.spawnStatusBuffer = this.device.createBuffer({
            size: 16, // 3 ints + padding
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });

        this.spawnStagingBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
        });

        this.spawnerBlocked = [0, 0, 0];

        // 6. Color Update Buffers
        this.colorUpdateBuffer = this.bufferManager.createBuffer(
            'colorUpdate',
            this.maxParticles * 4, // 1 uint per particle
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        );

        this.colorParamsBuffer = this.bufferManager.createBuffer(
            'colorParams',
            16, // 4 uints
            GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        );



        // 7. Wall Lambda Buffer (Persistent AVBD State)
        this.wallLambdasBuffer = this.bufferManager.createBuffer(
            'wallLambdas',
            this.maxParticles * 16, // vec4<f32> per particle
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        );


    }

    createPipelines() {
        // 1. Spatial Hash Pipeline
        this.spatialHashPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: this.device.createShaderModule({ code: this.spatialHashShader }),
                entryPoint: 'main',
            },
        });

        // 2. Solver Pipeline
        this.solverPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: this.device.createShaderModule({ code: this.solverShader }),
                entryPoint: 'main',
            },
        });

        // Check Spawn Pipeline
        const checkSpawnShader = `
            struct GridParams {
                width: f32,
                height: f32,
                cellSize: f32,
                gridCols: u32,
                gridRows: u32,
                activeCount: u32,
                spawnerSpread: f32
            };

            @group(0) @binding(0) var<uniform> gridParams: GridParams;
            @group(0) @binding(1) var<storage, read_write> gridCounters: array<atomic<u32>>;
            @group(0) @binding(2) var<storage, read_write> spawnStatus: array<u32>;

            @compute @workgroup_size(1)
            fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
                let spawnerIdx = global_id.x;
                if (spawnerIdx >= 3u) { return; }

                let centerX = gridParams.width * 0.5;
                let spread = gridParams.spawnerSpread;
                let spawnY = 50.0;
                
                var spawnX = centerX;
                if (spawnerIdx == 1u) { spawnX = centerX - spread; }
                else if (spawnerIdx == 2u) { spawnX = centerX + spread; }

                // Check grid cell
                let col = u32(spawnX / gridParams.cellSize);
                let row = u32(spawnY / gridParams.cellSize);
                
                // Check 3x3 area around spawn point to be safe
                var blocked = 0u;
                
                for (var r = -1; r <= 1; r++) {
                    for (var c = -1; c <= 1; c++) {
                        let checkCol = i32(col) + c;
                        let checkRow = i32(row) + r;
                        
                        if (checkCol >= 0 && checkCol < i32(gridParams.gridCols) && 
                            checkRow >= 0 && checkRow < i32(gridParams.gridRows)) {
                            
                            let cellIdx = u32(checkRow) * gridParams.gridCols + u32(checkCol);
                            let count = atomicLoad(&gridCounters[cellIdx]);
                            if (count > 0u) {
                                blocked = 1u;
                            }
                        }
                    }
                }

                spawnStatus[spawnerIdx] = blocked;
            }
        `;

        this.checkSpawnPipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: this.device.createShaderModule({ code: checkSpawnShader }),
                entryPoint: 'main'
            }
        });

        // 3. Render Pipeline (Particles)
        this.renderPipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: this.device.createShaderModule({ code: this.renderShader }),
                entryPoint: 'vs_main'
            },
            fragment: {
                module: this.device.createShaderModule({ code: this.renderShader }),
                entryPoint: 'fs_main',
                targets: [{
                    format: navigator.gpu.getPreferredCanvasFormat(),
                    blend: {
                        color: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add',
                        }
                    }
                }]
            },
            primitive: { topology: 'triangle-strip' }
        });

        // 4. Obstacle Render Pipeline
        this.obstacleRenderPipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: this.device.createShaderModule({ code: this.renderShader }),
                entryPoint: 'vs_obstacle'
            },
            fragment: {
                module: this.device.createShaderModule({ code: this.renderShader }),
                entryPoint: 'fs_obstacle',
                targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }]
            },
            primitive: { topology: 'triangle-strip' }
        });

        // 5. Color Update Pipeline
        this.colorUpdatePipeline = this.device.createComputePipeline({
            layout: 'auto',
            compute: {
                module: this.device.createShaderModule({ code: this.colorUpdateShader }),
                entryPoint: 'main'
            }
        });


    }

    createBindGroups() {
        // Compute Bind Group
        this.solverBindGroup = this.device.createBindGroup({
            layout: this.solverPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBuffer } },
                { binding: 1, resource: { buffer: this.gridCountersBuffer } },
                { binding: 2, resource: { buffer: this.gridCellsBuffer } },
                { binding: 3, resource: { buffer: this.gridParamsBuffer } },
                { binding: 4, resource: { buffer: this.simParamsBuffer } },
                { binding: 5, resource: { buffer: this.obstacleBuffer } },
                { binding: 6, resource: { buffer: this.wallLambdasBuffer } }
            ]
        });

        // Spatial Hash Bind Group
        this.spatialHashBindGroup = this.device.createBindGroup({
            layout: this.spatialHashPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBuffer } },
                { binding: 1, resource: { buffer: this.gridCountersBuffer } },
                { binding: 2, resource: { buffer: this.gridCellsBuffer } },
                { binding: 3, resource: { buffer: this.gridParamsBuffer } },
                { binding: 4, resource: { buffer: this.simParamsBuffer } }
            ]
        });

        // Render Bind Group (Particles: 0=Particles, 1=Params)
        this.renderBindGroup = this.device.createBindGroup({
            layout: this.renderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBuffer } },
                { binding: 1, resource: { buffer: this.renderParamsBuffer } }
            ]
        });

        // Obstacle Bind Group (Obstacles: 1=Params, 2=Obstacles)
        // Note: vs_obstacle uses params (1) and obstacles (2). It does NOT use particles (0).
        // The layout generated by 'auto' will reflect this.
        this.obstacleBindGroup = this.device.createBindGroup({
            layout: this.obstacleRenderPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 1, resource: { buffer: this.renderParamsBuffer } },
                { binding: 2, resource: { buffer: this.obstacleBuffer } }
            ]
        });
    }

    initParticles(sceneType = 'grid') {
        this.gravityType = 0; // Reset gravity type to default (Down)
        this.currentScene = sceneType; // CRITICAL FIX: Update current scene state

        // 1. Determine required count
        let requiredCount = this.particleCount; // Default from slider

        if (this.currentSceneObject) {
            this.currentSceneObject.cleanup();
        }

        this.currentSceneObject = this.scenes[sceneType];
        if (!this.currentSceneObject) {
            console.error(`Scene '${sceneType}' not found! Defaulting to grid.`);
            sceneType = 'grid';
            this.currentSceneObject = this.scenes['grid'];
        }

        if (sceneType === 'galton') {
            const pegCount = this.getPegCount();
            requiredCount += pegCount + 3000;
        }

        // 2. Resize GPU Buffer if needed
        const neededBytes = requiredCount * 40; // 10 floats * 4 bytes
        if (!this.particleBuffer || this.particleBuffer.size !== neededBytes) {
            // Destroy old buffer if it exists
            if (this.particleBuffer) this.particleBuffer.destroy();

            this.maxParticles = requiredCount;
            this.particleBuffer = this.bufferManager.createBuffer(
                'particles',
                neededBytes,
                GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX
            );

            this.checkSpawnBindGroup = this.device.createBindGroup({
                layout: this.checkSpawnPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: { buffer: this.gridParamsBuffer } },
                    { binding: 1, resource: { buffer: this.gridCountersBuffer } },
                    { binding: 2, resource: { buffer: this.spawnStatusBuffer } }
                ]
            });
            this.createBindGroups();
        }

        // Update maxParticles to match
        this.maxParticles = requiredCount;

        this.simData = new Float32Array(this.maxParticles * 10);
        this.simDataUint = new Uint32Array(this.simData.buffer); // View for writing bits directly

        // Reset counters
        this.staticCount = 0;
        this.emittedCount = 0;

        // Initialize Scene
        if (this.currentSceneObject) {
            this.currentSceneObject.init(this.simData, this.simDataUint);
        }

        // Upload to GPU
        // Use the ArrayBuffer directly to ensure we copy the raw bytes, 
        // preventing any float/NaN canonicalization issues in Firefox.
        this.bufferManager.writeBuffer('particles', this.simData.buffer);

        // Clear Wall Lambdas (Reset persistent forces)
        if (this.wallLambdasBuffer) {
            const zeroLambdas = new Float32Array(this.maxParticles * 4); // vec4 per particle
            this.bufferManager.writeBuffer('wallLambdas', zeroLambdas.buffer);
        }





        // Wave Scene Specifics
        if (sceneType === 'wave') {
            this.substeps = 64;
        } else if (this.substeps > 20) {
            this.substeps = 4;
        }

        this.updateParams();
    }

    getPegCount() {
        const pegSpacingX = 30;
        const cols = Math.floor(this.width / pegSpacingX);
        const rows = 20;
        return rows * cols;
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
        this.gridCols = Math.ceil(this.width / this.cellSize);
        this.gridRows = Math.ceil(this.height / this.cellSize);
        this.maxGridCells = this.gridCols * this.gridRows;

        // Re-create grid buffers if needed (omitted for now as maxGridCells is usually large enough or we just accept it)
        // Ideally we should recreate buffers if size increases significantly.
    }

    setRadiusAndReset(newRadius) {
        this.ballRadius = newRadius;
        // Adaptive Grid: Cell size must be > diameter (2*r) for 3x3 check to work.
        // We use 2.1 * r to be safe and efficient.
        // Minimum 5 to allow for smaller particles without excessive cells.
        this.cellSize = Math.max(5, this.ballRadius * 2.1);
        this.initParticles(this.currentScene);
    }






    addObstacle(data, x, y, hw, hh, rot) {
        if (this.obstacleCount >= this.maxObstacles) return;
        const offset = this.obstacleCount * 8;
        data[offset + 0] = x;
        data[offset + 1] = y;
        data[offset + 2] = hw; // Half-width
        data[offset + 3] = hh; // Half-height
        data[offset + 4] = rot; // Rotation (radians)
        data[offset + 5] = 0; // Padding/Color
        data[offset + 6] = 0;
        data[offset + 7] = 0;
        this.obstacleCount++;
    }





    getRainbowColor(i, total) {
        // Vibrant smooth rainbow using HSL
        const hue = (i / total) * 360;
        return this.hslToRgb(hue, 1.0, 0.6);
    }

    getSineRainbowColor(t) {
        // Phase-shifted sine waves for smooth, natural rainbow
        // r(t) = sin(2πt)
        // g(t) = sin(2πt + 2π/3)
        // b(t) = sin(2πt + 4π/3)

        const r = Math.sin(6.28318 * t + 0) * 127 + 128;
        const g = Math.sin(6.28318 * t + 2.09439) * 127 + 128;
        const b = Math.sin(6.28318 * t + 4.18879) * 127 + 128;

        return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
    }

    async updateColorsGPU(colors, startIndex, count) {
        // 1. Check if persistent buffer is large enough
        // If maxParticles increased (via resize), we might need to recreate this buffer.
        if (this.colorUpdateBuffer.size < count * 4) {
            this.colorUpdateBuffer.destroy();
            this.colorUpdateBuffer = this.device.createBuffer({
                label: 'colorUpdatePersistent',
                size: Math.max(this.maxParticles, count) * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
            });
        }

        // 2. Write Data
        this.device.queue.writeBuffer(this.colorUpdateBuffer, 0, colors);
        // Pad to 4 elements (16 bytes) to match Uniform Buffer alignment
        this.device.queue.writeBuffer(this.colorParamsBuffer, 0, new Uint32Array([startIndex, count, 0, 0]));

        // 3. Create Bind Group (Can we reuse this too? Yes, if buffers don't change)
        // But for now, creating a bind group is cheap enough.
        const bindGroup = this.device.createBindGroup({
            layout: this.colorUpdatePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.particleBuffer } },
                { binding: 1, resource: { buffer: this.colorUpdateBuffer } },
                { binding: 2, resource: { buffer: this.colorParamsBuffer } }
            ]
        });

        // 4. Dispatch
        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.colorUpdatePipeline);
        passEncoder.setBindGroup(0, bindGroup);
        passEncoder.dispatchWorkgroups(Math.ceil(count / 64));
        passEncoder.end();
        this.device.queue.submit([commandEncoder.finish()]);

        // 5. No Cleanup Needed (Persistent Buffers)
    }

    applyColorScheme() {
        const scheme = this._colorScheme;

        let loopLimit = this.particleCount;
        let start = 0;
        const maxEmitted = this.particleCount;

        if (this.currentScene === 'galton') {
            loopLimit = this.emittedCount;
            start = this.staticCount; // Skip static pegs
        }

        // Safety check to prevent buffer overrun
        if (start + loopLimit > this.maxParticles) {
            loopLimit = this.maxParticles - start;
        }

        if (loopLimit <= 0) return;

        // Generate Colors on CPU (Fast)
        const colors = new Uint32Array(loopLimit);
        for (let i = 0; i < loopLimit; i++) {
            colors[i] = this.getColor(i, maxEmitted);
        }

        // Upload to GPU
        this.updateColorsGPU(colors, start, loopLimit);
    }

    set colorScheme(val) {
        this._colorScheme = val;
        if (this.initialized) {
            this.applyColorScheme();
        }
    }

    get colorScheme() {
        return this._colorScheme;
    }

    updateColors() {
        if (!this.simDataUint) return;

        // Update colors for all potential particles
        // We iterate up to maxParticles because we don't know which are active/emitted,
        // and updating all is safer than tracking indices. 
        // Performance: 300k iterations is ~5-10ms on CPU. Acceptable for UI click.

        for (let i = 0; i < this.maxParticles; i++) {
            // Skip static particles (pegs) if we want to preserve their color?
            // Usually pegs are white or fixed. 
            // If we want themes to apply to pegs too, we include them.
            // Let's include them for now.

            const color = this.getColor(i, this.maxParticles);
            // Color is at offset 3 (floats) = index 3 (uints)
            // Stride is 10 floats = 10 uints
            this.simDataUint[i * 10 + 3] = color;
        }

        // Upload to GPU
        this.bufferManager.writeBuffer('particles', this.simData.buffer);
    }

    getColor(i, total) {
        const t = i / total;

        switch (this.colorScheme) {
            case 'rainbow':
                return this.hslToRgb(t * 360, 1.0, 0.6);

            case 'sunset':
                // Purple -> Red -> Orange -> Yellow
                // 0.0: 60, 0, 100 (Purple)
                // 1.0: 255, 200, 0 (Yellow)
                return this.interpolateColors(t, [
                    [45, 10, 70],   // Deep Purple
                    [180, 40, 60],  // Reddish
                    [255, 100, 0],  // Orange
                    [255, 220, 50]  // Yellow
                ]);

            case 'ocean':
                // Deep Blue -> Cyan -> White
                return this.interpolateColors(t, [
                    [0, 10, 60],    // Dark Blue
                    [0, 100, 200],  // Blue
                    [0, 200, 255],  // Cyan
                    [200, 240, 255] // White-ish
                ]);

            case 'forest':
                // Dark Green -> Lime -> Yellow
                return this.interpolateColors(t, [
                    [10, 40, 10],   // Dark Green
                    [30, 120, 40],  // Green
                    [100, 200, 50], // Lime
                    [200, 220, 100] // Yellow-Green
                ]);

            case 'plasma':
                // Blue -> Purple -> Red -> Yellow (Plasma-like)
                return this.interpolateColors(t, [
                    [13, 8, 135],   // Blue
                    [156, 23, 158], // Purple
                    [237, 121, 83], // Orange-Red
                    [240, 249, 33]  // Yellow
                ]);

            case 'viridis':
                // Purple -> Blue -> Green -> Yellow
                return this.interpolateColors(t, [
                    [68, 1, 84],    // Purple
                    [49, 104, 142], // Blue
                    [53, 183, 121], // Green
                    [253, 231, 37]  // Yellow
                ]);

            case 'neon':
                // Hot Pink -> Cyan -> Lime
                return this.interpolateColors(t, [
                    [255, 0, 128],  // Hot Pink
                    [0, 255, 255],  // Cyan
                    [0, 255, 0]     // Lime
                ]);

            case 'pastel':
                // Soft Pink -> Soft Blue -> Soft Green
                return this.hslToRgb(t * 360, 0.7, 0.8);

            case 'cool':
                // Blue -> Cyan -> Purple
                return this.interpolateColors(t, [
                    [0, 50, 200],
                    [0, 200, 255],
                    [150, 50, 255]
                ]);

            case 'warm':
                // Red -> Orange -> Yellow
                return this.interpolateColors(t, [
                    [200, 0, 0],
                    [255, 100, 0],
                    [255, 255, 0]
                ]);

            // --- New Gradients ---

            case 'fire':
                // Black -> Red -> Yellow -> White
                return this.interpolateColors(t, [
                    [0, 0, 0],
                    [255, 0, 0],
                    [255, 255, 0],
                    [255, 255, 255]
                ]);

            case 'ice':
                // White -> Cyan -> Blue -> Dark Blue
                return this.interpolateColors(t, [
                    [255, 255, 255],
                    [0, 255, 255],
                    [0, 100, 255],
                    [0, 0, 100]
                ]);

            case 'earth':
                // Brown -> Green -> Dark Green
                return this.interpolateColors(t, [
                    [100, 50, 0],
                    [50, 100, 0],
                    [0, 50, 0]
                ]);

            case 'berry':
                // Purple -> Magenta -> Pink
                return this.interpolateColors(t, [
                    [100, 0, 100],
                    [200, 0, 200],
                    [255, 100, 200]
                ]);

            case 'gold':
                // Dark Gold -> Gold -> Light Gold
                return this.interpolateColors(t, [
                    [100, 80, 0],
                    [255, 215, 0],
                    [255, 255, 150]
                ]);

            case 'grayscale':
                // Black -> White
                const val = Math.round(t * 255);
                return (val << 16) | (val << 8) | val;

            case 'synthwave':
                // Deep Purple -> Magenta -> Cyan
                return this.interpolateColors(t, [
                    [40, 0, 80],
                    [255, 0, 255],
                    [0, 255, 255]
                ]);

            case 'cotton_candy':
                // Pink -> Light Blue
                return this.interpolateColors(t, [
                    [255, 180, 220],
                    [180, 220, 255]
                ]);

            case 'midnight':
                // Black -> Dark Blue -> Midnight Blue
                return this.interpolateColors(t, [
                    [0, 0, 0],
                    [0, 0, 50],
                    [25, 25, 112]
                ]);

            case 'coffee':
                // Dark Brown -> Brown -> Beige
                return this.interpolateColors(t, [
                    [50, 20, 0],
                    [100, 50, 20],
                    [200, 180, 150]
                ]);

            case 'mint':
                // Dark Green -> Mint -> White
                return this.interpolateColors(t, [
                    [0, 50, 20],
                    [100, 255, 180],
                    [255, 255, 255]
                ]);

            case 'lava':
                // Black -> Red -> Orange
                return this.interpolateColors(t, [
                    [20, 0, 0],
                    [200, 0, 0],
                    [255, 100, 0]
                ]);

            case 'sky':
                // Deep Sky Blue -> Sky Blue -> White
                return this.interpolateColors(t, [
                    [0, 100, 200],
                    [135, 206, 235],
                    [255, 255, 255]
                ]);

            case 'cherry':
                // Dark Red -> Red -> Pink
                return this.interpolateColors(t, [
                    [100, 0, 0],
                    [255, 0, 0],
                    [255, 150, 150]
                ]);

            case 'lemon_lime':
                // Green -> Yellow
                return this.interpolateColors(t, [
                    [0, 200, 0],
                    [200, 255, 0],
                    [255, 255, 0]
                ]);

            case 'ultraviolet':
                // Black -> Purple -> Violet
                return this.interpolateColors(t, [
                    [0, 0, 0],
                    [100, 0, 200],
                    [200, 100, 255]
                ]);

            case 'dawn':
                // Orange -> Pink -> Blue
                return this.interpolateColors(t, [
                    [255, 100, 50],
                    [255, 150, 200],
                    [100, 150, 255]
                ]);

            case 'dusk':
                // Blue -> Purple -> Orange
                return this.interpolateColors(t, [
                    [50, 50, 150],
                    [100, 50, 100],
                    [200, 100, 50]
                ]);

            case 'matrix':
                // Black -> Green -> Light Green
                return this.interpolateColors(t, [
                    [0, 20, 0],
                    [0, 200, 0],
                    [150, 255, 150]
                ]);

            case 'candy':
                // Red/White Stripes (Discrete)
                const stripe = Math.floor(t * 20) % 2;
                return stripe === 0 ? 0xFF0000 : 0xFFFFFF;

            default:
                return this.hslToRgb(t * 360, 1.0, 0.5);
        }
    }

    interpolateColors(t, stops) {
        if (stops.length < 2) return this.rgbToInt(stops[0][0], stops[0][1], stops[0][2]);

        // Map t (0-1) to segments
        const segments = stops.length - 1;
        const segmentT = t * segments;
        const index = Math.floor(segmentT);
        const localT = segmentT - index;

        // Clamp
        if (index < 0) return this.rgbToInt(stops[0][0], stops[0][1], stops[0][2]);
        if (index >= segments) return this.rgbToInt(stops[segments][0], stops[segments][1], stops[segments][2]);

        const c1 = stops[index];
        const c2 = stops[index + 1];

        const r = c1[0] + (c2[0] - c1[0]) * localT;
        const g = c1[1] + (c2[1] - c1[1]) * localT;
        const b = c1[2] + (c2[2] - c1[2]) * localT;

        const ir = Math.min(255, Math.max(0, Math.round(r)));
        const ig = Math.min(255, Math.max(0, Math.round(g)));
        const ib = Math.min(255, Math.max(0, Math.round(b)));

        return ((ir << 16) | (ig << 8) | ib) >>> 0;
    }

    rgbToInt(r, g, b) {
        const ir = Math.min(255, Math.max(0, Math.round(r)));
        const ig = Math.min(255, Math.max(0, Math.round(g)));
        const ib = Math.min(255, Math.max(0, Math.round(b)));
        return ((ir << 16) | (ig << 8) | ib) >>> 0;
    }

    hslToRgb(h, s, l) {
        // Normalize hue to 0-360 range to prevent artifacts
        h = h % 360;
        if (h < 0) h += 360;

        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;

        let r = 0, g = 0, b = 0;
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }

        const ir = Math.min(255, Math.max(0, Math.round((r + m) * 255)));
        const ig = Math.min(255, Math.max(0, Math.round((g + m) * 255)));
        const ib = Math.min(255, Math.max(0, Math.round((b + m) * 255)));

        return ((ir << 16) | (ig << 8) | ib) >>> 0;
    }



    // getRainbowColor removed. Use getColor(index, total) instead.

    updateParams() {
        // Recalculate grid dimensions on update (handles resize)
        this.gridCols = Math.ceil(this.width / this.cellSize);
        this.gridRows = Math.ceil(this.height / this.cellSize);

        const buffer = new ArrayBuffer(32);
        const floatView = new Float32Array(buffer);
        const uintView = new Uint32Array(buffer);

        floatView[0] = this.width;
        floatView[1] = this.height;
        floatView[2] = this.cellSize;

        uintView[3] = this.gridCols;
        uintView[4] = this.gridRows;

        let activeCount = this.particleCount;
        if (this.currentScene === 'galton') {
            activeCount = this.staticCount + this.emittedCount;
        }

        uintView[5] = activeCount;
        floatView[6] = this.galtonSpawnerDistance || 100;

        // Dynamic Grid Sizing
        // Ensure cell size is always optimal for the current ball radius.
        // Min Cell Size = 4.0 (allocated in constructor).
        // Target Cell Size = Radius * 3.0 (Smoother grid, fewer artifacts).
        this.cellSize = Math.max(4.0, this.ballRadius * 3.0);
        this.gridCols = Math.ceil(this.width / this.cellSize);
        this.gridRows = Math.ceil(this.height / this.cellSize);

        // Update Grid Params
        // Struct Layout:
        // width (f32), height (f32), cellSize (f32), cols (u32)
        // rows (u32), maxParticles (u32), padding (f32), padding (f32)
        const gridBuffer = new ArrayBuffer(32);
        const gridFloatView = new Float32Array(gridBuffer);
        const gridUintView = new Uint32Array(gridBuffer);

        gridFloatView[0] = this.width;
        gridFloatView[1] = this.height;
        gridFloatView[2] = this.cellSize;
        gridUintView[3] = this.gridCols;      // Offset 12
        gridUintView[4] = this.gridRows;      // Offset 16
        gridUintView[5] = this.maxParticles;  // Offset 20
        gridFloatView[6] = this.galtonSpawnerDistance || 100; // Offset 24

        this.device.queue.writeBuffer(this.gridParamsBuffer, 0, gridBuffer);

        // Update Sim Params
        // Struct Layout (std140):
        // dt (f32), gravity (f32), damping (f32), restitution (f32)
        // alpha (f32), beta (f32), mousePower (f32), mouseRadius (f32)
        // mouseX (f32), mouseY (f32), mouseButton (u32), width (f32)
        // height (f32), subSteps (u32), iterations (u32), padding (f32)

        // Note: We need to match the struct layout in avbd_solver.wgsl exactly.
        // Let's verify the shader struct first.
        // But assuming standard layout:
        const simData = new ArrayBuffer(80); // 20 floats/uints * 4 bytes
        const simF32 = new Float32Array(simData);
        const simU32 = new Uint32Array(simData);

        simF32[0] = 0.016 / this.substeps; // dt per substep
        simF32[1] = this.gravity;
        simF32[2] = this.damping;
        simF32[3] = this.restitution;

        simF32[4] = this.alpha;
        simF32[5] = this.beta;
        simF32[6] = this.mousePower;
        simF32[7] = this.mouseRadius;

        simF32[8] = this.mouse ? this.mouse.x : 0;
        simF32[9] = this.mouse ? this.mouse.y : 0;
        simU32[10] = this.mouse ? this.mouse.buttons : 0;
        simF32[11] = this.width;

        simF32[12] = this.height;
        simU32[13] = this.substeps;
        simU32[14] = this.iterations;
        simF32[15] = 0; // Padding

        this.device.queue.writeBuffer(this.simParamsBuffer, 0, simData);

        const renderData = new Float32Array([
            this.width,
            this.height,
            this.bloomEnabled ? 1.0 : 0.0,
            this.aaEnabled ? 1.0 : 0.0,
            this.bloomThreshold,
            this.bloomStrength,
            this.bloomRadius,
            0 // Padding
        ]);
        this.device.queue.writeBuffer(this.renderParamsBuffer, 0, renderData);
    }
    packColor(r, g, b) {
        // Pack r, g, b (0.0 - 1.0) into a 32-bit integer (0xAABBGGRR or similar depending on endianness/shader)
        // Assuming standard RGBA8 unorm packing
        const ir = Math.floor(r * 255);
        const ig = Math.floor(g * 255);
        const ib = Math.floor(b * 255);
        return (255 << 24) | (ib << 16) | (ig << 8) | ir;
    }

    update(dt, mouse) {
        if (!this.initialized) return;

        // Delegate scene update
        if (this.currentSceneObject) {
            this.currentSceneObject.update(dt);
        }


        // If ballRadius has changed, update all existing balls
        if (this.ballRadius !== this.prevBallRadius) {
            const newRadius = this.ballRadius;
            const startIndex = this.staticCount; // Start from the first ball, not static particles

            // We need to update the radius in the buffer for ALL MOBILE PARTICLES
            // We can't easily do this in a single write without a compute shader or CPU loop.
            // CPU loop for 100k particles is slow.
            // But we only need to update the radius (offset 4).
            // Let's just update the 'ballRadius' uniform and let the shader handle it?
            // The shader reads radius from the particle struct.
            // So we MUST update the particle buffer.

            // Optimization: Only update if change is significant? No, user wants smooth slider.
            // Let's try the CPU loop, it might be fast enough for just writing to a mapped buffer?
            // We can't map a buffer that is in use.
            // We have to use writeBuffer.

            // Actually, for now, let's just re-init particles if radius changes drastically?
            // No, that resets the sim.

            // Let's just update the 'this.ballRadius' property and let the shader use it for NEW particles?
            // Existing particles will keep old radius? That's bad.

            // Wait, the previous code had a loop to update radius.
            // Let's restore/keep that.

            // Also update PEGS if peg size changed
        }

        // Real-time Peg Size Update
        if (this.currentScene === 'galton' && this.galtonPegSize !== this.prevGaltonPegSize) {
            this.prevGaltonPegSize = this.galtonPegSize;
            const newPegRadius = this.galtonPegSize;

            // Pegs are the first 'this.staticCount' particles.
            // We need to update their radius (offset 4).
            // Since staticCount is small (~200-300), we can do individual writes or one block write.
            // Block write is better.

            // We need to read the current data to preserve positions? 
            // We have 'this.simData' but it might be stale.
            // However, pegs are STATIC. Their positions don't change.
            // So 'this.simData' for pegs IS valid (except maybe color if we changed it).
            // Let's assume simData is valid for pegs.

            for (let i = 0; i < this.staticCount; i++) {
                const offset = i * 10;
                this.simData[offset + 4] = newPegRadius;
            }

            // Upload the updated peg data
            // We can upload the whole chunk of static particles
            const pegDataSize = this.staticCount * 40;
            this.device.queue.writeBuffer(
                this.particleBuffer,
                0,
                this.simData,
                0,
                this.staticCount * 10 // Element count
            );
        }

        // If ballRadius has changed, update all existing balls
        if (this.ballRadius !== this.prevBallRadius) {
            const newRadius = this.ballRadius;
            const startIndex = this.staticCount; // Start from the first ball, not static particles
            const numBallsToUpdate = this.emittedCount;

            // We need to update the radius in the buffer for ALL MOBILE PARTICLES
            // We do this by writing to the buffer in chunks or individually.
            // For performance, we'll do individual writes for now, but we should optimize if it lags.
            // Since we only write 1 float (radius) and 2 floats (mass), it's 3 floats per particle.

            for (let i = 0; i < numBallsToUpdate; i++) {
                const offset = (startIndex + i) * 10; // Offset in the full particle array

                // Update Radius
                const radiusData = new Float32Array([newRadius]);
                this.device.queue.writeBuffer(
                    this.particleBuffer,
                    offset * 4 + 4 * 4, // offset in bytes: particle_offset * 4 bytes + radius_field_offset * 4 bytes
                    radiusData
                );

                // Update Mass (r^3)
                const mass = Math.pow(newRadius, 3) * 0.01;
                const invMass = 1.0 / mass;
                const massData = new Float32Array([mass, invMass]);
                this.device.queue.writeBuffer(
                    this.particleBuffer,
                    offset * 4 + 6 * 4, // offset in bytes: particle_offset * 4 bytes + mass_field_offset * 4 bytes
                    massData
                );
            }
        }

        this.prevBallRadius = this.ballRadius;


        let mouseButton = 0;
        if (mouse.isDown) {
            mouseButton = mouse.button + 1;
        }

        // Update simulation params
        const simData = new Float32Array([
            dt,
            this.gravity * 500,
            this.damping,
            this.restitution,
            mouse.x,
            mouse.y,
            this.mouseRadius || 200,
            this.mousePower || 50,
            mouse.dx || 0,
            mouse.dy || 0
        ]);
        const simUint = new Uint32Array([
            mouseButton,
            this.iterations, // Only iterations are passed to shader now
            // We need to write alpha as float, but it's in the middle of uints/padding?
            // Actually, we can just write it separately or cast.
            // Let's write uints first.
            0, // Placeholder for alpha (will overwrite)
            this.obstacleCount,
            this.gravityType
        ]);

        this.device.queue.writeBuffer(this.simParamsBuffer, 0, simData);
        this.device.queue.writeBuffer(this.simParamsBuffer, 40, simUint);

        // Write Alpha (Offset 48)
        const alphaData = new Float32Array([this.alpha]);
        this.device.queue.writeBuffer(this.simParamsBuffer, 48, alphaData);

        // Write Black Hole Params (Offset 60)
        const bhData = new Float32Array([
            this.blackHoleGravity,
            this.blackHoleSwirl,
            this.blackHoleRadius,
            this.blackHoleRepulsion,
            this.beta // Offset 76
        ]);
        this.device.queue.writeBuffer(this.simParamsBuffer, 60, bhData);

        // Update AVBD params (targetColor will be updated per color iteration)
        const avbdData = new Float32Array([
            0,          // targetColor (u32, but written as float)
            10000.0,    // k_start
            10.0,       // beta
            0.95,       // alpha
            0.99,       // gamma
            0, 0, 0     // padding
        ]);
        this.device.queue.writeBuffer(this.avbdParamsBuffer, 0, avbdData);

        const commandEncoder = this.device.createCommandEncoder();

        let totalActive = this.particleCount;
        if (this.currentScene === 'galton') {
            totalActive = this.staticCount + this.emittedCount;
        }

        // Substep Loop in JavaScript for True Stability
        // Clamp dt to prevent explosion spiral if FPS drops
        const safeDt = Math.min(dt, 0.02);
        const subDt = (safeDt * this.simSpeed) / this.substeps;

        // Update dt in simParams buffer for the shader (shader sees subDt as dt)
        const subSimData = new Float32Array([
            subDt,
            this.gravity * 500, // Gravity
            this.damping,       // Damping
            this.restitution,   // Restitution
            mouse.x,
            mouse.y,
            this.mouseRadius || 200,
            this.mousePower || 50,
            (mouse.dx || 0) / this.substeps,
            (mouse.dy || 0) / this.substeps
        ]);
        this.device.queue.writeBuffer(this.simParamsBuffer, 0, subSimData);

        // Begin Compute Pass ONCE (or multiple times? WebGPU allows multiple dispatches in one pass)
        // Actually, we need to clear grid counters between substeps.
        // Clearing buffers inside a compute pass is not possible with clearBuffer.
        // So we might need multiple passes or a clear shader.
        // For simplicity/performance, let's try to do it with multiple passes for now.

        if (!this.paused) {
            // 1. Clear Grid Counters & Build Grid (ONCE per frame)
            // This decouples broadphase from narrowphase for massive performance.
            commandEncoder.clearBuffer(this.gridCountersBuffer, 0, this.maxGridCells * 4);

            const passEncoder = commandEncoder.beginComputePass();

            // Spatial Hash
            passEncoder.setPipeline(this.spatialHashPipeline);
            passEncoder.setBindGroup(0, this.spatialHashBindGroup);
            passEncoder.dispatchWorkgroups(Math.ceil(totalActive / 64));

            // 2. Solver Substeps (Multiple passes using the SAME grid)
            // This provides stability (small dt) without the overhead of rebuilding the grid.
            passEncoder.setPipeline(this.solverPipeline);
            passEncoder.setBindGroup(0, this.solverBindGroup);

            for (let step = 0; step < this.substeps; step++) {
                passEncoder.dispatchWorkgroups(Math.ceil(totalActive / 64));
            }

            passEncoder.end();
        }

        // Check Spawns Pipeline (After physics, before render)
        if (this.currentScene === 'galton') {
            const passEncoder = commandEncoder.beginComputePass();
            passEncoder.setPipeline(this.checkSpawnPipeline);
            passEncoder.setBindGroup(0, this.checkSpawnBindGroup);
            passEncoder.dispatchWorkgroups(3); // 3 Spawners
            passEncoder.end();

            // Copy result to staging buffer
            if (!this.isReadingSpawns) {
                commandEncoder.copyBufferToBuffer(
                    this.spawnStatusBuffer, 0,
                    this.spawnStagingBuffer, 0,
                    16
                );
            }
        }

        // Render
        const textureView = this.gpu.context.getCurrentTexture().createView();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });

        renderPass.setPipeline(this.renderPipeline);
        renderPass.setBindGroup(0, this.renderBindGroup);
        renderPass.draw(6, totalActive, 0, 0); // 6 vertices per quad (2 triangles)

        // Render Obstacles
        if (this.obstacleCount > 0) {
            renderPass.setPipeline(this.obstacleRenderPipeline);
            renderPass.setBindGroup(0, this.obstacleBindGroup);
            renderPass.draw(4, this.obstacleCount, 0, 0);
        }

        renderPass.end();

        this.device.queue.submit([commandEncoder.finish()]);

        // Check Spawns (Async Readback)
        if (this.currentScene === 'galton') {
            this.readSpawnStatus();
        }
    }

    async readSpawnStatus() {
        if (this.isReadingSpawns) return;

        // We need to ensure the previous copy command has been submitted.
        // It was submitted in the 'update' loop just now (see below).

        this.isReadingSpawns = true;

        try {
            await this.spawnStagingBuffer.mapAsync(GPUMapMode.READ);
            const copy = new Uint32Array(this.spawnStagingBuffer.getMappedRange()).slice();
            this.spawnStagingBuffer.unmap();

            // Update blocked status
            this.spawnerBlocked = [copy[0], copy[1], copy[2]];
        } catch (e) {
            console.warn("Spawn readback failed:", e);
        } finally {
            this.isReadingSpawns = false;
        }
    }

    setParticleCount(count) {
        this.particleCount = count;

        // If in Galton scene, we might need to resize buffer if count increases
        if (this.currentScene === 'galton') {
            const neededTotal = this.staticCount + count;
            if (neededTotal > this.maxParticles) {
                // Resize with margin
                this.resizeParticleBuffer(neededTotal + 5000);
            }
        }
    }

    resizeParticleBuffer(newCount) {
        console.log(`Resizing particle buffer from ${this.maxParticles} to ${newCount} `);
        const newBytes = newCount * 40;

        const newBuffer = this.bufferManager.createBuffer(
            'particles',
            newBytes,
            GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX
        );

        // Copy existing data
        const copySize = Math.min(this.maxParticles * 40, newBytes);
        const commandEncoder = this.device.createCommandEncoder();
        commandEncoder.copyBufferToBuffer(this.particleBuffer, 0, newBuffer, 0, copySize);
        this.device.queue.submit([commandEncoder.finish()]);

        // Destroy old buffer
        this.particleBuffer.destroy();
        this.particleBuffer = newBuffer;
        this.maxParticles = newCount;

        // Recreate Bind Groups that depend on particleBuffer
        this.createBindGroups();
    }

    // --- Getters and Setters for Physics Parameters ---
    // These ensure that changing a property triggers a GPU buffer update.

    set gravity(v) { this._gravity = v; this.updateParams(); }
    get gravity() { return this._gravity; }

    set restitution(v) { this._restitution = v; this.updateParams(); }
    get restitution() { return this._restitution; }

    set damping(v) { this._damping = v; this.updateParams(); }
    get damping() { return this._damping; }

    set alpha(v) { this._alpha = v; this.updateParams(); }
    get alpha() { return this._alpha; }

    set beta(v) { this._beta = v; this.updateParams(); }
    get beta() { return this._beta; }

    set mousePower(v) { this._mousePower = v; this.updateParams(); }
    get mousePower() { return this._mousePower; }

    set mouseRadius(v) { this._mouseRadius = v; this.updateParams(); }
    get mouseRadius() { return this._mouseRadius; }

    set bloomStrength(v) { this._bloomStrength = v; this.updateParams(); }
    get bloomStrength() { return this._bloomStrength; }

    set bloomRadius(v) { this._bloomRadius = v; this.updateParams(); }
    get bloomRadius() { return this._bloomRadius; }

    set bloomThreshold(v) { this._bloomThreshold = v; this.updateParams(); }
    get bloomThreshold() { return this._bloomThreshold; }

    set aaEnabled(v) { this._aaEnabled = v; this.updateParams(); }
    get aaEnabled() { return this._aaEnabled; }

    set bloomEnabled(v) { this._bloomEnabled = v; this.updateParams(); }
    get bloomEnabled() { return this._bloomEnabled; }

    set substeps(v) { this._substeps = v; this.updateParams(); }
    get substeps() { return this._substeps; }

    set iterations(v) { this._iterations = v; this.updateParams(); }
    get iterations() { return this._iterations; }

    // --- Scene Specific Setters ---

    set ballRadius(v) {
        this._ballRadius = v;
        // Update cell size logic to match updateParams
        this.cellSize = Math.max(4.0, this._ballRadius * 3.0);
        this.updateParams();
    }
    get ballRadius() { return this._ballRadius; }

    set galtonSpawnerDistance(v) { this._galtonSpawnerDistance = v; this.updateParams(); }
    get galtonSpawnerDistance() { return this._galtonSpawnerDistance; }

    set galtonPegSize(v) { this._galtonPegSize = v; this.updateParams(); }
    get galtonPegSize() { return this._galtonPegSize; }

    set galtonSpawnRate(v) { this._galtonSpawnRate = v; this.updateParams(); }
    get galtonSpawnRate() { return this._galtonSpawnRate; }

    set galtonBucketSpacing(v) { this._galtonBucketSpacing = v; this.updateParams(); }
    get galtonBucketSpacing() { return this._galtonBucketSpacing; }

    set galtonBucketHeight(v) { this._galtonBucketHeight = v; this.updateParams(); }
    get galtonBucketHeight() { return this._galtonBucketHeight; }

    set blackHoleGravity(v) { this._blackHoleGravity = v; this.updateParams(); }
    get blackHoleGravity() { return this._blackHoleGravity; }

    set blackHoleSwirl(v) { this._blackHoleSwirl = v; this.updateParams(); }
    get blackHoleSwirl() { return this._blackHoleSwirl; }

    set blackHoleRadius(v) { this._blackHoleRadius = v; this.updateParams(); }
    get blackHoleRadius() { return this._blackHoleRadius; }

    set blackHoleRepulsion(v) { this._blackHoleRepulsion = v; this.updateParams(); }
    get blackHoleRepulsion() { return this._blackHoleRepulsion; }

    set planetaryBallVariance(v) { this._planetaryBallVariance = v; this.updateParams(); }
    get planetaryBallVariance() { return this._planetaryBallVariance; }

    set fireworksSpawnRate(v) { this._fireworksSpawnRate = v; this.updateParams(); }
    get fireworksSpawnRate() { return this._fireworksSpawnRate; }

    set fireworksExplosionSize(v) { this._fireworksExplosionSize = v; this.updateParams(); }
    get fireworksExplosionSize() { return this._fireworksExplosionSize; }

    set fireworksRocketSpeed(v) { this._fireworksRocketSpeed = v; this.updateParams(); }
    get fireworksRocketSpeed() { return this._fireworksRocketSpeed; }

    set fountainSpawnRate(v) { this._fountainSpawnRate = v; this.updateParams(); }
    get fountainSpawnRate() { return this._fountainSpawnRate; }
}
