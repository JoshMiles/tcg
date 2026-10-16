import { readFile } from 'fs/promises';
import path from 'path';
import { isFrameSourceUrl } from './card-art';

// Server side of the still-frame picker: reads a card's art (bundled file or Blob) so sharp can cut a frame from it.

const MAX_BYTES = 40 * 1024 * 1024;

/** The art's bytes, or null for a URL the picker may not read or a file that can't be fetched. */
export async function loadFrameSource(url: string): Promise<Buffer | null> {
  if (!isFrameSourceUrl(url)) return null;
  try {
    if (url.startsWith('/')) {
      const root = path.join(process.cwd(), 'public', 'assets', 'cards');
      const file = path.join(root, decodeURIComponent(url.slice('/assets/cards/'.length)));
      if (path.dirname(file) !== root) return null;
      return await readFile(file);
    }
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length <= MAX_BYTES ? buf : null;
  } catch {
    return null;
  }
}
