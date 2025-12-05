export class SolverProxy {
    constructor(worker) {
        this.worker = worker;

        // Local cache of parameters for UI reads
        this._params = {
            gravity: 4.0,
            restitution: 0.8,
            damping: 0.999,
            substeps: 12,
            ballRadius: 10,
            mousePower: 250,
            mouseRadius: 200,
            simSpeed: 1.0,
            bloomEnabled: true,
            aaEnabled: true,
            bloomStrength: 0.2,
            bloomRadius: 0.2,
            bloomThreshold: 0.9,
            particleCount: 4000,
            spawnRate: 5,
            galtonSpawnRate: 5,
            galtonBucketHeight: 0, // Will be set by resize/init
            galtonBucketSpacing: 40,
            fireworksSpawnRate: 3.0,
            fireworksExplosionSize: 100,
            fireworksRocketSpeed: 1.5,
            fireworksExplosionSpeed: 1.0,
            paused: false,
            emittedCount: 0,
            fps: 0,
            colorScheme: 'rainbow'
        };
    }

    updateStats(stats) {
        this._params.emittedCount = stats.emittedCount;
        this._params.particleCount = stats.particleCount;
        this._params.fps = stats.fps;
    }

    // Helper to define getters/setters
    _defineProp(name) {
        Object.defineProperty(this, name, {
            get: () => this._params[name],
            set: (value) => {
                this._params[name] = value;
                this.worker.postMessage({
                    type: 'UPDATE_PARAM',
                    payload: { key: name, value: value }
                });
            }
        });
    }

    init() {
        // Define all properties
        const props = Object.keys(this._params);
        for (const prop of props) {
            this._defineProp(prop);
        }
    }

    initParticles(scene) {
        this.worker.postMessage({
            type: 'INIT_PARTICLES',
            payload: { scene }
        });
    }

    resetParams() {
        // Reset local cache to defaults (matching AVBDSolver)
        this._params.gravity = 4.0;
        this._params.restitution = 0.8;
        this._params.damping = 0.999;
        this._params.substeps = 32;
        this._params.simSpeed = 1.0;
        this._params.ballRadius = 10;
        this._params.mousePower = 250;
        this._params.mouseRadius = 200;
        this._params.bloomStrength = 0.2;
        this._params.bloomRadius = 0.2;
        this._params.bloomThreshold = 0.9;
        this._params.particleCount = 4000;
        this._params.galtonSpawnRate = 5;
        this._params.galtonBucketSpacing = 40;
        this._params.fireworksSpawnRate = 3.0;
        this._params.fireworksExplosionSize = 100;
        this._params.fireworksRocketSpeed = 2.2; // Note: Overlay default was 2.2? AVBDSolver was 1.5?

        this.worker.postMessage({ type: 'RESET_PARAMS' });
    }

    updateParams() {
        // No-op, handled by setters sending messages
    }

    setParticleCount(count) {
        this.particleCount = count; // Triggers setter
    }

    setColorScheme(scheme) {
        this.colorScheme = scheme; // Triggers setter
    }
}
