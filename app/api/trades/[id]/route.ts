import { siteClosedResponse } from '@/lib/access';
import { NextRequest, NextResponse } from 'next/server';
import { acceptTrade, cancelTrade, counterTrade, declineTrade } from '@/lib/trades';
import { requireViewer, respond } from '@/lib/trade-api';
import { buildSwap } from '@/lib/trade-notify';
import { captchaGate } from '@/lib/captcha-server';
import { NextResponse as Res } from 'next/server';

// Answer an offer: accept, decline (offers made to you), cancel (your own), or counter (offers made to you).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  const viewer = await requireViewer(req);
  if ('response' in viewer) return viewer.response;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const user = viewer.session.username;

  // Taking or countering an offer moves cards, so it needs the check; declining and cancelling only give cards back.
  if (body.action === 'accept' || body.action === 'counter') {
    const blocked = await captchaGate(req, user, body);
    if (blocked) return blocked;
  }

  try {
    switch (body.action) {
      case 'accept': {
        // Optional: the prints the taker picked for what the offer asks, { <collection entry>: [print ids] }. Absent = newest first.
        let getIds: Record<string, string[]> | undefined;
        if (body.getIds !== undefined && body.getIds !== null) {
          const g = body.getIds as unknown;
          const okShape = typeof g === 'object' && !Array.isArray(g) && Object.values(g as object).every(v => Array.isArray(v) && v.every(x => typeof x === 'string'));
          if (!okShape) return NextResponse.json({ error: 'getIds must map each card to a list of edition ids' }, { status: 400 });
          getIds = g as Record<string, string[]>;
        }
        const result = await acceptTrade(id, user, getIds);
        if (!result.ok) return respond(result);
        // What changed hands from the accepter's side, for the trade animation.
        const swap = await buildSwap(result.trade.seasonId, result.trade.get, result.trade.give, result.trade.from);
        return Res.json({ ...result, swap });
      }
      case 'decline': return respond(await declineTrade(id, user));
      case 'cancel': return respond(await cancelTrade(id, user));
      case 'counter': return respond(await counterTrade(id, user, { give: body.give, get: body.get, note: typeof body.note === 'string' ? body.note : undefined }));
      default: return NextResponse.json({ error: 'action must be accept, decline, cancel or counter' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'That did not work' }, { status: 503 });
  }
}
