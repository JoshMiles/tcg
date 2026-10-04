import { NextRequest, NextResponse } from 'next/server';
import { getWebhookSettings, fireOutgoing } from '@/lib/webhooks';
import { recordActivity } from '@/lib/activity';

// Called by the OBS widget when a collection is shown, so the server
// can fire the configured outgoing webhook.
export async function POST(req: NextRequest) {
  const { event, username } = await req.json().catch(() => ({})) as {
    event?: string;
    username?: string;
  };

  if (event === 'collectionShown') {
    await recordActivity({ type: 'collection_shown', username: String(username ?? '').slice(0, 40) });
    const settings = await getWebhookSettings();
    await fireOutgoing(settings.outgoing.collectionShown, {
      username: username ?? '',
    });
  }

  return NextResponse.json({ ok: true });
}
