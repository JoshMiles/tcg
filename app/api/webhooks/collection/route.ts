import { NextRequest, NextResponse } from 'next/server';
import { enqueueEvent, parseIncomingWebhook } from '@/lib/webhooks';

export async function POST(req: NextRequest) {
  const parsed = await parseIncomingWebhook(req);
  if (!parsed.ok) return parsed.response;

  await enqueueEvent({ id: crypto.randomUUID(), type: 'collection', username: parsed.username, queuedAt: Date.now() });
  return NextResponse.json({ ok: true });
}
