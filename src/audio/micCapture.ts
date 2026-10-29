import { concatFloat32, rms, toPcm16 } from "./pcm.ts";
import { VoiceActivityDetector } from "./vad.ts";

const PRE_ROLL_MS = 300; // keep audio from just before detection so word onsets are not clipped
const MIN_UTTERANCE_MS = 350;
const MAX_UTTERANCE_MS = 25_000;

export interface MicCaptureHandlers {
  onSpeechStart(): void;
  /** 16 kHz mono PCM16 of the finished utterance. */
  onUtterance(pcm: Int16Array): void;
  /** Normalised input level for the UI meter, ~50 Hz. */
  onLevel?(level: number): void;
}

/**
 * Microphone → AudioWorklet → VAD → utterances. The caller owns the AudioContext; `stop()`
 * releases the microphone tracks and audio nodes.
 */
export class MicCapture {
  /** Multiplier applied to the VAD threshold (raised while the avatar speaks). */
  sensitivity = 1;

  private readonly vad = new VoiceActivityDetector();
  private preRoll: Float32Array[] = [];
  private utterance: Float32Array[] = [];
  private utteranceMs = 0;

  private constructor(
    private readonly context: AudioContext,
    private readonly stream: MediaStream,
    private readonly source: MediaStreamAudioSourceNode,
    private readonly node: AudioWorkletNode,
    private readonly handlers: MicCaptureHandlers,
  ) {
    node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onFrame(e.data);
  }

  static async start(context: AudioContext, stream: MediaStream, handlers: MicCaptureHandlers): Promise<MicCapture> {
    await context.audioWorklet.addModule("/capture-worklet.js");
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, "capture-processor");
    source.connect(node);
    // Worklet output is silent; it must be pulled by the graph, so route it through a muted gain.
    const mute = context.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(context.destination);
    return new MicCapture(context, stream, source, node, handlers);
  }

  private onFrame(frame: Float32Array): void {
    const frameMs = (frame.length / this.context.sampleRate) * 1000;
    const level = rms(frame);
    this.handlers.onLevel?.(Math.min(1, level * 8));

    const event = this.vad.process(level, frameMs, this.sensitivity);
    if (event === "speech_start") {
      this.utterance = [...this.preRoll];
      this.utteranceMs = this.preRoll.length * frameMs;
      this.handlers.onSpeechStart();
    }

    if (this.vad.isSpeaking || event === "speech_end") {
      this.utterance.push(frame);
      this.utteranceMs += frameMs;
      if (event === "speech_end" || this.utteranceMs >= MAX_UTTERANCE_MS) {
        if (event !== "speech_end") this.vad.reset();
        this.finish();
      }
    } else {
      this.preRoll.push(frame);
      while (this.preRoll.length * frameMs > PRE_ROLL_MS) this.preRoll.shift();
    }
  }

  private finish(): void {
    const ms = this.utteranceMs;
    const audio = concatFloat32(this.utterance);
    this.utterance = [];
    this.utteranceMs = 0;
    if (ms >= MIN_UTTERANCE_MS) this.handlers.onUtterance(toPcm16(audio, this.context.sampleRate));
  }

  stop(): void {
    this.node.port.onmessage = null;
    this.source.disconnect();
    this.node.disconnect();
    for (const track of this.stream.getTracks()) track.stop();
  }
}
