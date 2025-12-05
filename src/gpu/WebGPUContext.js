export class WebGPUContext {
    constructor() {
        this.adapter = null;
        this.device = null;
        this.canvas = null;
        this.context = null;
        this.presentationFormat = null;
    }

    async init(canvas) {
        if (!navigator.gpu) {
            throw new Error('WebGPU not supported on this browser.');
        }

        this.adapter = await navigator.gpu.requestAdapter({
            powerPreference: 'high-performance'
        });

        if (!this.adapter) {
            throw new Error('No appropriate GPU adapter found.');
        }

        const requiredLimits = {};
        // Request 2GB or adapter max for storage buffers
        const maxStorage = this.adapter.limits.maxStorageBufferBindingSize;
        if (maxStorage > 134217728) { // If > 128MB
            requiredLimits.maxStorageBufferBindingSize = maxStorage;
        }

        this.device = await this.adapter.requestDevice({
            requiredLimits
        });

        this.canvas = canvas;
        this.context = this.canvas.getContext('webgpu');
        this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();

        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            alphaMode: 'premultiplied'
        });

        console.log('WebGPU Initialized');
        return true;
    }

    resize(width, height) {
        if (!this.canvas || !this.device) return;

        this.canvas.width = width;
        this.canvas.height = height;

        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            alphaMode: 'premultiplied'
        });
    }
}
