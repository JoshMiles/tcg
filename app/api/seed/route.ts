import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { saveSeason, savePack, savePackCards, listSeasonIds } from '@/lib/kv';
import { SEED_SEASON, SEED_PACK, SEED_CARDS } from '@/lib/seed';

export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ids = await listSeasonIds();
  if (ids.includes('season1')) {
    return NextResponse.json({ error: 'Season 1 already seeded' }, { status: 409 });
  }
  await saveSeason(SEED_SEASON);
  await savePack(SEED_PACK);
  await savePackCards('pack1', SEED_CARDS);
  return NextResponse.json({ ok: true, message: 'Season 1 seeded successfully' });
}
