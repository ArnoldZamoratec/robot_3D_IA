import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { createRateLimiter } from "./rateLimit.ts";
import type { TurnDeps } from "./turn.ts";

const fakeTurn: TurnDeps = {
  transcribe: async () => "hola",
  async *chat() {
    yield "Hola, ¿en qué puedo ayudarte hoy?";
  },
  synthesize: async () => ({ pcm: Buffer.from([1, 0, 2, 0]), sampleRate: 22050 }),
};

const audio = Buffer.alloc(3200).toString("base64"); // 0.1 s of silence
const postTurn = (app: ReturnType<typeof createApp>, body: unknown) =>
  app.request("/api/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const ndjson = async (res: Response) =>
  (await res.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { type: string });

describe("server app", () => {
  it("reports health without leaking secrets", async () => {
    const config = loadConfig({ NVIDIA_API_KEY: "nvapi-secret" });
    const res = await createApp(config, { turn: fakeTurn }).request("/api/health");
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ ok: true, voiceConfigured: true });
    expect(body).not.toContain("nvapi-secret");
  });

  it("returns 503 while voice is not configured", async () => {
    const res = await postTurn(createApp(loadConfig({})), { audio, history: [] });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "voice_not_configured" });
  });

  it("streams a full turn as NDJSON", async () => {
    const res = await postTurn(createApp(loadConfig({}), { turn: fakeTurn }), { audio, history: [] });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const types = (await ndjson(res)).map((e) => e.type);
    expect(types).toEqual(["transcript", "sentence", "audio", "done"]);
  });

  it("validates the request body", async () => {
    const app = createApp(loadConfig({}), { turn: fakeTurn });
    expect((await postTurn(app, { history: [] })).status).toBe(400);
    expect((await postTurn(app, { audio: "AAAA", history: [] })).status).toBe(400); // 3 bytes: not 16-bit PCM
    expect((await postTurn(app, { audio, history: [{ role: "system", content: "x" }] })).status).toBe(400);
    expect((await postTurn(app, { audio, history: "nope" })).status).toBe(400);
  });

  it("rejects oversized audio", async () => {
    const app = createApp(loadConfig({}), { turn: fakeTurn });
    const big = Buffer.alloc(16000 * 2 * 60).toString("base64"); // 60 s
    expect((await postTurn(app, { audio: big, history: [] })).status).toBe(413);
  });

  it("reports provider failures as a stream error without internal details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing: TurnDeps = {
      ...fakeTurn,
      transcribe: async () => {
        throw Object.assign(new Error("UNAUTHENTICATED org-123"), { grpcCode: 16 });
      },
    };
    const res = await postTurn(createApp(loadConfig({}), { turn: failing }), { audio, history: [] });
    const text = await res.text();
    expect(JSON.parse(text.trim())).toMatchObject({ type: "error", code: "provider_auth" });
    expect(text).not.toContain("org-123");
  });

  it("rate-limits turns per client", async () => {
    const app = createApp(loadConfig({ TURN_RATE_LIMIT: "1" }), { turn: fakeTurn, clientKey: () => "ip" });
    expect((await postTurn(app, { audio, history: [] })).status).toBe(200);
    expect((await postTurn(app, { audio, history: [] })).status).toBe(429);
  });

  it("rejects invalid configuration", () => {
    expect(() => loadConfig({ PORT: "abc" })).toThrow(/Invalid PORT/);
    expect(() => loadConfig({ TTS_SAMPLE_RATE: "5" })).toThrow(/TTS_SAMPLE_RATE/);
  });
});

describe("createRateLimiter", () => {
  it("resets after the window", () => {
    let t = 0;
    const allow = createRateLimiter(1, 1000, () => t);
    expect(allow("a")).toBe(true);
    expect(allow("a")).toBe(false);
    expect(allow("b")).toBe(true);
    t = 1000;
    expect(allow("a")).toBe(true);
  });
});
