import { NextResponse } from 'next/server';
import { bridgeStaffGuard } from '@/lib/bridge';
import { staffRefusal } from '@/lib/bridge-core';
import { rateLimit } from '@/lib/rate-limit';
import { recordTwitchEvent } from '@/lib/twitch-events';
import { EVENT_BODY_MAX, cleanTwitchEvent } from '@/lib/twitch-events-core';

// One Twitch EventSub notification from TCG Bridge's WebSocket (ROADMAP 58.2): `{ messageId, type, event }`. The site records it (a short recent list)
// and feeds stream.online / stream.offline into the live state; it awards nothing (58.3 onwards). Admin PCs only, like twitch-token; a repeated
// message id is dropped for 10 minutes. 120 calls a minute per PC.
export async function POST(req: Request) {
  const g = await bridgeStaffGuard(req);
  if (!g.ok) return g.response;
  const refused = staffRefusal(g.pc, 'twitch-event');
  if (refused) return NextResponse.json({ error: refused }, { status: 403 });
  if (!(await rateLimit('bridge-twitch-event', g.hash, 120, 60).catch(() => true))) {
    return NextResponse.json({ error: 'Too many events. Wait a minute.' }, { status: 429, headers: { 'Retry-After': '60' } });
  }
  const text = await req.text().catch(() => '');
  if (!text || text.length > EVENT_BODY_MAX) return NextResponse.json({ error: 'Send a Twitch event of at most 16 KB.' }, { status: 400 });
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { raw = null; }
  const e = cleanTwitchEvent(raw);
  if (!e) return NextResponse.json({ error: 'Send { messageId, type, event } with one of the six EventSub types.' }, { status: 400 });
  const r = await recordTwitchEvent(e);
  return NextResponse.json({ ok: true, ...r });
}
