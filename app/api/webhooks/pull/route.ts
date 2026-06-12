import { NextRequest, NextResponse } from 'next/server';
import { getWebhookSettings, enqueueEvent } from '@/lib/webhooks';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { username, secret } = body as { username?: string; secret?: string };

  const settings = await getWebhookSettings();
  if (!secret || secret !== settings.incomingSecret) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  }

  const user = username?.toLowerCase().trim();
  if (!user) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  await enqueueEvent({ id: crypto.randomUUID(), type: 'pull', username: user, queuedAt: Date.now() });
  return NextResponse.json({ ok: true });
}
