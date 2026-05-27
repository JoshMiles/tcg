import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { saveSeason, getSeason, savePack, getPack, savePackCards, listSeasonIds, listAllPackIds } from '@/lib/kv';
import { SEED_SEASON, SEED_PACK, SEED_CARDS } from '@/lib/seed';

export async function POST() {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [seasonIds, packIds] = await Promise.all([listSeasonIds(), listAllPackIds()]);

  if (!packIds.includes('pack1')) {
    await savePack(SEED_PACK);
    await savePackCards('pack1', SEED_CARDS);
  }

  if (!seasonIds.includes('season1')) {
    await saveSeason(SEED_SEASON);
  } else {
    const existing = await getSeason('season1');
    if (existing && !existing.packIds.includes('pack1')) {
      await saveSeason({ ...existing, packIds: [...existing.packIds, 'pack1'] });
    }
  }

  return NextResponse.json({ ok: true, message: 'Season 1 seeded' });
}
