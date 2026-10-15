'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { activateWithWrapUp } from '@/lib/season-wrap';
import {
  getPack, savePack, deletePack, getPackCards, savePackCards,
  getSeason, saveSeason, deleteSeason, listSeasons, setActiveSeason,
} from '@/lib/kv';
import type { Card, OptionalVariant, Pack, Season, UpgradeCosts, VariantWeights } from '@/lib/types';
import { DEFAULT_UPGRADE_COSTS, DEFAULT_VARIANT_WEIGHTS, cleanDisabled } from '@/lib/variants';
import { validatePack, validateSeason, type Issue } from '@/lib/draft-validation';

// Server actions behind the pack / season wizards. Unlike actions.ts they return data instead of
// redirecting, because the wizards are client components that autosave as you go.
// Every action checks the caller itself (requireAdmin): a server action is a public POST endpoint, so the middleware on the page is not enough. scripts/check-staff-guards.mts fails if one is missing.

// ── Packs ─────────────────────────────────────────────────

export interface PackInput {
  name: string;
  coverImageUrl: string;
  active: boolean;
  weight: number;
  accentColor: string;
  tearBorderColor: string;
  holoMinStars: number;
  cardTime: number;
  cooldownTime: number;
  soundVolume: number;
  upgradesEnabled: boolean;
  variantWeights: VariantWeights;
  upgradeCosts: UpgradeCosts;
  disabledVariants?: OptionalVariant[];
}

const num = (v: unknown, fallback: number, min = 0, max = Infinity) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const int = (v: unknown, fallback: number, min = 1) => Math.max(min, Math.floor(num(v, fallback)));
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : '');

function cleanPackInput(i: PackInput): Omit<Pack, 'id' | 'createdAt' | 'status'> {
  const w = i.variantWeights ?? DEFAULT_VARIANT_WEIGHTS;
  const c = i.upgradeCosts ?? DEFAULT_UPGRADE_COSTS;
  return {
    name: str(i.name, 80).trim(),
    coverImageUrl: str(i.coverImageUrl),
    active: !!i.active,
    weight: num(i.weight, 1, 0.01),
    accentColor: str(i.accentColor, 60) || 'rgb(241,187,6)',
    tearBorderColor: str(i.tearBorderColor, 60) || 'rgb(218,163,18)',
    holoMinStars: int(i.holoMinStars, 5),
    cardTime: num(i.cardTime, 3, 1),
    cooldownTime: num(i.cooldownTime, 1, 0),
    soundVolume: num(i.soundVolume, 1, 0, 1),
    upgradesEnabled: !!i.upgradesEnabled,
    variantWeights: {
      regular: num(w.regular, DEFAULT_VARIANT_WEIGHTS.regular),
      reverse: num(w.reverse, DEFAULT_VARIANT_WEIGHTS.reverse),
      full: num(w.full, DEFAULT_VARIANT_WEIGHTS.full),
      shiny: num(w.shiny, DEFAULT_VARIANT_WEIGHTS.shiny),
    },
    upgradeCosts: {
      reverse: int(c.reverse, DEFAULT_UPGRADE_COSTS.reverse),
      full: int(c.full, DEFAULT_UPGRADE_COSTS.full),
      shiny: int(c.shiny, DEFAULT_UPGRADE_COSTS.shiny),
    },
    disabledVariants: cleanDisabled(i.disabledVariants),
  };
}

/** Creates the draft record the first time the wizard has something worth keeping. */
export async function createDraftPack(input: PackInput): Promise<{ id: string }> {
  await requireAdmin();
  const id = crypto.randomUUID();
  await savePack({ id, createdAt: Date.now(), status: 'draft', ...cleanPackInput(input) });
  // No revalidatePath here or in the autosave actions below: it would re-render the wizard page under the
  // user mid-edit. The list pages are force-dynamic, so they're fresh on every visit anyway.
  return { id };
}

/** Autosave target. Only touches drafts, so a stale wizard tab can't overwrite a live pack. */
export async function saveDraftPack(id: string, input: PackInput): Promise<void> {
  await requireAdmin();
  const existing = await getPack(id);
  if (!existing) throw new Error('This draft no longer exists.');
  if (existing.status !== 'draft') throw new Error('This pack has already been published.');
  await savePack({ ...existing, ...cleanPackInput(input) });
}

export interface CardInput {
  id: string;
  name: string;
  imageUrl: string;
  fullArtImageUrl?: string;
  soundUrl?: string;
  stars: number;
  probability: number;
  upgradesEnabled: boolean;
  disabledVariants?: OptionalVariant[];
}

/**
 * Replaces a pack's cards with the editor's list. Card numbers are what viewers' collections point at, so
 * existing cards always keep theirs; new cards get the next free number. Returns the saved cards so the
 * editor can show the assigned numbers.
 */
export async function saveCards(packId: string, rows: CardInput[]): Promise<Card[]> {
  await requireAdmin();
  const pack = await getPack(packId);
  if (!pack) throw new Error('Pack not found.');
  const existing = await getPackCards(packId);
  const byId = new Map(existing.map(c => [c.id, c]));
  let next = existing.reduce((m, c) => Math.max(m, c.number), 0);

  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const r of rows) {
    if (typeof r.id !== 'string' || !r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    const prev = byId.get(r.id);
    const full = str(r.fullArtImageUrl) || undefined;
    const sound = str(r.soundUrl) || undefined;
    const off = cleanDisabled(r.disabledVariants);
    cards.push({
      id: r.id,
      number: prev?.number ?? ++next,
      name: str(r.name, 80).trim(),
      imageUrl: str(r.imageUrl),
      ...(sound && { soundUrl: sound }),
      ...(full && { fullArtImageUrl: full }),
      ...(off.length > 0 && { disabledVariants: off }),
      upgradesEnabled: r.upgradesEnabled !== false,
      probability: num(r.probability, 1, 0),
      stars: int(r.stars, 1),
    });
  }
  // Keep ordering by number so the table is stable across reloads.
  cards.sort((a, b) => a.number - b.number);
  await savePackCards(packId, cards);
  return cards;
}

/** Publishes a draft once it passes validation. `active` = include in draws straight away. */
export async function publishPack(id: string, active: boolean): Promise<{ ok: true } | { ok: false; issues: Issue[] }> {
  await requireAdmin();
  const pack = await getPack(id);
  if (!pack) return { ok: false, issues: [{ step: 'details', message: 'This draft no longer exists.' }] };
  const cards = await getPackCards(id);
  const issues = validatePack(pack, cards);
  if (issues.length > 0) return { ok: false, issues };
  await savePack({ ...pack, status: 'published', active });
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
  await deleteSeason(id);
  revalidatePath('/admin/seasons');
}
