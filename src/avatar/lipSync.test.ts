import { describe, expect, it } from "vitest";
import { featuresToMouth, type MouthState } from "./lipSync.ts";

const closed: MouthState = { jaw: 0, round: 0, wide: 0 };
const settle = (f: Parameters<typeof featuresToMouth>[0], from = closed) => {
  let m = from;
  for (let i = 0; i < 60; i++) m = featuresToMouth(f, m, 1 / 60);
  return m;
};

describe("featuresToMouth", () => {
  it("keeps the mouth closed for silence and background noise", () => {
    expect(settle({ rms: 0, low: 0, high: 0 })).toEqual(closed);
    expect(settle({ rms: 0.01, low: 0.5, high: 0.2 }).jaw).toBe(0);
  });

  it("opens the jaw in proportion to loudness", () => {
    const quiet = settle({ rms: 0.05, low: 0.4, high: 0.1 });
    const loud = settle({ rms: 0.2, low: 0.4, high: 0.1 });
    expect(quiet.jaw).toBeGreaterThan(0.1);
    expect(loud.jaw).toBeGreaterThan(quiet.jaw);
    expect(loud.jaw).toBeLessThanOrEqual(1);
  });

  it("rounds for low-dominant spectra and widens for bright spectra", () => {
    const oo = settle({ rms: 0.2, low: 0.9, high: 0.02 });
    const ee = settle({ rms: 0.2, low: 0.3, high: 0.35 });
    expect(oo.round).toBeGreaterThan(ee.round);
    expect(ee.wide).toBeGreaterThan(oo.wide);
  });

  it("closes after speech stops", () => {
    const open = settle({ rms: 0.2, low: 0.4, high: 0.1 });
    expect(settle({ rms: 0, low: 0, high: 0 }, open).jaw).toBeLessThan(0.01);
  });
});
