import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Shared pieces for the generated share images (next/og). The brand icon is read from disk when it can be (local, build) and
// fetched from the site otherwise; if neither works the image simply has no icon rather than failing.

export const OG_SIZE = { width: 1200, height: 630 };

export async function brandIconDataUri(): Promise<string | null> {
  try {
    const buf = await readFile(join(process.cwd(), 'public', 'brand', 'icon.png'));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch { /* not bundled with the function: try the network */ }
  try {
    const { SITE_URL } = await import('./site');
    const res = await fetch(`${SITE_URL}/brand/icon.png`);
    if (!res.ok) return null;
    return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  } catch { return null; }
}

export const OG_BG = 'linear-gradient(135deg, #0a0f1e 0%, #141a33 55%, #2a1f08 100%)';
