import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { DoubleSide, type Group, type Mesh } from "three";
import type { AvatarAnimator } from "./animator.ts";
import { FACE_CHANNELS } from "./faceRig.ts";
import type { AvatarInfo } from "./types.ts";

/**
 * PLACEHOLDER AVATAR — a stylised procedural bust, not a realistic human.
 * It exists so the animation pipeline (blink, head motion, mouth channels) can be
 * developed and tested before a licensed, rigged GLB avatar is supplied via VITE_AVATAR_URL.
 * Facial features are driven directly from ARKit-named channels instead of morph targets.
 */

const SKIN = "#c99a82";
const LIP = "#a4625a";
const EYE_Y = 0.12;
const EYE_X = 0.3;
const EYE_Z = 0.7;
const MOUTH_Y = -0.42;
const MOUTH_Z = 0.8;
const HEAD_DEPTH = 0.88; // z-radius of the head ellipsoid (y-radius is 1)

/** Front surface depth of the head ellipsoid at height y on the centre line. */
const headSurfaceZ = (y: number) => HEAD_DEPTH * Math.sqrt(Math.max(0, 1 - y * y));

// Eyelid rotation about X: open = tilted back, closed = covering the front of the eye.
const LID_OPEN = -0.95;
const LID_CLOSED = 1.45;

const PLACEHOLDER_INFO: AvatarInfo = { kind: "placeholder", boundChannels: [...FACE_CHANNELS], hasHeadBone: true };

export function PlaceholderAvatar({
  animator,
  onReady,
}: {
  animator: AvatarAnimator;
  onReady?: (info: AvatarInfo) => void;
}) {
  const head = useRef<Group>(null);
  const lidL = useRef<Mesh>(null);
  const lidR = useRef<Mesh>(null);
  const eyeL = useRef<Group>(null);
  const eyeR = useRef<Group>(null);
  const browL = useRef<Mesh>(null);
  const browR = useRef<Mesh>(null);
  const mouth = useRef<Mesh>(null);
  const upperLip = useRef<Mesh>(null);
  const lowerLip = useRef<Mesh>(null);

  useEffect(() => onReady?.(PLACEHOLDER_INFO), [onReady]);

  useFrame((_, dt) => {
    const { face, head: rot, gaze } = animator.update(dt);
    if (head.current) head.current.rotation.set(rot.pitch, rot.yaw, rot.roll);

    lidL.current?.rotation.set(LID_OPEN + (LID_CLOSED - LID_OPEN) * face.eyeBlinkLeft, 0, 0);
    lidR.current?.rotation.set(LID_OPEN + (LID_CLOSED - LID_OPEN) * face.eyeBlinkRight, 0, 0);
    for (const eye of [eyeL.current, eyeR.current]) eye?.rotation.set(-gaze.y * 0.3, gaze.x * 0.4, 0);

    const browLift = face.browInnerUp * 0.06;
    browL.current?.position.setY(EYE_Y + 0.2 + browLift - face.browDownLeft * 0.04);
    browR.current?.position.setY(EYE_Y + 0.2 + browLift - face.browDownRight * 0.04);
    // Positive Z on the left brow raises its inner (right-hand) end.
    browL.current?.rotation.set(0, 0, 0.05 + face.browInnerUp * 0.15 - face.browDownLeft * 0.2);
    browR.current?.rotation.set(0, 0, -0.05 - face.browInnerUp * 0.15 + face.browDownRight * 0.2);

    const smile = (face.mouthSmileLeft + face.mouthSmileRight) / 2;
    const frown = (face.mouthFrownLeft + face.mouthFrownRight) / 2;
    const round = Math.max(face.mouthFunnel, face.mouthPucker);
    const open = Math.max(0, face.jawOpen - face.mouthClose * 0.5);
    const width = 0.2 * (1 + smile * 0.3 - round * 0.45);
    const lift = (smile - frown) * 0.01;
    const upperY = MOUTH_Y + 0.012 + lift;
    const lowerY = MOUTH_Y - 0.012 - open * 0.19 - face.mouthFunnel * 0.04 + lift;

    // Features follow the curved head surface so they never sink into it.
    mouth.current?.scale.set(width, upperY - lowerY, 1);
    mouth.current?.position.set(0, (upperY + lowerY) / 2, headSurfaceZ(upperY) + 0.004);
    const lipScale = width / 0.2;
    const lipBulge = 1 + round * 0.6;
    // Capsules are rotated 90° about Z, so local Y is the lip width.
    upperLip.current?.scale.set(1 + round * 0.4, lipScale, lipBulge);
    upperLip.current?.position.set(0, upperY, headSurfaceZ(upperY) + 0.012);
    lowerLip.current?.scale.set(1 + round * 0.4, lipScale, lipBulge);
    lowerLip.current?.position.set(0, lowerY, headSurfaceZ(lowerY) + 0.014);
  });

  return (
    <group position={[0, 0.15, 0]}>
      {/* Shoulders and neck stay still; only the head group rotates. */}
      <mesh position={[0, -1.15, -0.05]}>
        <cylinderGeometry args={[0.3, 0.36, 0.8, 32]} />
        <meshStandardMaterial color={SKIN} roughness={0.6} />
      </mesh>
      <mesh position={[0, -2.05, -0.1]} scale={[1.6, 0.75, 0.75]}>
        <sphereGeometry args={[1, 48, 32]} />
        <meshStandardMaterial color="#2d3442" roughness={0.85} />
      </mesh>

      <group ref={head} position={[0, 0, 0]}>
        <mesh scale={[0.8, 1, HEAD_DEPTH]}>
          <sphereGeometry args={[1, 64, 48]} />
          <meshPhysicalMaterial color={SKIN} roughness={0.55} sheen={0.4} sheenColor="#ffd6c4" />
        </mesh>
        {/* Hair cap */}
        <mesh position={[0, 0.08, -0.04]} scale={[0.84, 1.0, 0.92]} rotation={[-0.35, 0, 0]}>
          <sphereGeometry args={[1, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
          <meshStandardMaterial color="#2a1d17" roughness={0.9} />
        </mesh>
        {/* Ears */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.79, -0.02, 0]} scale={[0.07, 0.2, 0.12]}>
            <sphereGeometry args={[1, 24, 16]} />
            <meshStandardMaterial color={SKIN} roughness={0.6} />
          </mesh>
        ))}
        {/* Nose */}
        <mesh position={[0, -0.12, 0.86]} scale={[0.09, 0.16, 0.1]}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshStandardMaterial color={SKIN} roughness={0.55} />
        </mesh>

        {[
          { x: -EYE_X, eye: eyeL, lid: lidL, brow: browL },
          { x: EYE_X, eye: eyeR, lid: lidR, brow: browR },
        ].map(({ x, eye, lid, brow }) => (
          <group key={x}>
            <group ref={eye} position={[x, EYE_Y, EYE_Z]}>
              <mesh>
                <sphereGeometry args={[0.13, 32, 24]} />
                <meshStandardMaterial color="#f4f1ec" roughness={0.25} />
              </mesh>
              <mesh position={[0, 0, 0.1]}>
                <sphereGeometry args={[0.055, 24, 16]} />
                <meshStandardMaterial color="#3b2a20" roughness={0.2} />
              </mesh>
              <mesh position={[0, 0, 0.125]}>
                <sphereGeometry args={[0.025, 16, 12]} />
                <meshStandardMaterial color="#050505" roughness={0.1} />
              </mesh>
            </group>
            <mesh ref={lid} position={[x, EYE_Y, EYE_Z]}>
              <sphereGeometry args={[0.142, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={SKIN} roughness={0.6} side={DoubleSide} />
            </mesh>
            <mesh ref={brow} position={[x, EYE_Y + 0.2, EYE_Z + 0.1]}>
              <boxGeometry args={[0.22, 0.035, 0.04]} />
              <meshStandardMaterial color="#2a1d17" roughness={0.9} />
            </mesh>
          </group>
        ))}

        {/* Mouth: dark interior plus two lips that follow jaw, funnel, and smile channels. */}
        <mesh ref={mouth} position={[0, MOUTH_Y, MOUTH_Z]}>
          <circleGeometry args={[0.5, 32]} />
          <meshStandardMaterial color="#3a1414" roughness={0.9} />
        </mesh>
        <mesh ref={upperLip} position={[0, MOUTH_Y, MOUTH_Z + 0.005]} rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.022, 0.16, 8, 16]} />
          <meshStandardMaterial color={LIP} roughness={0.45} />
        </mesh>
        <mesh ref={lowerLip} position={[0, MOUTH_Y, MOUTH_Z + 0.005]} rotation={[0, 0, Math.PI / 2]}>
          <capsuleGeometry args={[0.026, 0.15, 8, 16]} />
          <meshStandardMaterial color={LIP} roughness={0.45} />
        </mesh>
      </group>
    </group>
  );
}
