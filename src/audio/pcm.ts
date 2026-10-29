export function rms(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

/** Box-filter downsampling to `toRate` and conversion to 16-bit PCM. */
export function toPcm16(input: Float32Array, fromRate: number, toRate = 16_000): Int16Array {
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j] ?? 0;
    const v = Math.max(-1, Math.min(1, sum / (end - start)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

export function concatFloat32(chunks: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Decodes base64 little-endian PCM16 into float samples in [-1, 1]. */
export function base64Pcm16ToFloat32(b64: string): Float32Array<ArrayBuffer> {
  const binary = atob(b64);
  const view = new DataView(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) view.setUint8(i, binary.charCodeAt(i));
  const out = new Float32Array(Math.floor(binary.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}
