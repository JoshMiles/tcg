import { NextRequest, NextResponse } from 'next/server';
import { getWebhookSettings, fireOutgoing } from '@/lib/webhooks';
import { recordActivity } from '@/lib/activity';
import { isOverlayRequest } from '@/lib/overlay-key';
import { limitWebhook } from '@/lib/rate-limit';

// Called by the OBS widget when a collection is shown, so the server
// can fire the configured outgoing webhook.
export async function POST(req: NextRequest) {
  const limited = await limitWebhook(req);
  if (limited) return limited;
  if (!(await isOverlayRequest(req))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { event, username } = await req.json().catch(() => ({})) as {
    event?: string;
    username?: string;
  };

  if (event === 'collectionShown') {
    await recordActivity({ type: 'collection_shown', username: String(username ?? '').slice(0, 40) });
    const settings = await getWebhookSettings();
    await fireOutgoing(settings.outgoing.collectionShown, {
      username: username ?? '',
    }, 'collectionShown');
  }

  return NextResponse.json({ ok: true });
}
