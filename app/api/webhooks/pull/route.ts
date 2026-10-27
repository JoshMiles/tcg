import { NextRequest, NextResponse } from 'next/server';
import { parseIncomingWebhook } from '@/lib/webhooks';
import { liveGate } from '@/lib/overlay-settings';
import { queuePull } from '@/lib/pull-queue';
import { answerOnce } from '@/lib/webhook-reply';

export async function POST(req: NextRequest) {
  const parsed = await parseIncomingWebhook(req);
  if (!parsed.ok) return parsed.response;

  // Admin can restrict this to when the stream is live (Settings → OBS Overlay).
  const blocked = await liveGate('pull');
  if (blocked) return NextResponse.json({ ok: true, ignored: true, reason: blocked, message: '' });

  // The rest is shared with "Simulate a chat pull" on the Mix It Up page (lib/pull-queue.ts).
  // An optional requestId makes a retry safe: the first answer is replayed and no second pack is queued (ROADMAP 55.3).
  return answerOnce('/api/webhooks/pull', parsed.username, parsed.body.requestId, async () => NextResponse.json(await queuePull(parsed.username, { role: parsed.body.role })));
}
