import { NextRequest, NextResponse } from 'next/server';
import { extensionViewer } from '@/lib/twitch-viewer';
import { setFavourite } from '@/lib/favourites';
import { limitTwitch } from '@/lib/rate-limit';
import { recordServerError } from '@/lib/error-spike';

// Favourite an edition from the panel (or take the mark off): a favourite can't be traded or spent in an upgrade. The viewer is identified by
// the signed Extension JWT (opaque ID -> linked username), never by the body; setFavourite (shared with the website's heart) checks the
// edition is really theirs.
export async function POST(req: NextRequest) {
  const limited = await limitTwitch(req);
  if (limited) return limited;
  const viewer = await extensionViewer(req);
  if ('response' in viewer) return viewer.response;

  const body = (await req.json().catch(() => ({}))) as { uid?: unknown; on?: unknown };
  if (!Number.isInteger(body.uid) || typeof body.on !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'uid and on are required' }, { status: 400 });
  }

  try {
    const res = await setFavourite(viewer.username, body.uid as number, body.on);
    if (!res.ok) return NextResponse.json(res, { status: 400 });
    return NextResponse.json(res);
  } catch (e) {
    recordServerError();
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Could not change the favourite' }, { status: 503 });
  }
}
