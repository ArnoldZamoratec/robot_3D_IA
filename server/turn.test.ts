import { describe, expect, it } from "vitest";
import { runTurn, type TurnDeps, type TurnEvent } from "./turn.ts";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fakeDeps(over: Partial<TurnDeps> = {}): TurnDeps {
  return {
    transcribe: async () => "hola",
    async *chat() {
      for (const t of ["Primera frase bastante larga. ", "Segunda frase también larga. ", "Fin"]) {
        await delay(1);
        yield t;
      }
    },
    // Earlier sentences take longer, to prove ordering is preserved.
    synthesize: async (text) => {
      await delay(text.startsWith("Primera") ? 20 : 1);
      return { pcm: Buffer.from(text), sampleRate: 22050 };
    },
    ...over,
  };
}

async function collect(deps: TurnDeps, signal = new AbortController().signal) {
  const events: TurnEvent[] = [];
  await runTurn(deps, { pcm: Buffer.alloc(2), sampleRate: 16000, history: [], instructions: "sys" }, (e) => events.push(e), signal);
  return events;
}

describe("runTurn", () => {
  it("streams transcript, sentences, ordered audio, then done", async () => {
    const events = await collect(fakeDeps());
    expect(events[0]).toEqual({ type: "transcript", text: "hola" });
    const audio = events.filter((e) => e.type === "audio");
    expect(audio.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(Buffer.from(audio[0]!.type === "audio" ? audio[0]!.pcm : "", "base64").toString()).toBe(
      "Primera frase bastante larga.",
    );
    expect(events.at(-1)).toEqual({
      type: "done",
      reply: "Primera frase bastante larga. Segunda frase también larga. Fin",
    });
  });

  it("passes history and instructions to the LLM", async () => {
    let seen: unknown;
    await collect(
      fakeDeps({
        async *chat(messages) {
          seen = messages;
          yield "Ok.";
        },
      }),
    );
    expect(seen).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "hola" },
    ]);
  });

  it("ends early with an empty reply when nothing was heard", async () => {
    const events = await collect(fakeDeps({ transcribe: async () => "  " }));
    expect(events).toEqual([
      { type: "transcript", text: "" },
      { type: "done", reply: "" },
    ]);
  });

  it("stops emitting after abort", async () => {
    const ac = new AbortController();
    const events: TurnEvent[] = [];
    const run = runTurn(
      fakeDeps(),
      { pcm: Buffer.alloc(2), sampleRate: 16000, history: [], instructions: "" },
      (e) => {
        events.push(e);
        if (e.type === "sentence") ac.abort();
      },
      ac.signal,
    );
    await run;
    expect(events.some((e) => e.type === "audio" || e.type === "done")).toBe(false);
  });

  it("propagates TTS failures", async () => {
    await expect(
      collect(
        fakeDeps({
          synthesize: async () => {
            throw new Error("tts down");
          },
        }),
      ),
    ).rejects.toThrow("tts down");
  });
});
