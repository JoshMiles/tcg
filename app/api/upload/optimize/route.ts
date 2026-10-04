import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { storeOptimizedCard, deleteBlobQuietly, isBlobUrl } from '@/lib/card-upload';

export const maxDuration = 60; // encoding a 50-frame GIF takes ~5–15s

// POST { url } — url of a GIF already uploaded to Blob by the browser.
// Fetches it, stores an animated WebP + static thumbnail, deletes the original.
export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  // Only fetch our own Blob store — never an arbitrary URL.
  if (!url || !isBlobUrl(url)) {
    return NextResponse.json({ error: 'url must be a Blob URL' }, { status: 400 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return NextResponse.json({ error: 'Could not read uploaded file' }, { status: 502 });
    const result = await storeOptimizedCard(Buffer.from(await res.arrayBuffer()));
    await deleteBlobQuietly(url);
    return NextResponse.json(result);
  } catch {
    await deleteBlobQuietly(url);
    return NextResponse.json({ error: 'Could not process image — is it a valid GIF?' }, { status: 422 });
  }
}
