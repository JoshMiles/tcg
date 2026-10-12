'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-guard';
import { getPack, getSeason, listSeasons, savePack, saveSeason } from '@/lib/kv';
import { endSeason, reopenSeason } from '@/lib/season-wrap';

/**
 * A copy of a season as a draft: same name + " (copy)", the same packs in the same order, a fresh unique collection name, no dates.
 * Viewer collections are not copied (a new collection starts empty).
 */
export async function duplicateSeasonAction(id: string) {
  await requireAdmin();
  const source = await getSeason(id);
  if (!source) redirect('/admin/seasons');
  const taken = new Set((await listSeasons()).map(s => s.collectionName.toLowerCase()));
  const base = (source.collectionName || 'Season').replace(/\d+$/, '') || 'Season';
  let n = 2;
  while (taken.has(`${base}${n}`.toLowerCase())) n++;
  const newId = crypto.randomUUID();
  await saveSeason({
    id: newId, name: `${source.name} (copy)`.slice(0, 80), collectionName: `${base}${n}`, active: false, status: 'draft',
    createdAt: Date.now(), maxConcurrentPacks: source.maxConcurrentPacks, packIds: [...source.packIds],
  });
  revalidatePath('/admin/seasons');
  redirect(`/admin/seasons/new?draft=${newId}`);
}

/** Wraps a season up: final standings snapshot, awards, ended, and (unless unticked) trading frozen. */
export async function endSeasonAction(id: string, formData: FormData) {
  await requireAdmin();
  await endSeason(id, { freezeTrading: formData.get('freezeTrading') === 'on' });
  revalidatePath('/admin/seasons');
  revalidatePath(`/admin/seasons/${id}`);
  revalidatePath('/admin');
}

export async function reopenSeasonAction(id: string) {
  await requireAdmin();
  await reopenSeason(id);
  revalidatePath('/admin/seasons');
  revalidatePath(`/admin/seasons/${id}`);
}

/** Saves the order of a season's packs. Only ids already in the season are kept; any it lacks stay at the end. */
export async function reorderSeasonPacksAction(seasonId: string, ids: string[]): Promise<void> {
  await requireAdmin();
  const season = await getSeason(seasonId);
  if (!season) return;
  const kept = ids.filter(i => season.packIds.includes(i));
  const rest = season.packIds.filter(i => !kept.includes(i));
  await saveSeason({ ...season, packIds: [...new Set([...kept, ...rest])] });
  revalidatePath(`/admin/seasons/${seasonId}`);
}

/** A pack's draw weight (shared by every season that uses the pack). */
export async function setPackWeightAction(packId: string, weight: number): Promise<void> {
  await requireAdmin();
  const pack = await getPack(packId);
  if (!pack || !Number.isFinite(weight) || weight < 0 || weight > 1000) return;
  await savePack({ ...pack, weight: Math.round(weight * 100) / 100 });
  revalidatePath('/admin/seasons');
  revalidatePath('/admin/packs');
}
