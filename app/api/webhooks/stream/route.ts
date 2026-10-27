import { NextRequest, NextResponse } from 'next/server';
import { incomingSecretValid } from '@/lib/webhooks';
import { setLiveFromHint } from '@/lib/twitch-live';
import { limitWebhook } from '@/lib/rate-limit';

// Mix It Up's Stream Start / Stream End events. Body: { secret, event: 'live' | 'offline' } (the incoming secret). Marks the stream
// live or offline straight away instead of waiting for Twitch's API, which lags by a minute or two.
export async function POST(req: NextRequest) {
  const limited = await limitWebhook(req);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!(await incomingSecretValid(body.secret, new URL(req.url).pathname))) return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  if (body.event !== 'live' && body.event !== 'offline') return NextResponse.json({ error: "event must be 'live' or 'offline'" }, { status: 400 });
  const status = await setLiveFromHint(body.event === 'live');
  return NextResponse.json({ ok: true, live: status.live, message: status.live ? 'The stream is live.' : 'The stream is offline.' });
}
