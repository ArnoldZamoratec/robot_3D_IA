import { useCallback, useEffect, useMemo, useState } from "react";
import { AvatarAnimator } from "./avatar/animator.ts";
import { AvatarStage } from "./avatar/AvatarStage.tsx";
import { AudioLipSync } from "./avatar/lipSync.ts";
import type { AvatarInfo } from "./avatar/types.ts";
import { isSessionActive } from "./conversation/state.ts";
import { useConversation } from "./conversation/useConversation.ts";
import { ErrorBoundary } from "./ui/ErrorBoundary.tsx";
import { FaceControls } from "./ui/FaceControls.tsx";
import { StatusPill } from "./ui/StatusPill.tsx";

/**
 * Avatar source: `?avatar=placeholder` or `?avatar=/models/<file>.glb` (same-origin only)
 * overrides VITE_AVATAR_URL. Used by tests and for quickly comparing models.
 */
function resolveAvatarUrl(): string | null {
  const param = new URLSearchParams(window.location.search).get("avatar");
  if (param === "placeholder") return null;
  if (param && /^\/models\/[\w.-]+\.glb$/.test(param)) return param;
  return import.meta.env.VITE_AVATAR_URL?.trim() || null;
}

const AVATAR_URL = resolveAvatarUrl();

export function App() {
  const animator = useMemo(() => new AvatarAnimator(), []);
  const [avatarInfo, setAvatarInfo] = useState<AvatarInfo | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const { state, start, stop, interrupt, micActive, micLevel, captions, speechOutput } = useConversation();

  const onAvatarError = useCallback((e: Error) => setAvatarError(e.message), []);

  // Drive the mouth from the audio actually being played.
  useEffect(() => {
    if (!speechOutput) return;
    const lipSync = new AudioLipSync(speechOutput.context, speechOutput.node);
    animator.setSpeechSource(lipSync);
    return () => {
      animator.setSpeechSource(null);
      lipSync.dispose();
    };
  }, [animator, speechOutput]);

  const active = isSessionActive(state.status);
  const busy = state.status === "connecting";
  const primaryLabel = busy
    ? "Connecting…"
    : active
      ? "End conversation"
      : state.status === "error"
        ? "Retry"
        : "Start conversation";

  return (
    <div className="app">
      <ErrorBoundary
        fallback={(e) => (
          <div className="stage stage-error" role="alert">
            3D rendering is unavailable in this browser ({e.message}). WebGL is required.
          </div>
        )}
      >
        <AvatarStage
          animator={animator}
          avatarUrl={AVATAR_URL}
          onAvatarReady={setAvatarInfo}
          onAvatarError={onAvatarError}
        />
      </ErrorBoundary>

      <header className="topbar">
        <div className="brand">
          <h1>Human AI 3D</h1>
          {avatarInfo?.kind === "placeholder" && (
            <span className="badge" title="Procedural stand-in. Set VITE_AVATAR_URL to load a rigged GLB.">
              Placeholder avatar
            </span>
          )}
        </div>
        <div className="topbar-right">
          {micActive && (
            <div className="mic-indicator" role="status" aria-label="Microphone is on">
              <span className="mic-dot" aria-hidden="true" />
              Mic on
              <span className="mic-meter" aria-hidden="true">
                <span style={{ transform: `scaleX(${micLevel})` }} />
              </span>
            </div>
          )}
          <StatusPill status={state.status} />
        </div>
      </header>

      {(state.error || avatarError) && (
        <div className="alerts">
          {state.error && (
            <div className="alert" role="alert">
              <strong>{state.error.recoverable ? "Something went wrong." : "Not available."}</strong>{" "}
              {state.error.message}
            </div>
          )}
          {avatarError && (
            <div className="alert" role="alert">
              <strong>Avatar failed to load; showing placeholder.</strong> {avatarError}
            </div>
          )}
        </div>
      )}

      {active && (captions.user || captions.assistant) && (
        <section className="captions" aria-live="polite" aria-label="Conversation captions">
          {captions.user && (
            <p>
              <span className="who">You</span> {captions.user}
            </p>
          )}
          {captions.assistant && (
            <p>
              <span className="who">Avatar</span> {captions.assistant}
            </p>
          )}
        </section>
      )}

      <footer className="controls">
        <button
          type="button"
          className={`btn ${active ? "btn-danger" : "btn-primary"}`}
          onClick={active ? stop : start}
          disabled={busy}
        >
          {primaryLabel}
        </button>
        {state.status === "speaking" && (
          <button type="button" className="btn btn-ghost" onClick={interrupt}>
            Interrupt
          </button>
        )}
      </footer>

      <p className="privacy-note">
        Your voice is processed by NVIDIA AI services to generate replies. Nothing is stored by this app.
      </p>

      <FaceControls animator={animator} info={avatarInfo} />
    </div>
  );
}
