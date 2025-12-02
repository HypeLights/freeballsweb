export class BufferManager {
    constructor(device) {
        this.device = device;
        this.buffers = new Map();
    }

    createBuffer(label, size, usage) {
        const buffer = this.device.createBuffer({
            label: label,
            size: size,
            usage: usage
        });
        this.buffers.set(label, buffer);
        return buffer;
    }

    writeBuffer(label, data) {
        const buffer = this.buffers.get(label);
        if (buffer) {
            this.device.queue.writeBuffer(buffer, 0, data);
        }
    }

    getBuffer(label) {
        return this.buffers.get(label);
    }
}
