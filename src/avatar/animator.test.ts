import { describe, expect, it } from "vitest";
import { AvatarAnimator } from "./animator.ts";

describe("AvatarAnimator", () => {
  it("combines manual and speech layers into the pose", () => {
    const animator = new AvatarAnimator(() => 0.99);
    animator.manual.jawOpen = 0.4;
    animator.speech.jawOpen = 0.3;
    animator.manual.mouthSmileLeft = 2;
    const pose = animator.update(1 / 60);
    expect(pose.face.jawOpen).toBeCloseTo(0.7);
    expect(pose.face.mouthSmileLeft).toBe(1);
  });

  it("clamps large frame steps so idle motion does not jump", () => {
    const a = new AvatarAnimator(() => 0.99);
    const b = new AvatarAnimator(() => 0.99);
    a.update(30); // e.g. returning from a background tab
    b.update(0.1);
    expect(a.pose.head).toEqual(b.pose.head);
  });
});
