import { NextRequest, NextResponse } from 'next/server';
import { acceptTrade, cancelTrade, counterTrade, declineTrade } from '@/lib/trades';
import { requireViewer, respond } from '@/lib/trade-api';
import { buildSwap } from '@/lib/trade-notify';
import { captchaGate } from '@/lib/captcha-server';
import { NextResponse as Res } from 'next/server';

export const dynamic = 'force-dynamic';

// Answer an offer: accept, decline (offers made to you), cancel (your own), or counter (offers made to you).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
        const result = await acceptTrade(id, user);
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
