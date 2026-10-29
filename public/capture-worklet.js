// AudioWorklet that forwards microphone samples to the main thread in ~20 ms batches.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.batch = new Float32Array(1024);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      let offset = 0;
      while (offset < channel.length) {
        const n = Math.min(channel.length - offset, this.batch.length - this.filled);
        this.batch.set(channel.subarray(offset, offset + n), this.filled);
        this.filled += n;
        offset += n;
        if (this.filled === this.batch.length) {
          this.port.postMessage(this.batch.slice(0));
          this.filled = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor("capture-processor", CaptureProcessor);
