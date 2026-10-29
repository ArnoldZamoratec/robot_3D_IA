import { composeFace, createAvatarPose, type AvatarPose, type FaceLayer } from "./faceRig.ts";
import { BlinkController, breathing, idleHeadMotion, SaccadeController, type Random } from "./idleMotion.ts";

// Longest step we integrate in one frame; avoids a burst of motion after the tab was hidden.
const MAX_DT = 0.1;

/** Anything that can write the speech-driven face layer each frame (e.g. AudioLipSync). */
export interface SpeechSource {
  update(dt: number, out: FaceLayer): void;
}

/**
 * Owns every procedural animation layer and writes the final pose once per frame.
 * Layers are additive and clamped (see composeFace), so independent sources such as
 * blinking and lip sync cannot push a channel out of range.
 */
export class AvatarAnimator {
  readonly pose: AvatarPose = createAvatarPose();
  /** Manual overrides from the debug panel. */
  readonly manual: FaceLayer = {};
  /** Speech-driven layer, written by the current speech source. */
  readonly speech: FaceLayer = {};

  private readonly blink: BlinkController;
  private readonly saccades: SaccadeController;
  private speechSource: SpeechSource | null = null;
  private elapsed = 0;

  constructor(random?: Random) {
    this.blink = new BlinkController(random);
    this.saccades = new SaccadeController(random);
  }

  setSpeechSource(source: SpeechSource | null): void {
    this.speechSource = source;
    if (!source) for (const k of Object.keys(this.speech)) delete this.speech[k as keyof FaceLayer];
  }

  update(dt: number): AvatarPose {
    const step = Math.min(Math.max(dt, 0), MAX_DT);
    this.elapsed += step;
    this.speechSource?.update(step, this.speech);
    idleHeadMotion(this.elapsed, this.pose.head);
    this.saccades.update(step, this.pose.gaze);
    this.pose.breath = breathing(this.elapsed);
    composeFace([this.blink.update(step), this.speech, this.manual], this.pose.face);
    return this.pose;
  }
}
