import { NextRequest, NextResponse } from 'next/server';
import { getWebhookSettings, fireOutgoing } from '@/lib/webhooks';

// Called by the OBS widget when a collection is shown, so the server
// can fire the configured outgoing webhook.
export async function POST(req: NextRequest) {
  const { event, username } = await req.json().catch(() => ({})) as {
    event?: string;
    username?: string;
  };

  if (event === 'collectionShown') {
    const settings = await getWebhookSettings();
    await fireOutgoing(settings.outgoing.collectionShown, {
      username: username ?? '',
    });
  }

  return NextResponse.json({ ok: true });
}
