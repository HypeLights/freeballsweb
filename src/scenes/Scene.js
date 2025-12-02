export class Scene {
    constructor(solver) {
        this.solver = solver;
    }

    /**
     * Initialize the scene.
     * @param {Float32Array} data - Particle data buffer (float view)
     * @param {Uint32Array} dataUint - Particle data buffer (uint view)
     */
    init(data, dataUint) {
        console.warn('Scene.init() not implemented');
    }

    /**
     * Update loop for the scene (optional).
     * @param {number} dt - Delta time
     */
    update(dt) { }

    /**
     * Cleanup resources (optional).
     */
    cleanup() { }

    /**
     * Helper to add a particle
     */
    addParticle(index, x, y, vx, vy, radius, color) {
        const offset = index * 10;
        const data = this.solver.simData;
        const dataUint = this.solver.simDataUint;

        data[offset + 0] = x;
        data[offset + 1] = y;
        data[offset + 2] = vx;
        data[offset + 3] = vy;
        data[offset + 4] = radius;
        dataUint[offset + 5] = color;
        data[offset + 6] = Math.pow(radius, 3) * 0.01; // Mass
        data[offset + 7] = 1.0 / data[offset + 6];      // InvMass
        data[offset + 8] = 0; // Type (0=Dynamic)
        data[offset + 9] = 0; // Padding
    }
}
