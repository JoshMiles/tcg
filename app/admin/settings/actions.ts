'use server';
import { requireAdmin } from '@/lib/admin-guard';
import { redirect } from 'next/navigation';
import { getActiveSeason, getCollection, getPackCards, getPacksForSeason, getSeason, withCollectionLock } from '@/lib/kv';
import { backfillSerials, loadSerialIndex } from '@/lib/serials';
import { getScoringSettings } from '@/lib/scoring';
import { previewScoring, type ScoringPreview } from '@/lib/scoring-preview';
import { getHiddenUsers } from '@/lib/user-admin';
import { runBackup } from '@/lib/backup';
import { PREVIEW_ID, isPreview } from '@/lib/db';
import { seedPreviewFromProduction, wipeKeys } from '@/lib/sandbox';

/**
 * What the scoring numbers currently typed in the form would do to the active season, next to what is saved. Read-only:
 * nothing is stored. Values are clamped exactly as saving would clamp them.
 */
export async function previewScoringAction(raw: Record<string, string>): Promise<{ ok: true; season: string; preview: ScoringPreview } | { ok: false; message: string }> {
  await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return { ok: false, message: 'There is no active season to preview against.' };
  // The same packs and viewers the real leaderboard uses (getSeasonLeaderboard), so the "saved" side matches what viewers see.
  const [saved, collection, hidden, packList, serials] = await Promise.all([getScoringSettings(), getCollection(season.collectionName), getHiddenUsers().catch(() => new Set<string>()), getPacksForSeason(season), loadSerialIndex(season.collectionName)]);
  const packs = await Promise.all(packList.filter(p => p.status !== 'draft').map(async pack => ({ pack, cards: await getPackCards(pack.id) }))); // drafts are never drawn, as in the leaderboard
  return { ok: true, season: season.name, preview: previewScoring(packs, collection, saved, raw, hidden, serials) };
}

/** Numbers the copies that already exist in one season's collection and switches serial tracking on for it. Safe to repeat. */
export async function backfillSerialsAction(seasonId: string): Promise<void> {
  await requireAdmin();
  const season = await getSeason(seasonId);
  if (!season) redirect('/admin/settings?tab=viewers');
  // Under the collection lock, so a pull can't land between reading the collection and switching tracking on.
  await withCollectionLock(season.collectionName, async () => {
    await backfillSerials(season.collectionName, await getCollection(season.collectionName));
  });
  redirect('/admin/settings?tab=viewers&saved=serials');
}

/** Preview deployments only: copies the live setup into the preview's own namespace (reads production, writes `sbx:preview:*`). */
export async function seedPreviewAction(formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isPreview()) redirect('/admin/settings?tab=environment');
  await seedPreviewFromProduction(formData.get('withCollections') === 'on');
  redirect('/admin/settings?tab=environment&saved=preview-seeded');
}

/** Preview deployments only: deletes everything in the preview's namespace. */
export async function wipePreviewAction(): Promise<void> {
  await requireAdmin();
  if (!isPreview()) redirect('/admin/settings?tab=environment');
  await wipeKeys(PREVIEW_ID);
  redirect('/admin/settings?tab=environment&saved=preview-wiped');
}

/** Takes a backup now (production only; the nightly cron does the same). */
export async function backupNowAction(): Promise<void> {
  await requireAdmin();
  let target = '/admin/settings?tab=environment&saved=backup';
  try {
    await runBackup();
  } catch (e) {
    target = `/admin/settings?tab=environment&backupError=${encodeURIComponent(e instanceof Error ? e.message : 'Backup failed.')}`;
  }
  redirect(target);
}
