// Browser-side sound optimiser: decodes any audio the browser can play and re-encodes it as a smaller MP3. Client only (Web Audio).
// Done in the browser because the serverless functions have no audio encoder, and sounds are short: it takes a moment.
// The encoder library is loaded on demand so it never weighs down the rest of the admin.

export interface Mp3Options {
  /** Constant bitrate in kbit/s. */
  kbps: number;
  /** Mix down to one channel (half the size; fine for effects). */
  mono: boolean;
}

export const DEFAULT_MP3: Mp3Options = { kbps: 96, mono: true };
export const BITRATES = [64, 96, 128, 160] as const;

/** The sample rate every sound is brought to (MP3 supports it and every browser decodes straight to it). */
const RATE = 44100;
const CHUNK = 1152;

export interface Mp3Result { blob: Blob; bytes: number; seconds: number; channels: 1 | 2 }

/** A new file must be at least this much smaller (as a share of the original) to be worth swapping in. */
export const WORTH_IT = 0.15;

const toInt16 = (f: Float32Array): Int16Array => {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};

/** Decodes `data` and encodes it as MP3. Throws a readable Error if the browser can't decode the file. */
export async function encodeMp3(data: ArrayBuffer, opts: Mp3Options = DEFAULT_MP3): Promise<Mp3Result> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const Ctx: typeof AudioContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx({ sampleRate: RATE });
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(data.slice(0)); // slice: decoding detaches the buffer, and the caller may want its size
  } catch {
    throw new Error('This browser could not read that audio file.');
  } finally {
    ctx.close().catch(() => { /* already closed */ });
  }

  const channels: 1 | 2 = opts.mono || audio.numberOfChannels < 2 ? 1 : 2;
  const left = audio.getChannelData(0);
  const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : left;
  const mixed = channels === 1 && audio.numberOfChannels > 1 ? left.map((v, i) => (v + right[i]) / 2) : left;

  const enc = new Mp3Encoder(channels, audio.sampleRate, opts.kbps);
  const l = toInt16(mixed);
  const r = channels === 2 ? toInt16(right) : null;
  const parts: Uint8Array[] = [];
  for (let i = 0; i < l.length; i += CHUNK) {
    const chunk = channels === 2 && r ? enc.encodeBuffer(l.subarray(i, i + CHUNK), r.subarray(i, i + CHUNK)) : enc.encodeBuffer(l.subarray(i, i + CHUNK));
    if (chunk.length) parts.push(chunk);
  }
  const tail = enc.flush();
  if (tail.length) parts.push(tail);
  const blob = new Blob(parts as BlobPart[], { type: 'audio/mpeg' });
  return { blob, bytes: blob.size, seconds: audio.duration, channels };
}
