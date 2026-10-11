import { NextRequest, NextResponse } from 'next/server';
import { getActiveSeason } from '@/lib/kv';
import { createTrade } from '@/lib/trades';
import { requireViewer, respond } from '@/lib/trade-api';

export const dynamic = 'force-dynamic';

// Make an offer: direct (to one viewer) or a listing on the open board. The copies offered are taken into escrow immediately.
export async function POST(req: NextRequest) {
  const viewer = await requireViewer(req);
  if ('response' in viewer) return viewer.response;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
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
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not make the offer' }, { status: 503 });
  }
}
