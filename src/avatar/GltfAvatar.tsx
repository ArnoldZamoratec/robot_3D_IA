import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Box3, Euler, Quaternion, Vector3, type Bone, type Group, type Object3D, type WebGLRenderer } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { AvatarAnimator } from "./animator.ts";
import { applyMorphBindings, bindMorphTargets } from "./faceRig.ts";
import type { AvatarInfo } from "./types.ts";

// Full-body avatars are framed as a head-and-shoulders portrait: head height in scene units and
// the height at which the face centre sits (camera looks at y = -0.3).
const BUST_HEAD_HEIGHT = 1.4;
const BUST_FACE_Y = 0.6;
// Head-only models are fitted to this height in scene units.
const HEAD_ONLY_HEIGHT = 3.1;
// Matches "Head", "mixamorigHead", "CC_Base_Head" but not "HeadTop_End".
const HEAD_BONE = /head$/i;
const NECK_BONE = /neck$/i;
const LEFT_EYE_BONE = /lefteye$|eye[_.]?l$/i;
const RIGHT_EYE_BONE = /righteye$|eye[_.]?r$/i;
const CHEST_BONE = /spine2$|chest$/i;
// Basis Universal transcoder for KTX2 textures, copied from three by `npm run setup:avatar`.
const BASIS_PATH = "/basis/";

let ktx2: KTX2Loader | null = null;
function ktx2Loader(gl: WebGLRenderer): KTX2Loader {
  ktx2 ??= new KTX2Loader().setTranscoderPath(BASIS_PATH).detectSupport(gl);
  return ktx2;
}

function findBone(root: Object3D, pattern: RegExp): Bone | undefined {
  let found: Bone | undefined;
  root.traverse((o) => {
    if (!found && (o as Bone).isBone && pattern.test(o.name)) found = o as Bone;
  });
  return found;
}

/** A bone plus its rest rotation; procedural rotations are applied on top of the rest pose. */
class BoneDriver {
  private readonly rest: Quaternion;
  private static readonly euler = new Euler();
  private static readonly delta = new Quaternion();

  constructor(readonly bone: Bone) {
    this.rest = bone.quaternion.clone();
  }

  set(pitch: number, yaw: number, roll: number): void {
    BoneDriver.euler.set(pitch, yaw, roll);
    this.bone.quaternion.copy(this.rest).multiply(BoneDriver.delta.setFromEuler(BoneDriver.euler));
  }
}

const driver = (bone: Bone | undefined) => (bone ? new BoneDriver(bone) : undefined);

// Share of the idle head rotation taken by the neck (the rest goes to the head).
const NECK_SHARE = 0.4;
// Maximum eye rotation (radians) for a normalised gaze of 1.
const EYE_YAW = 0.22;
const EYE_PITCH = 0.12;
// Chest pitch amplitude for breathing (radians).
const BREATH_PITCH = 0.012;

/**
 * Loads a GLB (meshopt and KTX2 supported) and drives its ARKit-named morph targets.
 * Head motion uses the head bone when the model has a skeleton; head-only models without
 * bones are fitted to the frame and rotated as a whole.
 */
export function GltfAvatar({
  url,
  animator,
  onReady,
}: {
  url: string;
  animator: AvatarAnimator;
  onReady?: (info: AvatarInfo) => void;
}) {
  const gl = useThree((s) => s.gl);
  const { scene } = useLoader(GLTFLoader, url, (loader) => {
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.setKTX2Loader(ktx2Loader(gl));
  });
  const pivot = useRef<Group>(null);

  const rig = useMemo(() => {
    scene.updateMatrixWorld(true);
    const bindings = bindMorphTargets(scene);
    const head = findBone(scene, HEAD_BONE);
    const box = new Box3().setFromObject(scene);
    const size = box.getSize(new Vector3());
    if (head) {
      // Portrait framing from body proportions (a head is ~1/7.5 of standing height): face
      // centre slightly above the head bone, placed in the upper part of the frame.
      const headHeight = size.y / 7.5;
      const scale = BUST_HEAD_HEIGHT / headHeight;
      const faceCentre = head.getWorldPosition(new Vector3());
      faceCentre.y += headHeight * 0.4;
      return {
        bindings,
        head: new BoneDriver(head),
        neck: driver(findBone(scene, NECK_BONE)),
        eyes: [driver(findBone(scene, LEFT_EYE_BONE)), driver(findBone(scene, RIGHT_EYE_BONE))],
        chest: driver(findBone(scene, CHEST_BONE)),
        scale,
        offset: faceCentre.multiplyScalar(-scale).add(new Vector3(0, BUST_FACE_Y, 0)),
      };
    }
    const scale = HEAD_ONLY_HEIGHT / (size.y || 1);
    return {
      bindings,
      head: undefined,
      neck: undefined,
      eyes: [],
      chest: undefined,
      scale,
      offset: box.getCenter(new Vector3()).multiplyScalar(-scale),
    };
  }, [scene]);

  useEffect(() => {
    onReady?.({
      kind: "gltf",
      boundChannels: [...new Set(rig.bindings.map((b) => b.channel))],
      hasHeadBone: Boolean(rig.head),
    });
  }, [rig, onReady]);

  useFrame((_, dt) => {
    const pose = animator.update(dt);
    applyMorphBindings(rig.bindings, pose.face);
    if (rig.head) {
      const { pitch, yaw, roll } = pose.head;
      const neck = rig.neck ? NECK_SHARE : 0;
      rig.neck?.set(pitch * neck, yaw * neck, roll * neck);
      rig.head.set(pitch * (1 - neck), yaw * (1 - neck), roll * (1 - neck));
      for (const eye of rig.eyes) eye?.set(-pose.gaze.y * EYE_PITCH, pose.gaze.x * EYE_YAW, 0);
      rig.chest?.set(-pose.breath * BREATH_PITCH, 0, 0);
    } else {
      pivot.current?.rotation.set(pose.head.pitch, pose.head.yaw, pose.head.roll);
    }
  });

  return (
    <group ref={pivot}>
      <group position={rig.offset} scale={rig.scale}>
        <primitive object={scene} />
      </group>
    </group>
  );
}
