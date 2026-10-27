import { NextRequest, NextResponse } from 'next/server';
import { parseIncomingWebhook } from '@/lib/webhooks';
import { liveGate } from '@/lib/overlay-settings';
import { queuePull } from '@/lib/pull-queue';
import { answerOnce } from '@/lib/webhook-reply';
import { runEventReward } from '@/lib/event-rewards';

export async function POST(req: NextRequest) {
  const parsed = await parseIncomingWebhook(req);
  if (!parsed.ok) return parsed.response;

  // Admin can restrict this to when the stream is live (Settings → OBS Overlay).
  const blocked = await liveGate('pull');
  if (blocked) return NextResponse.json({ ok: true, ignored: true, reason: blocked, message: '' });

  // A request with `event` is an event reward (gifted subs, bits, a raid, a redeem; ROADMAP 55.4g); one without is a chat !pack.
  // The rest is shared with "Simulate a chat pull" on the Mix It Up page (lib/pull-queue.ts).
  // An optional requestId makes a retry safe: the first answer is replayed and no second pack is queued (ROADMAP 55.3).
  if (parsed.body.event !== undefined) return answerOnce('/api/webhooks/pull', parsed.username, parsed.body.requestId, async () => { const a = await runEventReward(parsed.username, parsed.body); return NextResponse.json(a.body, { status: a.status }); });
  return answerOnce('/api/webhooks/pull', parsed.username, parsed.body.requestId, async () => NextResponse.json(await queuePull(parsed.username, { role: parsed.body.role, pack: parsed.body.pack, chat: true })));
}
