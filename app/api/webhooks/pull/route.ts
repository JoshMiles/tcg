import { NextRequest, NextResponse } from 'next/server';
import { enqueueEvent, parseIncomingWebhook } from '@/lib/webhooks';
import { recordActivity } from '@/lib/activity';
import { liveGate } from '@/lib/overlay-settings';
import { getMixItUpSettings, reservePaidPull } from '@/lib/mixitup';
import { inSandbox } from '@/lib/db';

export async function POST(req: NextRequest) {
  const parsed = await parseIncomingWebhook(req);
  if (!parsed.ok) return parsed.response;

  // Admin can restrict this to when the stream is live (Settings → OBS Overlay).
  const blocked = await liveGate('pull');
  if (blocked) return NextResponse.json({ ok: true, ignored: true, reason: blocked });

  // Paid pulls (Settings → Mix It Up): the viewer's limit and balance are checked first; a refusal queues nothing and says why.
  const id = crypto.randomUUID();
  const mix = await getMixItUpSettings();
  const paid = mix.enabled && !(await inSandbox());
  if (paid) {
    const r = await reservePaidPull(mix, parsed.username, id);
    if (!r.ok) return NextResponse.json({ ok: true, ignored: true, reason: r.reason, message: r.message, ...(r.balance !== undefined ? { balance: r.balance } : {}) });
  }

  await enqueueEvent({ id, type: 'pull', username: parsed.username, queuedAt: Date.now(), ...(paid ? { paid: true } : {}) });
  await recordActivity({ type: 'trigger', kind: 'pull', username: parsed.username });
  return NextResponse.json({ ok: true });
}
