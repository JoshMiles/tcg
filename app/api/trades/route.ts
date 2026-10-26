import { siteClosedResponse } from '@/lib/access';
import { NextRequest, NextResponse } from 'next/server';
import { getActiveSeason } from '@/lib/kv';
import { createTrade } from '@/lib/trades';
import { requireViewer, respond, serverError } from '@/lib/trade-api';
import { captchaGate } from '@/lib/captcha-server';

// Make an offer: direct (to one viewer) or a listing on the open board. The copies offered are taken into escrow immediately.
export async function POST(req: NextRequest) {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  const viewer = await requireViewer(req);
  if ('response' in viewer) return viewer.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const blocked = await captchaGate(req, viewer.session.username, body);
  if (blocked) return blocked;
  const kind = body.kind === 'listing' ? 'listing' : body.kind === 'direct' ? 'direct' : null;
  if (!kind) return NextResponse.json({ error: 'kind must be "direct" or "listing"' }, { status: 400 });
  const seasonId = typeof body.seasonId === 'string' ? body.seasonId : (await getActiveSeason())?.id;
  if (!seasonId) return NextResponse.json({ error: 'There is no active season.' }, { status: 400 });

  try {
    return respond(await createTrade({
      seasonId,
      from: viewer.session.username,
      kind,
      to: typeof body.to === 'string' ? body.to : undefined,
      give: body.give,
      get: body.get,
      note: typeof body.note === 'string' ? body.note : undefined,
    }));
  } catch (e) {
    return serverError(e, 'trades', 'We could not make that offer just now. Please try again in a moment.');
  }
}
