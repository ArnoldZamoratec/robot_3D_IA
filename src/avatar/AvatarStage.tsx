import { OrbitControls, useProgress } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { ErrorBoundary } from "../ui/ErrorBoundary.tsx";
import type { AvatarAnimator } from "./animator.ts";
import { GltfAvatar } from "./GltfAvatar.tsx";
import { PlaceholderAvatar } from "./PlaceholderAvatar.tsx";
import { StudioEnvironment } from "./StudioEnvironment.tsx";
import type { AvatarInfo } from "./types.ts";

/** DOM overlay outside the Canvas; useProgress tracks THREE.DefaultLoadingManager. */
function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="scene-loading" role="status">
      Loading avatar… {Math.round(progress)}%
    </div>
  );
}

interface Props {
  animator: AvatarAnimator;
  avatarUrl: string | null;
  onAvatarReady: (info: AvatarInfo) => void;
  onAvatarError: (error: Error) => void;
}

export function AvatarStage({ animator, avatarUrl, onAvatarReady, onAvatarError }: Props) {
  const placeholder = <PlaceholderAvatar animator={animator} onReady={onAvatarReady} />;
  return (
    <>
      <Canvas
        className="stage"
        camera={{ position: [0, -0.2, 7.2], fov: 26, near: 0.1, far: 100 }}
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: false }}
        aria-label="3D avatar"
        data-testid="avatar-canvas"
      >
        <StudioEnvironment />
        <hemisphereLight args={["#fff1e6", "#1d2230", 0.35]} />
        <directionalLight position={[2.5, 3, 4]} intensity={1.6} color="#ffe8d6" />
        <directionalLight position={[-3.5, 1, 2.5]} intensity={0.7} color="#c3d6ff" />
        <directionalLight position={[0, 3, -4]} intensity={1.6} color="#9fc0ff" />
  
        <ErrorBoundary fallback={() => placeholder} onError={onAvatarError}>
          <Suspense fallback={null}>
            {avatarUrl ? (
              <GltfAvatar url={avatarUrl} animator={animator} onReady={onAvatarReady} />
            ) : (
              placeholder
            )}
          </Suspense>
        </ErrorBoundary>
  
        <OrbitControls
          target={[0, -0.3, 0]}
          enablePan={false}
          minDistance={4}
          maxDistance={11}
          minPolarAngle={Math.PI * 0.32}
          maxPolarAngle={Math.PI * 0.62}
          minAzimuthAngle={-0.9}
          maxAzimuthAngle={0.9}
        />
    </Canvas>
    <LoadingOverlay />
    </>
  );
}
