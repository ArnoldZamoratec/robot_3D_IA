import type { FaceChannel } from "./faceRig.ts";

export interface AvatarInfo {
  kind: "placeholder" | "gltf";
  /** Face channels that actually drive geometry on this avatar. */
  boundChannels: FaceChannel[];
  hasHeadBone: boolean;
}
