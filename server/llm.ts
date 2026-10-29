// NVIDIA-hosted LLMs expose an OpenAI-compatible Chat Completions API.
const CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class LlmError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Parses an SSE byte stream into the `data:` payloads, one per event. */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
}

export interface StreamChatOptions {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal: AbortSignal;
  maxTokens?: number;
  fetch?: typeof fetch;
}

/** Streams assistant text deltas. Reasoning output is disabled for low latency. */
export async function* streamChat(opts: StreamChatOptions): AsyncGenerator<string> {
  const res = await (opts.fetch ?? fetch)(CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
      temperature: 0.6,
      max_tokens: opts.maxTokens ?? 300,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new LlmError(`LLM request failed (${res.status}): ${detail}`, res.status);
  }
  for await (const data of sseData(res.body)) {
    if (data === "[DONE]") return;
    let parsed: { choices?: { delta?: { content?: string | null } }[] };
    try {
      parsed = JSON.parse(data);
    } catch {
      continue;
    }
    const delta = parsed.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}
