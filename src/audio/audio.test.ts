import { describe, expect, it } from "vitest";
import { base64Pcm16ToFloat32, bytesToBase64, concatFloat32, rms, toPcm16 } from "./pcm.ts";
import { VoiceActivityDetector, type VadEvent } from "./vad.ts";

describe("pcm", () => {
  it("downsamples 48 kHz to 16 kHz and clamps", () => {
    const input = new Float32Array(48).fill(0.5);
    input[0] = 2;
    const out = toPcm16(input, 48_000);
    expect(out.length).toBe(16);
    expect(out[1]).toBe(Math.floor(0.5 * 0x7fff));
    expect(out[0]).toBeLessThanOrEqual(0x7fff);
  });

  it("round-trips PCM16 through base64", () => {
    const pcm = new Int16Array([0, 16384, -16384, 32767, -32768]);
    const back = base64Pcm16ToFloat32(bytesToBase64(new Uint8Array(pcm.buffer)));
    expect(Array.from(back)).toEqual([0, 0.5, -0.5, 32767 / 32768, -1]);
  });

  it("concatenates chunks and measures RMS", () => {
    const joined = concatFloat32([new Float32Array([1, 1]), new Float32Array([-1, -1])]);
    expect(joined.length).toBe(4);
    expect(rms(joined)).toBe(1);
    expect(rms(new Float32Array())).toBe(0);
  });
});

describe("VoiceActivityDetector", () => {
  const run = (vad: VoiceActivityDetector, level: number, ms: number, sensitivity = 1) => {
    const events: VadEvent[] = [];
    for (let t = 0; t < ms; t += 20) {
      const e = vad.process(level, 20, sensitivity);
      if (e) events.push(e);
    }
    return events;
  };

  it("detects a sustained utterance after background noise", () => {
    const vad = new VoiceActivityDetector();
    expect(run(vad, 0.004, 2000)).toEqual([]);
    expect(run(vad, 0.08, 1000)).toEqual(["speech_start"]);
    expect(run(vad, 0.004, 1000)).toEqual(["speech_end"]);
  });

  it("ignores short clicks and brief pauses", () => {
    const vad = new VoiceActivityDetector();
    run(vad, 0.004, 1000);
    expect(run(vad, 0.2, 60)).toEqual([]); // click shorter than startMs
    run(vad, 0.004, 200);
    expect(run(vad, 0.08, 400)).toEqual(["speech_start"]);
    expect(run(vad, 0.004, 300)).toEqual([]); // pause shorter than endMs
    expect(run(vad, 0.08, 200)).toEqual([]);
  });

  it("requires louder input when sensitivity is raised", () => {
    const vad = new VoiceActivityDetector();
    run(vad, 0.004, 1000);
    expect(run(vad, 0.02, 500, 3)).toEqual([]);
    expect(run(vad, 0.02, 500, 1)).toEqual(["speech_start"]);
  });
});
