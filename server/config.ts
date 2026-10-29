export interface ServerConfig {
  port: number;
  nvidiaApiKey: string | null;
  llmModel: string;
  ttsFunctionId: string;
  ttsVoice: string;
  ttsLanguage: string;
  ttsSampleRate: number;
  asrFunctionId: string;
  asrLanguage: string;
  instructions: string;
  /** Max /api/turn requests per client IP per minute. */
  turnRateLimit: number;
}

const DEFAULT_INSTRUCTIONS =
  "Eres un asistente conversacional amable representado por un avatar 3D. " +
  "Responde siempre en el idioma del usuario, de forma natural y breve (una a tres frases), " +
  "sin markdown, listas ni emojis, porque tu respuesta se convierte en voz.";

function int(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  const v = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`Invalid ${name}: ${raw}`);
  return v;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const str = (name: string, fallback: string) => env[name]?.trim() || fallback;
  return {
    port: int(env, "PORT", 8787, 1, 65535),
    nvidiaApiKey: env.NVIDIA_API_KEY?.trim() || null,
    llmModel: str("LLM_MODEL", "nvidia/nemotron-3.5-lightning-30b-a3b"),
    // NVCF function IDs verified ACTIVE on 2026-10-28 via api.nvcf.nvidia.com/v2/nvcf/functions.
    ttsFunctionId: str("TTS_FUNCTION_ID", "877104f7-e885-42b9-8de8-f6e4c6303969"), // magpie-tts-multilingual
    ttsVoice: str("TTS_VOICE", "Magpie-Multilingual.ES-US.Isabela"),
    ttsLanguage: str("TTS_LANGUAGE", "es-US"),
    ttsSampleRate: int(env, "TTS_SAMPLE_RATE", 22050, 8000, 48000),
    asrFunctionId: str("ASR_FUNCTION_ID", "71203149-d3b7-4460-8231-1be2543a1fca"), // parakeet-1.1b-rnnt-multilingual
    asrLanguage: str("ASR_LANGUAGE", "es-US"),
    instructions: str("AVATAR_INSTRUCTIONS", DEFAULT_INSTRUCTIONS),
    turnRateLimit: int(env, "TURN_RATE_LIMIT", 30, 1, 10_000),
  };
}
