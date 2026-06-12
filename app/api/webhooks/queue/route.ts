import { NextResponse } from 'next/server';
import { dequeueEvent } from '@/lib/webhooks';

export const dynamic = 'force-dynamic';

// Widget polls this every 2s to pick up incoming webhook-triggered events.
// Returns the next queued event (or null), consuming it atomically.
export async function GET() {
  const event = await dequeueEvent();
  return NextResponse.json(event ?? null);
}
