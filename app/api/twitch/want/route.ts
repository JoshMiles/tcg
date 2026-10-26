import { NextRequest, NextResponse } from 'next/server';
import { extensionViewer } from '@/lib/twitch-viewer';
import { setWanted } from '@/lib/wanted';
import { limitTwitch } from '@/lib/rate-limit';

// Put a card on the viewer's Looking for list from the panel, or take it off (the same list as the website's Look for button). The viewer is
// identified by the signed Extension JWT (opaque ID -> linked username), never by the body; setWanted (shared with the website) does the rest.
export async function POST(req: NextRequest) {
  const limited = await limitTwitch(req);
  if (limited) return limited;
  const viewer = await extensionViewer(req);
  if ('response' in viewer) return viewer.response;

  const body = (await req.json().catch(() => ({}))) as { cardNumber?: unknown; on?: unknown };
  if (!Number.isInteger(body.cardNumber) || typeof body.on !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'cardNumber and on are required' }, { status: 400 });
  }

  try {
    const res = await setWanted(viewer.username, body.cardNumber as number, body.on);
    return NextResponse.json(res, { status: res.ok ? 200 : 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Could not change the Looking for list' }, { status: 503 });
  }
}
