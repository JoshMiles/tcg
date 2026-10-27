import { NextRequest, NextResponse } from 'next/server';
import { parseIncomingWebhook } from '@/lib/webhooks';
import { liveGate } from '@/lib/overlay-settings';
import { queuePull } from '@/lib/pull-queue';

export async function POST(req: NextRequest) {
  const parsed = await parseIncomingWebhook(req);
  if (!parsed.ok) return parsed.response;

  // Admin can restrict this to when the stream is live (Settings → OBS Overlay).
  const blocked = await liveGate('pull');
  if (blocked) return NextResponse.json({ ok: true, ignored: true, reason: blocked });

  // The rest is shared with "Simulate a chat pull" on the Mix It Up page (lib/pull-queue.ts).
  return NextResponse.json(await queuePull(parsed.username, { role: parsed.body.role }));
}
