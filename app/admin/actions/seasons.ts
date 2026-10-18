'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-guard';
import { notifyAdminLog } from '@/lib/discord';
import { currentStaffLogin } from '@/lib/staff-actor';
import { activateWithWrapUp } from '@/lib/season-wrap';
import { validateSeason } from '@/lib/draft-validation';
import { saveSeason, getSeason, deleteSeason, listSeasons, seedSeason1 as seedSeason1Data } from '@/lib/kv';

// ── Seasons ───────────────────────────────────────────────

/** A finite positive number from a form field (a date as milliseconds), or undefined. */
const num = (v: FormDataEntryValue | null): number | undefined => {
  const n = Number(v);
  return v !== null && String(v).trim() !== '' && Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
};

export async function updateSeason(id: string, formData: FormData) {
  await requireAdmin();
  const existing = await getSeason(id);
  if (!existing) return;

  const wantsActive = formData.get('active') === 'true' && existing.status === 'published';
  // Switching a different season on goes through activateWithWrapUp (below) so the one it replaces gets its final standings.
  const willBeActive = wantsActive && existing.active;

  // The same checks the wizard makes, again on the server (a form can be posted without the browser's own checks): a name, a
  // collection name with no spaces that no other season uses (a clash would merge two seasons' viewer collections), a sane end date.
  const name = String(formData.get('name') ?? '').trim();
  const collectionName = String(formData.get('collectionName') ?? '').replace(/\s+/g, '');
  const startsAt = num(formData.get('startsAt'));
  const endsAt = num(formData.get('endsAt'));
  const others = (await listSeasons()).filter(x => x.id !== id).map(x => x.collectionName);
  const problems = validateSeason({ name, collectionName, packIds: existing.packIds, startsAt, endsAt }, others).filter(i => i.step !== 'packs');
  if (problems.length > 0) redirect(`/admin/seasons/${id}?tab=settings&error=${encodeURIComponent(problems.map(p => p.message).join(' '))}`);
  const maxConcurrentPacks = Math.max(1, Math.floor(Number(formData.get('maxConcurrentPacks'))) || 1);

  await saveSeason({
    ...existing,
    name,
    collectionName,
    active: willBeActive,
    maxConcurrentPacks,
    startsAt,
    endsAt,
    autoStart: formData.get('autoStart') === 'true' && startsAt !== undefined ? true : undefined,
  });
  if (wantsActive && !existing.active) await activateWithWrapUp(id);

  revalidatePath(`/admin/seasons/${id}`);
  revalidatePath('/admin/seasons');
  revalidatePath('/admin');
}

export async function activateSeason(id: string) {
  // Wraps up the season it replaces (final standings snapshot, ended, trading frozen) before switching.
  await requireAdmin();
  await activateWithWrapUp(id);
  await notifyAdminLog({ action: 'Season activated', subject: (await getSeason(id))?.name ?? id, detail: 'The season it replaced was wrapped up', by: await currentStaffLogin() });
  revalidatePath('/admin/seasons');
  revalidatePath(`/admin/seasons/${id}`);
  revalidatePath('/admin');
}

export async function deleteSeasonAction(id: string) {
  await requireAdmin();
  await deleteSeason(id);
  revalidatePath('/admin/seasons');
  redirect('/admin/seasons');
}

// ── Season ↔ Pack assignment ──────────────────────────────

export async function addPackToSeason(seasonId: string, formData: FormData) {
  await requireAdmin();
  const packId = formData.get('packId') as string;
  if (!packId) return;
  const season = await getSeason(seasonId);
  if (!season || season.packIds.includes(packId)) return;
  await saveSeason({ ...season, packIds: [...season.packIds, packId] });
  revalidatePath(`/admin/seasons/${seasonId}`);
}

export async function removePackFromSeason(seasonId: string, packId: string) {
  await requireAdmin();
  const season = await getSeason(seasonId);
  if (!season) return;
  await saveSeason({ ...season, packIds: season.packIds.filter(id => id !== packId) });
  revalidatePath(`/admin/seasons/${seasonId}`);
}

// ── Seed ──────────────────────────────────────────────────

export async function seedSeason1() {
  await requireAdmin();
  await seedSeason1Data();
  revalidatePath('/admin');
  revalidatePath('/admin/packs');
  revalidatePath('/admin/seasons');
}
