import type { ChatMessage } from "./llm.ts";
import { cleanForSpeech, SentenceChunker } from "./text.ts";

/** Events streamed to the browser as NDJSON, in order. */
export type TurnEvent =
  | { type: "transcript"; text: string }
  | { type: "sentence"; index: number; text: string }
  | { type: "audio"; index: number; sampleRate: number; pcm: string }
  | { type: "done"; reply: string }
  | { type: "error"; code: string; message: string };

export interface TurnDeps {
  transcribe(pcm: Buffer, sampleRate: number): Promise<string>;
  chat(messages: ChatMessage[], signal: AbortSignal): AsyncIterable<string>;
  synthesize(text: string): Promise<{ pcm: Buffer; sampleRate: number }>;
}

export interface TurnInput {
  pcm: Buffer;
  sampleRate: number;
  history: ChatMessage[];
  instructions: string;
}

/**
 * One conversational turn: ASR → streamed LLM → per-sentence TTS. Sentences are synthesised
 * in order while the LLM keeps generating, so the first audio arrives before the reply ends.
 * Stops promptly when `signal` aborts (user barge-in or disconnect).
 */
export async function runTurn(
  deps: TurnDeps,
  input: TurnInput,
  emit: (e: TurnEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const transcript = (await deps.transcribe(input.pcm, input.sampleRate)).trim();
  if (signal.aborted) return;
  emit({ type: "transcript", text: transcript });
  if (!transcript) {
    emit({ type: "done", reply: "" });
    return;
  }

  const messages: ChatMessage[] = [
    { role: "system", content: input.instructions },
    ...input.history,
    { role: "user", content: transcript },
  ];

  const chunker = new SentenceChunker();
  let reply = "";
  let index = 0;
  // Chain TTS calls so audio is emitted in sentence order even though synthesis overlaps generation.
  let ttsChain: Promise<void> = Promise.resolve();
  const speak = (raw: string) => {
    const text = cleanForSpeech(raw);
    if (!text) return;
    const i = index++;
    emit({ type: "sentence", index: i, text });
    const audio = deps.synthesize(text);
    audio.catch(() => {}); // handled when the chain reaches it
    ttsChain = ttsChain.then(async () => {
      const { pcm, sampleRate } = await audio;
      if (!signal.aborted) emit({ type: "audio", index: i, sampleRate, pcm: pcm.toString("base64") });
    });
    ttsChain.catch(() => (ttsFailed = true)); // observed now; rethrown by `await ttsChain` below
  };
  let ttsFailed = false;

  for await (const delta of deps.chat(messages, signal)) {
    if (signal.aborted) return;
    if (ttsFailed) break; // surface the TTS error without waiting for the full reply
    reply += delta;
    for (const sentence of chunker.push(delta)) speak(sentence);
  }
  const rest = chunker.flush();
  if (rest) speak(rest);
  await ttsChain;
  if (!signal.aborted) emit({ type: "done", reply: cleanForSpeech(reply) });
}
