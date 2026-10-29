import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadConfig, type ServerConfig } from "./config.ts";
import { streamChat } from "./llm.ts";
import { createRivaClient } from "./riva/client.ts";
import type { TurnDeps } from "./turn.ts";

try {
  process.loadEnvFile();
} catch {
  // No .env file: rely on the process environment.
}

function nvidiaPipeline(config: ServerConfig, apiKey: string): TurnDeps {
  const riva = createRivaClient({ apiKey, ttsFunctionId: config.ttsFunctionId, asrFunctionId: config.asrFunctionId });
  return {
    transcribe: (pcm, sampleRate) => riva.recognize(pcm, sampleRate, config.asrLanguage),
    chat: (messages, signal) => streamChat({ apiKey, model: config.llmModel, messages, signal }),
    synthesize: async (text) => ({
      pcm: await riva.synthesize({
        text,
        languageCode: config.ttsLanguage,
        voiceName: config.ttsVoice,
        sampleRateHz: config.ttsSampleRate,
      }),
      sampleRate: config.ttsSampleRate,
    }),
  };
}

const config = loadConfig();
const turn = config.nvidiaApiKey ? nvidiaPipeline(config, config.nvidiaApiKey) : undefined;
if (!turn) console.warn("[api] NVIDIA_API_KEY not set: voice endpoints will return 503.");

serve({ fetch: createApp(config, { turn }).fetch, port: config.port }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port} (llm: ${config.llmModel})`);
});
