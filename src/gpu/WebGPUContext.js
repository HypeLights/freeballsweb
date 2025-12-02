export class WebGPUContext {
    constructor() {
        this.adapter = null;
        this.device = null;
        this.canvas = null;
        this.context = null;
        this.presentationFormat = null;
    }

    async init(canvasId) {
        if (!navigator.gpu) {
            throw new Error('WebGPU not supported on this browser.');
        }

        this.adapter = await navigator.gpu.requestAdapter({
            powerPreference: 'high-performance'
        });

        if (!this.adapter) {
            throw new Error('No appropriate GPU adapter found.');
        }

        this.device = await this.adapter.requestDevice();
        
        this.canvas = document.getElementById(canvasId);
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

    resize() {
        if (!this.canvas || !this.device) return;
        
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        this.canvas.width = width;
        this.canvas.height = height;
        
        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            alphaMode: 'premultiplied'
        });
    }
}
