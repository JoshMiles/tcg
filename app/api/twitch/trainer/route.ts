import { NextRequest, NextResponse } from 'next/server';
import { extensionViewer } from '@/lib/twitch-viewer';
import { useTrainerCard } from '@/lib/buffs';

// Use a trainer card: spends one Regular edition and starts its buff. The viewer is identified by the signed Extension JWT
// (opaque ID -> linked username), never by anything in the body; every rule lives in useTrainerCard (the website uses it too).
export async function POST(req: NextRequest) {
  const viewer = await extensionViewer(req);
  if ('response' in viewer) return viewer.response;

  const body = (await req.json().catch(() => ({}))) as { cardNumber?: unknown; seasonId?: unknown };
  const cardNumber = Number(body.cardNumber);
  if (!Number.isInteger(cardNumber) || cardNumber < 1 || (body.seasonId !== undefined && typeof body.seasonId !== 'string')) {
    return NextResponse.json({ error: 'cardNumber is required' }, { status: 400 });
  }

  try {
    const res = await useTrainerCard(viewer.username, cardNumber, body.seasonId);
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
    return NextResponse.json({ ok: true, message: res.message });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Could not use the trainer card' }, { status: 503 });
  }
}
