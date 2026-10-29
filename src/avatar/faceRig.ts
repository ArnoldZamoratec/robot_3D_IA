import type { Mesh, Object3D } from "three";

// Subset of the ARKit 52 blendshape names. Using the ARKit vocabulary keeps the
// animation layer compatible with most rigged GLB avatars that export these names
// and with audio-to-blendshape solvers.
export const FACE_CHANNELS = [
  "jawOpen",
  "mouthClose",
  "mouthFunnel",
  "mouthPucker",
  "mouthSmileLeft",
  "mouthSmileRight",
  "mouthFrownLeft",
  "mouthFrownRight",
  "eyeBlinkLeft",
  "eyeBlinkRight",
  "browInnerUp",
  "browDownLeft",
  "browDownRight",
] as const;

export type FaceChannel = (typeof FACE_CHANNELS)[number];
export type FaceWeights = Record<FaceChannel, number>;
export type FaceLayer = Partial<FaceWeights>;

export interface HeadRotation {
  pitch: number;
  yaw: number;
  roll: number;
}

/** Mutable per-frame pose shared between animation controllers and the avatar renderer. */
export interface AvatarPose {
  face: FaceWeights;
  head: HeadRotation;
  /** Normalised gaze offset in [-1, 1] on each axis. */
  gaze: { x: number; y: number };
  /** Breathing phase in [-1, 1]. */
  breath: number;
}

export function createFaceWeights(): FaceWeights {
  return Object.fromEntries(FACE_CHANNELS.map((c) => [c, 0])) as FaceWeights;
}

export function createAvatarPose(): AvatarPose {
  return { face: createFaceWeights(), head: { pitch: 0, yaw: 0, roll: 0 }, gaze: { x: 0, y: 0 }, breath: 0 };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Additively combines animation layers (idle, blink, lip sync, manual...) and clamps each
 * channel to [0, 1]. Writing into `out` avoids per-frame allocations.
 */
export function composeFace(layers: readonly FaceLayer[], out: FaceWeights = createFaceWeights()): FaceWeights {
  for (const channel of FACE_CHANNELS) {
    let sum = 0;
    for (const layer of layers) sum += layer[channel] ?? 0;
    out[channel] = clamp01(sum);
  }
  return out;
}

export interface MorphBinding {
  channel: FaceChannel;
  influences: number[];
  index: number;
}

const channelByLowerName = new Map<string, FaceChannel>(FACE_CHANNELS.map((c) => [c.toLowerCase(), c]));

/** Canonicalises common ARKit spellings: "eyeBlink_L" / "eyeBlink.L" → "eyeblinkleft". */
export function normalizeMorphName(name: string): string {
  return name
    .replace(/[_.]L$/i, "Left")
    .replace(/[_.]R$/i, "Right")
    .toLowerCase();
}

/**
 * Finds every morph target in `root` whose name matches a face channel, accepting
 * case differences and `_L`/`_R` suffixes.
 */
export function bindMorphTargets(root: Object3D): MorphBinding[] {
  const bindings: MorphBinding[] = [];
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    const dict = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;
    if (!dict || !influences) return;
    for (const [name, index] of Object.entries(dict)) {
      const channel = channelByLowerName.get(normalizeMorphName(name));
      if (channel) bindings.push({ channel, influences, index });
    }
  });
  return bindings;
}

export function applyMorphBindings(bindings: readonly MorphBinding[], weights: FaceWeights): void {
  for (const b of bindings) b.influences[b.index] = weights[b.channel];
}
