import { NextRequest, NextResponse } from 'next/server';
import { parseIncomingWebhook } from '@/lib/webhooks';
import { liveGate } from '@/lib/overlay-settings';
import { queueShowOff } from '@/lib/staff-actions';

// "Show off a card" from a chat command. Body: { secret, username, card? } where `card` is whatever the viewer typed after the command
// ("shiny gouda goat", "#12", or nothing for their best card). The reply always carries a `message` the bot can say back in chat; the
// request answers 200 even when the viewer asked for something they do not own (ok: false), so bots that only read 2xx bodies still work.
export async function POST(req: NextRequest) {
  const parsed = await parseIncomingWebhook(req);
  if (!parsed.ok) return parsed.response;

  // Treated like the collection view: the admin can ignore it unless the stream is live (Settings -> OBS Overlay).
  const blocked = await liveGate('collection');
  if (blocked) return NextResponse.json({ ok: true, ignored: true, reason: blocked, message: '' });

  return NextResponse.json(await queueShowOff(parsed.username, parsed.body.card));
}
