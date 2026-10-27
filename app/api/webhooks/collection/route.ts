import { NextRequest, NextResponse } from 'next/server';
import { enqueueEvent, parseIncomingWebhook } from '@/lib/webhooks';
import { recordActivity } from '@/lib/activity';
import { liveGate } from '@/lib/overlay-settings';

export async function POST(req: NextRequest) {
  const parsed = await parseIncomingWebhook(req);
  if (!parsed.ok) return parsed.response;

  // Admin can restrict this to when the stream is live (Settings → OBS Overlay).
  const blocked = await liveGate('collection');
  if (blocked) return NextResponse.json({ ok: true, ignored: true, reason: blocked, message: '' });

  await enqueueEvent({ id: crypto.randomUUID(), type: 'collection', username: parsed.username, queuedAt: Date.now() });
  await recordActivity({ type: 'trigger', kind: 'collection', username: parsed.username });
  return NextResponse.json({ ok: true, message: `Showing ${parsed.username}'s collection` });
}
