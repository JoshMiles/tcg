// What an uploaded file really is, read from its first bytes, so the stored type and name never rest on what the browser claimed.

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** The MIME type and file extension the bytes show, or null when they match none of the types the admin upload allows. */
export function sniffUpload(b: Uint8Array): { type: string; ext: string } | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return { type: 'image/png', ext: 'png' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (ascii(b, 0, 4) === 'GIF8') return { type: 'image/gif', ext: 'gif' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE') return { type: 'audio/wav', ext: 'wav' };
  if (ascii(b, 0, 4) === 'OggS') return { type: 'audio/ogg', ext: 'ogg' };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { type: 'audio/webm', ext: 'webm' };
  if (ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { type: 'audio/mpeg', ext: 'mp3' };
  return null;
}
