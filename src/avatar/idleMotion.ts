import type { FaceLayer, HeadRotation } from "./faceRig.ts";

export type Random = () => number;

/**
 * Procedural blink generator. Blinks are spaced 2-6 s apart with an occasional
 * double blink; each blink closes fast and opens slightly slower, like a real eyelid.
 */
export class BlinkController {
  static readonly CLOSE_TIME = 0.07;
  static readonly OPEN_TIME = 0.13;

  private untilNext: number;
  private phase = -1; // -1 = eyes open, otherwise seconds into the current blink
  private pendingDouble = false;
  private readonly layer: FaceLayer = { eyeBlinkLeft: 0, eyeBlinkRight: 0 };
  private readonly random: Random;

  constructor(random: Random = Math.random) {
    this.random = random;
    this.untilNext = this.nextInterval();
  }

  private nextInterval(): number {
    return 2 + this.random() * 4;
  }

  update(dt: number): FaceLayer {
    if (this.phase < 0) {
      this.untilNext -= dt;
      if (this.untilNext <= 0) {
        this.phase = 0;
        this.pendingDouble = this.random() < 0.15;
      }
    } else {
      this.phase += dt;
      if (this.phase >= BlinkController.CLOSE_TIME + BlinkController.OPEN_TIME) {
        this.phase = -1;
        this.untilNext = this.pendingDouble ? 0.12 : this.nextInterval();
        this.pendingDouble = false;
      }
    }
    const v = this.value();
    this.layer.eyeBlinkLeft = v;
    this.layer.eyeBlinkRight = v;
    return this.layer;
  }

  private value(): number {
    if (this.phase < 0) return 0;
    const { CLOSE_TIME, OPEN_TIME } = BlinkController;
    if (this.phase < CLOSE_TIME) return this.phase / CLOSE_TIME;
    return Math.max(0, 1 - (this.phase - CLOSE_TIME) / OPEN_TIME);
  }
}

/**
 * Eye saccades: the gaze holds a fixation for 0.6-3 s, then jumps quickly to a nearby point,
 * mostly near the viewer. Output is a normalised gaze offset in [-1, 1] per axis.
 */
export class SaccadeController {
  private readonly target = { x: 0, y: 0 };
  private readonly gaze = { x: 0, y: 0 };
  private hold: number;
  private readonly random: Random;

  constructor(random: Random = Math.random) {
    this.random = random;
    this.hold = this.nextHold();
  }

  private nextHold(): number {
    return 0.6 + this.random() * 2.4;
  }

  update(dt: number, out: { x: number; y: number }): { x: number; y: number } {
    this.hold -= dt;
    if (this.hold <= 0) {
      this.hold = this.nextHold();
      // 70% of fixations stay close to the viewer's face; the rest wander a little further.
      const spread = this.random() < 0.7 ? 0.25 : 0.7;
      this.target.x = (this.random() * 2 - 1) * spread;
      this.target.y = (this.random() * 2 - 1) * spread * 0.6;
    }
    // Saccades complete in ~50 ms: approach the target very fast.
    const k = 1 - Math.exp(-dt * 45);
    this.gaze.x += (this.target.x - this.gaze.x) * k;
    this.gaze.y += (this.target.y - this.gaze.y) * k;
    out.x = this.gaze.x;
    out.y = this.gaze.y;
    return out;
  }
}

/** Breathing phase in [-1, 1] at ~14 breaths per minute. */
export function breathing(t: number): number {
  return Math.sin(t * ((2 * Math.PI * 14) / 60));
}

/**
 * Subtle idle head motion from incommensurate sine waves: smooth, non-repeating, and free
 * of random jumps. Amplitudes are in radians and deliberately small (under ~3.5 degrees).
 */
export function idleHeadMotion(t: number, out: HeadRotation): HeadRotation {
  out.pitch = 0.025 * Math.sin(t * 0.61) + 0.01 * Math.sin(t * 1.37 + 1.1);
  out.yaw = 0.04 * Math.sin(t * 0.43 + 0.5) + 0.012 * Math.sin(t * 1.13);
  out.roll = 0.015 * Math.sin(t * 0.37 + 2.0);
  return out;
}
