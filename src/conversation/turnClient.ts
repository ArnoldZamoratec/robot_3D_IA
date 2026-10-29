import type { ConversationError } from "./state.ts";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Mirrors server/turn.ts TurnEvent. */
export type TurnEvent =
  | { type: "transcript"; text: string }
  | { type: "sentence"; index: number; text: string }
  | { type: "audio"; index: number; sampleRate: number; pcm: string }
  | { type: "done"; reply: string }
  | { type: "error"; code: string; message: string };

export class TurnError extends Error {
  readonly detail: ConversationError;
  constructor(detail: ConversationError) {
    super(detail.message);
    this.detail = detail;
  }
}

/** Splits a byte stream into parsed NDJSON objects. */
export async function* parseNdjson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const decoder = new TextDecoder();
  let buffer = "";
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) yield JSON.parse(line) as T;
      }
    }
    if (buffer.trim()) yield JSON.parse(buffer) as T;
  } finally {
    reader.releaseLock();
  }
}

/** Sends one utterance and yields the server's turn events as they stream in. */
export async function* streamTurn(audioBase64: string, history: ChatMessage[], signal: AbortSignal) {
  const res = await fetch("/api/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audio: audioBase64, history }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new TurnError({
      code: body?.error ?? `http_${res.status}`,
      message: body?.message ?? `The server could not process the request (HTTP ${res.status}).`,
      recoverable: res.status !== 400,
    });
  }
  yield* parseNdjson<TurnEvent>(res.body);
}
