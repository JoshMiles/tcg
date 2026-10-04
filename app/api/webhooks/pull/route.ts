import { NextRequest, NextResponse } from 'next/server';
import { enqueueEvent, parseIncomingWebhook } from '@/lib/webhooks';
import { recordActivity } from '@/lib/activity';

export async function POST(req: NextRequest) {
  const parsed = await parseIncomingWebhook(req);
  if (!parsed.ok) return parsed.response;

  await enqueueEvent({ id: crypto.randomUUID(), type: 'pull', username: parsed.username, queuedAt: Date.now() });
  await recordActivity({ type: 'trigger', kind: 'pull', username: parsed.username });
  return NextResponse.json({ ok: true });
}
