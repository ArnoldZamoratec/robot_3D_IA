import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";

// NVIDIA-hosted Riva speech NIMs are reached over gRPC through NVCF. Each model is selected
// with a `function-id` metadata header; IDs were verified as ACTIVE via the NVCF functions API.
const NVCF_ENDPOINT = "grpc.nvcf.nvidia.com:443";
const PROTO_ROOT = fileURLToPath(new URL("./protos", import.meta.url));
const CALL_TIMEOUT_MS = 20_000;

const definition = protoLoader.loadSync(["riva/proto/riva_tts.proto", "riva/proto/riva_asr.proto"], {
  includeDirs: [PROTO_ROOT],
  keepCase: true,
  longs: Number,
  enums: String,
  defaults: true,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loaded = grpc.loadPackageDefinition(definition) as any;

type Unary<Req, Res> = (
  req: Req,
  md: grpc.Metadata,
  opts: grpc.CallOptions,
  cb: (err: grpc.ServiceError | null, res: Res) => void,
) => void;

interface TtsStub extends grpc.Client {
  Synthesize: Unary<Record<string, unknown>, { audio: Buffer }>;
  GetRivaSynthesisConfig: Unary<Record<string, never>, { model_config: { parameters: Record<string, string> }[] }>;
}

interface AsrStub extends grpc.Client {
  Recognize: Unary<Record<string, unknown>, { results: { alternatives: { transcript: string }[] }[] }>;
}

export interface RivaConfig {
  apiKey: string;
  ttsFunctionId: string;
  asrFunctionId: string;
}

export class RivaError extends Error {
  readonly grpcCode: number | undefined;
  constructor(message: string, grpcCode?: number) {
    super(message);
    this.grpcCode = grpcCode;
  }
}

function call<Req, Res>(fn: Unary<Req, Res>, client: grpc.Client, req: Req, md: grpc.Metadata): Promise<Res> {
  return new Promise((resolve, reject) => {
    fn.call(client, req, md, { deadline: Date.now() + CALL_TIMEOUT_MS }, (err, res) =>
      err ? reject(new RivaError(err.details || err.message, err.code)) : resolve(res),
    );
  });
}

export function createRivaClient(config: RivaConfig) {
  const creds = grpc.credentials.createSsl();
  const tts = new loaded.nvidia.riva.tts.RivaSpeechSynthesis(NVCF_ENDPOINT, creds) as TtsStub;
  const asr = new loaded.nvidia.riva.asr.RivaSpeechRecognition(NVCF_ENDPOINT, creds) as AsrStub;

  const metadata = (functionId: string) => {
    const md = new grpc.Metadata();
    md.set("function-id", functionId);
    md.set("authorization", `Bearer ${config.apiKey}`);
    return md;
  };

  return {
    /** Returns mono 16-bit little-endian PCM at `sampleRateHz`. */
    async synthesize(opts: { text: string; languageCode: string; voiceName: string; sampleRateHz: number }) {
      const res = await call(
        tts.Synthesize,
        tts,
        {
          text: opts.text,
          language_code: opts.languageCode,
          encoding: "LINEAR_PCM",
          sample_rate_hz: opts.sampleRateHz,
          voice_name: opts.voiceName,
        },
        metadata(config.ttsFunctionId),
      );
      return res.audio;
    },

    /** Lists the voices advertised by the TTS function (for diagnostics). */
    async listVoices(): Promise<string[]> {
      const res = await call(tts.GetRivaSynthesisConfig, tts, {}, metadata(config.ttsFunctionId));
      return res.model_config.flatMap((m) => {
        const { voice_name: base = "", subvoices } = m.parameters;
        // Subvoices look like "ES-US.Isabela:34"; full names are "<base>.ES-US.Isabela".
        return subvoices ? subvoices.split(",").map((s) => `${base}.${s.split(":")[0]}`) : [base];
      });
    },

    /** Transcribes mono 16-bit PCM. Returns the best transcript (may be empty). */
    async recognize(pcm: Buffer, sampleRateHz: number, languageCode: string): Promise<string> {
      const res = await call(
        asr.Recognize,
        asr,
        {
          config: {
            encoding: "LINEAR_PCM",
            sample_rate_hertz: sampleRateHz,
            language_code: languageCode,
            max_alternatives: 1,
            audio_channel_count: 1,
            enable_automatic_punctuation: true,
          },
          audio: pcm,
        },
        metadata(config.asrFunctionId),
      );
      return res.results
        .map((r) => r.alternatives[0]?.transcript ?? "")
        .join(" ")
        .trim();
    },

    close() {
      tts.close();
      asr.close();
    },
  };
}

export type RivaClient = ReturnType<typeof createRivaClient>;
