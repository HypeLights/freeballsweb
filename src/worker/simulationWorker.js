import { WebGPUContext } from '../gpu/WebGPUContext.js';
import { AVBDSolver } from '../gpu/AVBDSolver.js';

let gpu = null;
let solver = null;
let isRunning = false;
let lastTime = 0;

// Mouse State (mirrored from main thread)
const mouse = {
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    dx: 0,
    dy: 0,
    isDown: false,
    button: 0,
    radius: 200,
    power: 200
};

self.onmessage = async (e) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT':
            await init(payload.canvas, payload.width, payload.height);
            break;
        case 'RESIZE':
            if (gpu && solver) {
                gpu.resize(payload.width, payload.height);
                solver.resize(payload.width, payload.height);
                solver.updateParams();
            }
            break;
        case 'UPDATE_MOUSE':
            Object.assign(mouse, payload);
            break;
        case 'UPDATE_PARAM':
            if (solver) {
                // Direct property assignment for all params
                solver[payload.key] = payload.value;

                // Forward mixer params to CollisionScene
                if (payload.key.startsWith('mixer') && solver.currentSceneObject) {
                    solver.currentSceneObject[payload.key] = payload.value;
                }

                // Some params require immediate updateParams call
                solver.updateParams();
            }
            break;
        case 'INIT_PARTICLES':
            if (solver) {
                solver.initParticles(payload.scene);
                self.postMessage({
                    type: 'PARAMS_SYNC',
                    payload: {
                        particleCount: solver.particleCount
                    }
                });
            }
            break;
        case 'RESET_PARAMS':
            if (solver) {
                solver.resetParams();
                // Send back updated params to UI? 
                // For now, UI assumes reset happened.
            }
            break;
        case 'PAUSE':
            if (solver) solver.paused = payload;
            break;
    }
};

async function init(canvas, width, height) {
    console.log('Worker: Initializing...');

    try {
        gpu = new WebGPUContext();
        await gpu.init(canvas);

        // Initial resize
        gpu.resize(width, height);

        solver = new AVBDSolver(gpu);
        // Set initial dimensions in solver
        solver.resize(width, height);

        await solver.init();

        // Sync initial params (like clamped particle count)
        self.postMessage({
            type: 'PARAMS_SYNC',
            payload: {
                particleCount: solver.particleCount
            }
        });

        console.log('Worker: Simulation Running');
        isRunning = true;
        requestAnimationFrame(loop);

    } catch (error) {
        console.error('Worker Error:', error);
    }
}

function loop(timestamp) {
    if (!isRunning) return;

    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (solver) {
        // Limit dt to avoid explosion on tab switch
        solver.update(Math.min(dt, 0.1), mouse);

        // Send stats back to main thread occasionally?
        // For now, we assume UI updates are independent or we can send FPS.
        if (Math.random() < 0.05) { // Every ~20 frames
            self.postMessage({
                type: 'STATS',
                payload: {
                    particleCount: solver.particleCount,
                    emittedCount: solver.emittedCount,
                    fps: 1.0 / dt
                }
            });
        }
    }

    requestAnimationFrame(loop);
}
