import { NextRequest, NextResponse } from 'next/server';
import { getActiveSeason } from '@/lib/kv';
import { getSession, isSameOrigin } from '@/lib/session';
import { upgradeCard } from '@/lib/upgrade';
import { VARIANTS } from '@/lib/variants';
import type { Variant } from '@/lib/types';

export const dynamic = 'force-dynamic';

// Upgrade one of the logged-in viewer's own cards on the website. Who they are comes from the signed session cookie,
// never from the request body, so nobody can upgrade someone else's cards.
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'Bad origin' }, { status: 403 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Log in with Twitch first.' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { cardNumber?: unknown; from?: unknown };
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
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upgrade failed' }, { status: 503 });
  }
}
