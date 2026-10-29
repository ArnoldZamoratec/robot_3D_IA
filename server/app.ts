import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { stream } from "hono/streaming";
import type { ServerConfig } from "./config.ts";
import type { ChatMessage } from "./llm.ts";
import { createRateLimiter } from "./rateLimit.ts";
import { runTurn, type TurnDeps, type TurnEvent } from "./turn.ts";

const INPUT_SAMPLE_RATE = 16_000;
const MAX_AUDIO_SECONDS = 30;
const MAX_HISTORY = 12;
const MAX_MESSAGE_CHARS = 2_000;

interface Deps {
  /** Provider pipeline; omitted when no API key is configured. */
  turn?: TurnDeps;
  clientKey?: (c: Context) => string;
}

function defaultClientKey(c: Context): string {
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

function parseHistory(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null;
  const out: ChatMessage[] = [];
  for (const m of raw.slice(-MAX_HISTORY)) {
    if (
      !m ||
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string" ||
      m.content.length > MAX_MESSAGE_CHARS
    ) {
      return null;
    }
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

function describeError(e: unknown): { code: string; message: string } {
  const err = e as { status?: number; grpcCode?: number; message?: string };
  if (err.status === 429 || err.grpcCode === 8) {
    return { code: "provider_busy", message: "The AI provider is rate-limiting requests. Wait a moment and retry." };
  }
  if (err.status === 401 || err.status === 403 || err.grpcCode === 16 || err.grpcCode === 7) {
    return { code: "provider_auth", message: "The AI provider rejected the server's API key." };
  }
  return { code: "provider_error", message: "The AI provider failed to answer. Please try again." };
}

export function createApp(config: ServerConfig, deps: Deps = {}) {
  const clientKey = deps.clientKey ?? defaultClientKey;
  const allow = createRateLimiter(config.turnRateLimit, 60_000);
  const app = new Hono();

  // Never echo secrets: only report whether voice is configured.
  app.get("/api/health", (c) => c.json({ ok: true, voiceConfigured: Boolean(deps.turn) }));

  /**
   * One voice turn. Body: { audio: base64 PCM16 mono 16 kHz, history: ChatMessage[] }.
   * Response: NDJSON stream of TurnEvent. Audio is processed in memory and never stored.
   */
  app.post(
    "/api/turn",
    bodyLimit({ maxSize: Math.ceil(INPUT_SAMPLE_RATE * 2 * MAX_AUDIO_SECONDS * 1.4) + 64_000 }),
    async (c) => {
      const turnDeps = deps.turn;
      if (!turnDeps) {
        return c.json({ error: "voice_not_configured", message: "NVIDIA_API_KEY is not set on the server." }, 503);
      }
      if (!allow(clientKey(c))) {
        return c.json({ error: "rate_limited", message: "Too many requests. Try again in a minute." }, 429);
      }
      const body = (await c.req.json().catch(() => null)) as { audio?: unknown; history?: unknown } | null;
      const history = parseHistory(body?.history ?? []);
      if (typeof body?.audio !== "string" || !history) {
        return c.json({ error: "bad_request", message: "Expected { audio: base64 string, history: messages[] }." }, 400);
      }
      const pcm = Buffer.from(body.audio, "base64");
      if (pcm.length < 2 || pcm.length % 2 !== 0) {
        return c.json({ error: "bad_request", message: "Audio must be 16-bit PCM." }, 400);
      }

      const abort = new AbortController();
      c.req.raw.signal.addEventListener("abort", () => abort.abort(), { once: true });
      c.header("Content-Type", "application/x-ndjson");
      c.header("Cache-Control", "no-store");
      return stream(c, async (s) => {
        s.onAbort(() => abort.abort());
        const emit = (e: TurnEvent) => void s.write(`${JSON.stringify(e)}\n`);
        try {
          await runTurn(
            turnDeps,
            { pcm, sampleRate: INPUT_SAMPLE_RATE, history, instructions: config.instructions },
            emit,
            abort.signal,
          );
        } catch (e) {
          if (abort.signal.aborted) return;
          console.error("[api] turn failed:", (e as Error).message);
          emit({ type: "error", ...describeError(e) });
        }
      });
    },
  );

  return app;
}
