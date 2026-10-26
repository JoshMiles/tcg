import { NextRequest, NextResponse } from 'next/server';
import { getTwitchOpaqueUser } from '@/lib/kv';
import { verifyExtensionAuth, getBearerToken } from '@/lib/twitch-jwt';
import { upgradeCard } from '@/lib/upgrade';
import { VARIANTS } from '@/lib/variants';
import type { Variant } from '@/lib/types';
import { limitTwitch } from '@/lib/rate-limit';

const DEV_OPAQUE_ID = 'dev_mock_opaque';

// Spend duplicates of one card variant for the next variant up. The viewer is identified by the signed
// Extension JWT (opaque ID → linked username), never by anything in the body.
export async function POST(req: NextRequest) {
  const limited = await limitTwitch(req);
  if (limited) return limited;
  const token = getBearerToken(req);
  if (!token) return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });

  const payload = await verifyExtensionAuth(token);
  const devMode = !payload && !process.env.TWITCH_EXTENSION_SECRET;
  if (!payload && !devMode) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });

  const username = await getTwitchOpaqueUser(payload?.opaque_user_id ?? DEV_OPAQUE_ID);
  if (!username) return NextResponse.json({ error: 'Log in first.' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { seasonId?: unknown; cardNumber?: unknown; from?: unknown };
  const cardNumber = Number(body.cardNumber);
  const from = String(body.from ?? '') as Variant;
  if (typeof body.seasonId !== 'string' || !Number.isInteger(cardNumber) || cardNumber < 1 || !VARIANTS.includes(from)) {
    return NextResponse.json({ error: 'seasonId, cardNumber and from are required' }, { status: 400 });
  }

  try {
    const result = await upgradeCard({ seasonId: body.seasonId, username, cardNumber, from });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Upgrade failed' }, { status: 503 });
  }
}
