import { NextResponse } from 'next/server';
import { dequeueEvent } from '@/lib/webhooks';
import { isOverlayRequest } from '@/lib/overlay-key';
import { limitWebhook } from '@/lib/rate-limit';

// Widget polls this every 2s to pick up incoming webhook-triggered events.
// Returns the next queued event (or null), consuming it atomically.
export async function GET(req: Request) {
  // Only the overlay may take a queued pull (it carries the overlay key); anyone else would make the viewer's pull vanish.
  // Only wrong callers are counted: the overlay's own poll (every 2s per browser source) costs no rate-limit KV command.
  if (!(await isOverlayRequest(req))) return (await limitWebhook(req)) ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const event = await dequeueEvent();
  return NextResponse.json(event ?? null);
}
