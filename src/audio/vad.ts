/**
 * Energy-based voice activity detector with an adaptive noise floor. Simple and dependency
 * free; it can be fooled by loud non-speech noise. `sensitivity` > 1 makes speech harder to
 * trigger (used while the avatar is talking, to reduce self-interruption from speaker echo).
 */
export type VadEvent = "speech_start" | "speech_end" | null;

export interface VadOptions {
  /** Speech must exceed noise floor × this ratio. */
  ratio: number;
  /** Absolute minimum RMS for speech. */
  minLevel: number;
  /** Sustained speech needed before `speech_start`. */
  startMs: number;
  /** Silence needed before `speech_end`. */
  endMs: number;
}

const DEFAULTS: VadOptions = { ratio: 3, minLevel: 0.012, startMs: 160, endMs: 750 };

export class VoiceActivityDetector {
  private readonly opts: VadOptions;
  private noise = 0.005;
  private speaking = false;
  private aboveMs = 0;
  private belowMs = 0;

  constructor(opts: Partial<VadOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  process(level: number, frameMs: number, sensitivity = 1): VadEvent {
    const threshold = Math.max(this.noise * this.opts.ratio, this.opts.minLevel) * sensitivity;
    const loud = level > threshold;
    if (!this.speaking) {
      // Track background noise only while nobody is speaking.
      // Levels near the floor adapt quickly; louder sub-threshold input (e.g. speech while
      // sensitivity is raised) only creeps in slowly so it cannot mask itself.
      if (!loud) {
        const rate = level < this.noise * 2 ? 0.03 : 0.002;
        this.noise = Math.max(0.001, this.noise * (1 - rate) + level * rate);
      }
      this.aboveMs = loud ? this.aboveMs + frameMs : 0;
      if (this.aboveMs >= this.opts.startMs) {
        this.speaking = true;
        this.belowMs = 0;
        return "speech_start";
      }
      return null;
    }
    this.belowMs = loud ? 0 : this.belowMs + frameMs;
    if (this.belowMs >= this.opts.endMs) {
      this.speaking = false;
      this.aboveMs = 0;
      return "speech_end";
    }
    return null;
  }

  reset(): void {
    this.speaking = false;
    this.aboveMs = 0;
    this.belowMs = 0;
  }
}
