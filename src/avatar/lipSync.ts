import type { FaceLayer } from "./faceRig.ts";

/**
 * AUDIO-FEATURE LIP SYNC (heuristic fallback, not phoneme/viseme recognition).
 * Jaw opening follows loudness; spectral balance nudges the mouth towards rounded ("oo")
 * or wide ("ee"/"s") shapes. It reacts to the real output audio but cannot distinguish
 * phonemes such as closed-lip "m/b/p".
 */

export interface AudioFeatures {
  /** RMS of the waveform in [0, 1]. */
  rms: number;
  /** Fraction of spectral energy in the low band (~150-900 Hz). */
  low: number;
  /** Fraction of spectral energy in the high band (~2-6 kHz). */
  high: number;
}

export interface MouthState {
  jaw: number;
  round: number;
  wide: number;
}

const NOISE_FLOOR = 0.015;
const GAIN = 6;
const ATTACK = 30; // 1/s — fast opening
const RELEASE = 12; // 1/s — slower closing avoids flutter

function smooth(prev: number, target: number, dt: number): number {
  const rate = target > prev ? ATTACK : RELEASE;
  return prev + (target - prev) * (1 - Math.exp(-rate * dt));
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Pure mapping from audio features to smoothed mouth parameters. */
export function featuresToMouth(f: AudioFeatures, prev: MouthState, dt: number): MouthState {
  const level = clamp01((f.rms - NOISE_FLOOR) * GAIN);
  const voiced = level > 0.05 ? 1 : 0;
  return {
    jaw: smooth(prev.jaw, level * 0.85, dt),
    round: smooth(prev.round, voiced * clamp01((f.low - 0.55) * 2.5) * level, dt),
    wide: smooth(prev.wide, voiced * clamp01((f.high - 0.12) * 4) * 0.7, dt),
  };
}

export function mouthToLayer(m: MouthState, out: FaceLayer): FaceLayer {
  out.jawOpen = m.jaw;
  out.mouthFunnel = m.round * 0.8;
  out.mouthSmileLeft = m.wide * 0.5;
  out.mouthSmileRight = m.wide * 0.5;
  return out;
}

/** Taps an audio node with an AnalyserNode and writes a speech layer every frame. */
export class AudioLipSync {
  private readonly input: AudioNode;
  private readonly analyser: AnalyserNode;
  private readonly time: Float32Array<ArrayBuffer>;
  private readonly freq: Float32Array<ArrayBuffer>;
  private readonly binHz: number;
  private mouth: MouthState = { jaw: 0, round: 0, wide: 0 };

  constructor(context: AudioContext, input: AudioNode) {
    this.input = input;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.5;
    input.connect(this.analyser); // analysis only; the input is already routed to the speakers
    this.time = new Float32Array(this.analyser.fftSize);
    this.freq = new Float32Array(this.analyser.frequencyBinCount);
    this.binHz = context.sampleRate / this.analyser.fftSize;
  }

  update(dt: number, out: FaceLayer): void {
    this.analyser.getFloatTimeDomainData(this.time);
    let sum = 0;
    for (const v of this.time) sum += v * v;
    const rms = Math.sqrt(sum / this.time.length);

    this.analyser.getFloatFrequencyData(this.freq);
    let total = 0;
    let low = 0;
    let high = 0;
    for (let i = 1; i < this.freq.length; i++) {
      const hz = i * this.binHz;
      if (hz > 8000) break;
      const p = 10 ** ((this.freq[i] ?? -160) / 10);
      total += p;
      if (hz >= 150 && hz < 900) low += p;
      else if (hz >= 2000 && hz < 6000) high += p;
    }
    const features = total > 0 ? { rms, low: low / total, high: high / total } : { rms, low: 0, high: 0 };
    this.mouth = featuresToMouth(features, this.mouth, dt);
    mouthToLayer(this.mouth, out);
  }

  dispose(): void {
    try {
      this.input.disconnect(this.analyser);
    } catch {
      // The input may already be fully disconnected (e.g. the player was disposed first).
    }
  }
}
