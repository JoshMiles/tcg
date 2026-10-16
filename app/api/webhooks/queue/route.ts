import { NextResponse } from 'next/server';
import { dequeueEvent } from '@/lib/webhooks';
import { isOverlayRequest } from '@/lib/overlay-key';

export const dynamic = 'force-dynamic';

// Widget polls this every 2s to pick up incoming webhook-triggered events.
// Returns the next queued event (or null), consuming it atomically.
export async function GET(req: Request) {
  // Only the overlay may take a queued pull (it carries the overlay key); anyone else would make the viewer's pull vanish.
  if (!(await isOverlayRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const event = await dequeueEvent();
  return NextResponse.json(event ?? null);
}
