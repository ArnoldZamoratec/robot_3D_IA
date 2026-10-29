import { base64Pcm16ToFloat32 } from "./pcm.ts";

/**
 * Gapless playback of streamed PCM chunks through Web Audio. `output` is the node the lip-sync
 * analyser taps, so the mouth follows exactly the audio being played.
 */
export class SpeechPlayer {
  readonly output: GainNode;
  onStart: () => void = () => {};
  onIdle: () => void = () => {};

  private readonly sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;

  constructor(private readonly context: AudioContext) {
    this.output = context.createGain();
    this.output.connect(context.destination);
  }

  get playing(): boolean {
    return this.sources.size > 0;
  }

  enqueue(pcmBase64: string, sampleRate: number): void {
    const samples = base64Pcm16ToFloat32(pcmBase64);
    if (!samples.length) return;
    const buffer = this.context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output);
    const wasIdle = !this.playing;
    const at = Math.max(this.context.currentTime + 0.03, this.nextTime);
    this.nextTime = at + buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      if (!this.playing) this.onIdle();
    };
    source.start(at);
    if (wasIdle) this.onStart();
  }

  /** Stops immediately and discards queued audio (barge-in). */
  stop(): void {
    for (const s of this.sources) {
      s.onended = null;
      s.stop();
      s.disconnect();
    }
    this.sources.clear();
    this.nextTime = 0;
  }

  dispose(): void {
    this.stop();
    this.output.disconnect();
  }
}
