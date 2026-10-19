'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-guard';
import { activateWithWrapUp } from '@/lib/season-wrap';
import {
  getPack, savePack, deletePack,
  getSeason, saveSeason, deleteSeason, listSeasons,
} from '@/lib/kv';
import type { Season } from '@/lib/types';
import { notifyAdminLog } from '@/lib/discord';
import { currentStaffLogin } from '@/lib/staff-actor';
import { validateSeason, type Issue } from '@/lib/draft-validation';
import { int, str, type PackInput } from '@/lib/pack-clean';
import { createDraftPackCore, publishPackCore } from '@/lib/pack-save';

// Server actions behind pack drafts and the season wizard.
// Every action checks the caller itself (requireAdmin): a server action is a public POST endpoint, so the middleware on the page is not enough. scripts/check-staff-guards.mts fails if one is missing.

// ── Packs ─────────────────────────────────────────────────

export type { PackInput };

/** Creates a draft pack and returns its id so the caller can open the pack workspace on it. */
export async function createDraftPack(input: Partial<PackInput> | string): Promise<{ id: string }> {
  await requireAdmin();
  return createDraftPackCore(input);
}

/** Publishes a draft once it passes validation. `active` = include in draws straight away. */
export async function publishPack(id: string, active: boolean): Promise<{ ok: true } | { ok: false; issues: Issue[] }> {
  await requireAdmin();
  const r = await publishPackCore(id, active);
  if (!r.ok) return r;
  await notifyAdminLog({ action: 'Pack published', subject: r.pack.name, detail: active ? 'In draws straight away' : 'Not in draws yet', by: await currentStaffLogin() });
  revalidatePath('/admin/packs');
  revalidatePath(`/admin/packs/${id}`);
  revalidatePath('/admin');
  return { ok: true };
}

/** Turns a published pack back into a draft (it stops being drawn). */
export async function unpublishPack(id: string): Promise<void> {
  await requireAdmin();
  const pack = await getPack(id);
  if (!pack) return;
  await savePack({ ...pack, status: 'draft' });
  revalidatePath('/admin/packs');
  revalidatePath(`/admin/packs/${id}`);
  revalidatePath('/admin');
}

export async function discardDraftPack(id: string): Promise<void> {
  await requireAdmin();
  const pack = await getPack(id);
  if (!pack || pack.status !== 'draft') return;
  await deletePack(id);
  revalidatePath('/admin/packs');
}

// ── Seasons ───────────────────────────────────────────────

export interface SeasonInput {
  name: string;
  collectionName: string;
  maxConcurrentPacks: number;
  packIds: string[];
  /** Optional schedule in ms since the epoch (undefined = none). */
  startsAt?: number;
  endsAt?: number;
  autoStart?: boolean;
}

function cleanSeasonInput(i: SeasonInput): Omit<Season, 'id' | 'createdAt' | 'status' | 'active'> {
  return {
    name: str(i.name, 80).trim(),
    collectionName: str(i.collectionName, 60).replace(/\s+/g, ''),
    maxConcurrentPacks: int(i.maxConcurrentPacks, 1),
    packIds: Array.isArray(i.packIds) ? [...new Set(i.packIds.filter(p => typeof p === 'string'))] : [],
    startsAt: Number.isFinite(i.startsAt) && (i.startsAt as number) > 0 ? Math.floor(i.startsAt as number) : undefined,
    endsAt: Number.isFinite(i.endsAt) && (i.endsAt as number) > 0 ? Math.floor(i.endsAt as number) : undefined,
    autoStart: i.autoStart === true && Number.isFinite(i.startsAt) ? true : undefined,
  };
}

export async function createDraftSeason(input: SeasonInput): Promise<{ id: string }> {
  await requireAdmin();
  const id = crypto.randomUUID();
  await saveSeason({ id, createdAt: Date.now(), status: 'draft', active: false, ...cleanSeasonInput(input) });
  return { id };
}

export async function saveDraftSeason(id: string, input: SeasonInput): Promise<void> {
  await requireAdmin();
  const existing = await getSeason(id);
  if (!existing) throw new Error('This draft no longer exists.');
  if (existing.status !== 'draft') throw new Error('This season has already been published.');
  await saveSeason({ ...existing, ...cleanSeasonInput(input) });
}

/** Publishes a draft season; `activate` also makes it the active one (deactivating the rest). */
export async function publishSeason(id: string, activate: boolean): Promise<{ ok: true } | { ok: false; issues: Issue[] }> {
  await requireAdmin();
  const season = await getSeason(id);
  if (!season) return { ok: false, issues: [{ step: 'details', message: 'This draft no longer exists.' }] };
  const others = (await listSeasons()).filter(s => s.id !== id).map(s => s.collectionName);
  const issues = validateSeason(season, others);
  if (issues.length > 0) return { ok: false, issues };

  await saveSeason({ ...season, status: 'published', active: false });
  if (activate) await activateWithWrapUp(id); // wraps up the season it replaces
  await notifyAdminLog({ action: activate ? 'Season published and activated' : 'Season published', subject: season.name, by: await currentStaffLogin() });
  revalidatePath('/admin/seasons');
  revalidatePath(`/admin/seasons/${id}`);
  revalidatePath('/admin');
  return { ok: true };
}

/**
 * Takes a published season back to a draft. It stops being the active season (the overlay and Twitch panel see "no
 * active season" until another is activated) and disappears from the public site. Nothing is deleted: viewers'
 * collections, the season's packs and its settings are all kept, and it can be edited and published again from
 * /admin/seasons/new?draft=<id>.
 */
export async function unpublishSeason(id: string): Promise<void> {
  await requireAdmin();
  const season = await getSeason(id);
  if (!season || season.status === 'draft') return;
  await saveSeason({ ...season, status: 'draft', active: false });
  revalidatePath('/admin/seasons');
  revalidatePath(`/admin/seasons/${id}`);
  revalidatePath('/admin');
}

export async function discardDraftSeason(id: string): Promise<void> {
  await requireAdmin();
  const season = await getSeason(id);
  if (!season || season.status !== 'draft') return;
  let error: string | null = null;
  try {
    await deleteSeason(id);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Could not discard that draft.';
  }
  revalidatePath('/admin/seasons');
  if (error) redirect(`/admin/seasons?error=${encodeURIComponent(error)}`);
}
