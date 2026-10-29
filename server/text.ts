/**
 * Splits streamed LLM text into sentences so speech synthesis can start before the whole
 * reply is generated. Very short fragments are merged to avoid many tiny TTS calls.
 */
export class SentenceChunker {
  private buffer = "";
  private readonly minLength: number;

  constructor(minLength = 24) {
    this.minLength = minLength;
  }

  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    // Sentence end: . ! ? … (optionally followed by closing quotes/brackets) then whitespace.
    const boundary = /[.!?…]+["')\]»]*\s+|\n+/g;
    let start = 0;
    let match: RegExpExecArray | null;
    while ((match = boundary.exec(this.buffer))) {
      const end = match.index + match[0].length;
      const sentence = this.buffer.slice(start, end).trim();
      if (sentence.length >= this.minLength) {
        out.push(sentence);
        start = end;
      }
    }
    this.buffer = this.buffer.slice(start);
    return out;
  }

  flush(): string | null {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest || null;
  }
}

/** Removes markup and symbols that TTS would read aloud or mispronounce. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_#>~|]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
