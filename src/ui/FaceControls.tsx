import { useState } from "react";
import type { AvatarAnimator } from "../avatar/animator.ts";
import type { FaceChannel } from "../avatar/faceRig.ts";
import type { AvatarInfo } from "../avatar/types.ts";

interface Control {
  label: string;
  channels: FaceChannel[];
}

const CONTROLS: Control[] = [
  { label: "Jaw open", channels: ["jawOpen"] },
  { label: "Funnel (oo)", channels: ["mouthFunnel"] },
  { label: "Smile", channels: ["mouthSmileLeft", "mouthSmileRight"] },
  { label: "Brows up", channels: ["browInnerUp"] },
  { label: "Eyes closed", channels: ["eyeBlinkLeft", "eyeBlinkRight"] },
];

/** Developer panel that writes the animator's manual layer to verify facial channels respond. */
export function FaceControls({ animator, info }: { animator: AvatarAnimator; info: AvatarInfo | null }) {
  const [values, setValues] = useState<Record<string, number>>({});

  const set = (control: Control, value: number) => {
    for (const c of control.channels) animator.manual[c] = value;
    setValues((v) => ({ ...v, [control.label]: value }));
  };

  const reset = () => {
    for (const control of CONTROLS) for (const c of control.channels) delete animator.manual[c];
    setValues({});
  };

  const bound = new Set(info?.boundChannels);

  return (
    <details className="panel face-controls">
      <summary>Face controls</summary>
      {info && (
        <p className="panel-meta">
          {info.kind === "placeholder" ? "Placeholder rig" : "GLB rig"} · {bound.size} channels bound ·{" "}
          {info.hasHeadBone ? "head bone found" : "no head bone"}
        </p>
      )}
      {CONTROLS.map((control) => {
        const id = `fc-${control.channels[0]}`;
        const supported = control.channels.some((c) => bound.has(c));
        return (
          <div className="slider" key={control.label}>
            <label htmlFor={id}>
              {control.label}
              {!supported && info && <span className="muted"> (not on this model)</span>}
            </label>
            <input
              id={id}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={values[control.label] ?? 0}
              onChange={(e) => set(control, Number(e.target.value))}
            />
          </div>
        );
      })}
      <button type="button" className="btn btn-ghost" onClick={reset}>
        Reset
      </button>
    </details>
  );
}
