import { describe, expect, it } from "vitest";
import { parseNdjson } from "./turnClient.ts";

function streamOf(parts: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const p of parts) controller.enqueue(enc.encode(p));
      controller.close();
    },
  });
}

describe("parseNdjson", () => {
  it("parses objects split across chunk boundaries", async () => {
    const out: unknown[] = [];
    for await (const e of parseNdjson(streamOf(['{"a":1}\n{"b"', ':2}\n\n{"c":3}']))) out.push(e);
    expect(out).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });
});
