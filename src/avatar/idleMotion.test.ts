import { describe, expect, it } from "vitest";
import { BlinkController, breathing, idleHeadMotion, SaccadeController } from "./idleMotion.ts";

function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe("BlinkController", () => {
  it("stays in [0, 1], blinks within 6 s, and closes fully", () => {
    const blink = new BlinkController(seeded());
    const dt = 1 / 60;
    let peak = 0;
    let firstBlinkAt = -1;
    for (let i = 1; i <= 60 * 20; i++) {
      const v = blink.update(dt).eyeBlinkLeft ?? 0;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (v > 0 && firstBlinkAt < 0) firstBlinkAt = i * dt;
      peak = Math.max(peak, v);
    }
    expect(firstBlinkAt).toBeGreaterThan(0);
    expect(firstBlinkAt).toBeLessThanOrEqual(6.1);
    expect(peak).toBeGreaterThan(0.9);
  });

  it("drives both eyes identically", () => {
    const blink = new BlinkController(() => 0); // first blink after exactly 2 s
    blink.update(2);
    const layer = blink.update(0.03);
    expect(layer.eyeBlinkLeft).toBeGreaterThan(0);
    expect(layer.eyeBlinkLeft).toBe(layer.eyeBlinkRight);
  });
});

describe("SaccadeController", () => {
  it("holds fixations, jumps quickly, and stays in range", () => {
    const sacc = new SaccadeController(seeded(7));
    const out = { x: 0, y: 0 };
    const samples: number[] = [];
    for (let i = 0; i < 60 * 30; i++) {
      sacc.update(1 / 60, out);
      expect(Math.abs(out.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(out.y)).toBeLessThanOrEqual(1);
      samples.push(out.x);
    }
    // Mostly still (fixations) with a few fast jumps.
    const moving = samples.slice(1).filter((x, i) => Math.abs(x - samples[i]!) > 0.01).length;
    expect(moving).toBeGreaterThan(5);
    expect(moving).toBeLessThan(samples.length * 0.2);
  });
});

describe("breathing", () => {
  it("cycles about 14 times per minute", () => {
    let crossings = 0;
    for (let t = 0.01; t < 60; t += 0.01) if (breathing(t - 0.01) < 0 && breathing(t) >= 0) crossings++;
    expect(crossings).toBeGreaterThanOrEqual(13);
    expect(crossings).toBeLessThanOrEqual(14);
  });
});

describe("idleHeadMotion", () => {
  it("keeps rotations small", () => {
    const out = { pitch: 0, yaw: 0, roll: 0 };
    for (let t = 0; t < 120; t += 0.1) {
      idleHeadMotion(t, out);
      expect(Math.abs(out.pitch)).toBeLessThan(0.05);
      expect(Math.abs(out.yaw)).toBeLessThan(0.06);
      expect(Math.abs(out.roll)).toBeLessThan(0.02);
    }
  });
});
