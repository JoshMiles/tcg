import { siteClosedResponse } from '@/lib/access';
import { NextRequest, NextResponse } from 'next/server';
import { getActiveSeason } from '@/lib/kv';
import { getSession, isSameOrigin } from '@/lib/session';
import { upgradeCard } from '@/lib/upgrade';
import { captchaGate } from '@/lib/captcha-server';
import { serverError } from '@/lib/trade-api';
import { VARIANTS } from '@/lib/variants';
import type { Variant } from '@/lib/types';

// Upgrade one of the logged-in viewer's own cards on the website. Who they are comes from the signed session cookie,
// never from the request body, so nobody can upgrade someone else's cards.
export async function POST(req: NextRequest) {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Bad origin' }, { status: 403 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Log in with Twitch first.' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { cardNumber?: unknown; from?: unknown; captchaToken?: unknown };
  const blocked = await captchaGate(req, session.username, body);
  if (blocked) return blocked;
  const cardNumber = Number(body.cardNumber);
  const from = String(body.from ?? '') as Variant;
  if (!Number.isInteger(cardNumber) || cardNumber < 1 || !VARIANTS.includes(from)) {
    return NextResponse.json({ error: 'cardNumber and from are required' }, { status: 400 });
  }

  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: 'There is no active season.' }, { status: 400 });

  try {
    const result = await upgradeCard({ seasonId: season.id, username: session.username, cardNumber, from });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (e) {
    return serverError(e, 'account/upgrade', 'The upgrade did not go through just now. Please try again in a moment.');
  }
}
