import { kv } from './db';
import { getCollection, getPackCards, getPacksForSeason, getSeason, listAllPacks, listSeasons, saveCollection, withCollectionLock } from './kv';
import { ACHIEVEMENT_KINDS } from './achievement-settings';
import {
  consumeBuffPull, describeBuffDef, isBuffActiveFor, normalizeBuffDef, applyBuffToList,
  type ActiveBuff, type BuffDef, type BuffEvalContext, type BuffUsage,
} from './buffs-core';
import { encodeEntry, removeEntries } from './variants';
import { favouriteIdsOf, spendablePrints } from './favourites';
import { getCopy, isTracking } from './serials';
import { recordAudit } from './audit';
import { recordActivity } from './activity';
import { getLiveStatus } from './twitch-live';
import { streamKey } from './mixitup-core';
import type { Card } from './types';

export type { BuffUsage };

// KV storage for Trainer card buff definitions (`trainer:buffs`) and active community buffs (`buffs:community`).

const DEFS_KEY = 'trainer:buffs';
const COMMUNITY_KEY = 'buffs:community';

export async function getBuffDefs(): Promise<BuffDef[]> {
  try {
    const raw = await kv.get<unknown[]>(DEFS_KEY);
    if (!Array.isArray(raw)) return [];
    const out: BuffDef[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      const def = normalizeBuffDef(item);
      if (def && !seen.has(def.id)) {
        seen.add(def.id);
        out.push(def);
      }
    }
    return out;
  } catch {
    return [];
  }
}

export async function getBuffDef(id: string): Promise<BuffDef | null> {
  const all = await getBuffDefs();
  return all.find(b => b.id === id) ?? null;
}

export async function saveBuffDefs(defs: BuffDef[]): Promise<void> {
  const clean: BuffDef[] = [];
  const seen = new Set<string>();
  for (const d of defs) {
    const c = normalizeBuffDef(d);
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      clean.push(c);
    }
  }
  await kv.set(DEFS_KEY, clean);
}

export async function upsertBuffDef(def: BuffDef): Promise<BuffDef[]> {
  const clean = normalizeBuffDef(def);
  if (!clean) throw new Error('Invalid buff definition.');
  const existing = await getBuffDefs();
  const idx = existing.findIndex(b => b.id === clean.id);
  const next = idx >= 0 ? existing.map((b, i) => (i === idx ? clean : b)) : [...existing, clean];
  await saveBuffDefs(next);
  return next;
}

/** Finds every card in any pack and any achievement in `achievements:settings` that references `buffId`. */
export async function findBuffUsage(buffId: string): Promise<BuffUsage> {
  const packs = await listAllPacks();
  const cards: BuffUsage['cards'] = [];
  await Promise.all(
    packs.map(async p => {
      const packCards = await getPackCards(p.id);
      for (const c of packCards) {
        if (c.kind === 'trainer' && c.buffId === buffId) {
          cards.push({ packId: p.id, packName: p.name, cardId: c.id, cardNumber: c.number, cardName: c.name });
        }
      }
    }),
  );

  const achievements: BuffUsage['achievements'] = [];
  try {
    const rawAch = await kv.get<Record<string, unknown>>('achievements:settings');
    if (rawAch && typeof rawAch === 'object') {
      for (const [kind, row] of Object.entries(rawAch)) {
        if (row && typeof row === 'object' && (row as Record<string, unknown>).buffId === buffId) {
          const found = ACHIEVEMENT_KINDS.find(k => k.kind === kind);
          achievements.push({ kind, label: found?.label ?? kind });
        }
      }
    }
  } catch { /* ignore */ }

  return { cards, achievements };
}

/**
 * Deletes a buff definition by id. Refuses deletion while any trainer card or achievement setting still points at it.
 */
export async function deleteBuffDef(buffId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const usage = await findBuffUsage(buffId);
  if (usage.cards.length > 0 || usage.achievements.length > 0) {
    const parts: string[] = [];
    if (usage.cards.length > 0) {
      parts.push(`${usage.cards.length} card${usage.cards.length === 1 ? '' : 's'} (${usage.cards.map(c => `#${c.cardNumber} ${c.cardName || 'Untitled'} in ${c.packName}`).join(', ')})`);
    }
    if (usage.achievements.length > 0) {
      parts.push(`${usage.achievements.length} achievement${usage.achievements.length === 1 ? '' : 's'} (${usage.achievements.map(a => a.label).join(', ')})`);
    }
    return {
      ok: false,
      message: `Cannot delete this buff while it is still used by ${parts.join(' and ')}.`,
    };
  }
  const existing = await getBuffDefs();
  await saveBuffDefs(existing.filter(b => b.id !== buffId));
  return { ok: true };
}

// ── Community buffs (`buffs:community`) ──────────────────
// Stored once at `buffs:community`, never copied onto every user.

export async function getCommunityBuffs(): Promise<ActiveBuff[]> {
  try {
    const raw = await kv.get<ActiveBuff[]>(COMMUNITY_KEY);
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export async function saveCommunityBuffs(buffs: ActiveBuff[]): Promise<void> {
  if (buffs.length === 0) await kv.del(COMMUNITY_KEY);
  else await kv.set(COMMUNITY_KEY, buffs);
}

// ── Personal buffs (`user:<username>:buffs`) ──────────────

const userBuffsKey = (u: string) => `user:${u.toLowerCase()}:buffs`;

export async function getUserBuffs(username: string): Promise<ActiveBuff[]> {
  try {
    const raw = await kv.get<ActiveBuff[]>(userBuffsKey(username));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export async function saveUserBuffs(username: string, buffs: ActiveBuff[]): Promise<void> {
  const k = userBuffsKey(username);
  if (buffs.length === 0) await kv.del(k);
  else await kv.set(k, buffs);
}

export type ApplyBuffOutcome =
  | { ok: true; buffs: ActiveBuff[]; refreshed: boolean }
  | { ok: false; reason: 'not_found' | 'already_active' | 'max_buffs' | 'invalid_type' | 'community_disallowed' };

/**
 * Applies a configured buff definition to a user (or community).
 * For personal buffs, enforces duration and stacking rules, persisting to `user:<u>:buffs`.
 */
export async function applyBuff(
  username: string,
  buffId: string,
  options?: {
    source?: string;
    streamKey?: string;
    seasonId?: string;
    now?: number;
    disallowCommunity?: boolean;
  },
): Promise<ApplyBuffOutcome> {
  const def = await getBuffDef(buffId);
  if (!def) return { ok: false, reason: 'not_found' };
  if (def.type === 'grant-achievement') return { ok: false, reason: 'invalid_type' };

  if (def.scope === 'community') {
    if (options?.disallowCommunity) return { ok: false, reason: 'community_disallowed' };
    const community = await getCommunityBuffs();
    const now = options?.now ?? Date.now();
    const res = applyBuffToList(community, def, {
      id: crypto.randomUUID(),
      now,
      streamKey: options?.streamKey,
      seasonId: options?.seasonId,
      source: options?.source ?? 'admin',
      username,
    });
    if (res.ok) {
      await saveCommunityBuffs(res.buffs);
    }
    return res;
  }

  const existing = await getUserBuffs(username);
  const now = options?.now ?? Date.now();
  const res = applyBuffToList(existing, def, {
    id: crypto.randomUUID(),
    now,
    streamKey: options?.streamKey,
    seasonId: options?.seasonId,
    source: options?.source ?? 'admin',
    username,
  });
  if (res.ok) {
    await saveUserBuffs(username, res.buffs);
  }
  return res;
}

export async function currentBuffStreamKey(): Promise<string> {
  const live = await getLiveStatus().catch(() => null);
  const started = live?.live && live.startedAt ? Date.parse(live.startedAt) : NaN;
  return streamKey(Number.isFinite(started) ? started : null);
}

/** Whether the viewer has an active extra-pack credit (personal or community). */
export async function hasExtraPackCredit(username: string, ctx?: BuffEvalContext): Promise<boolean> {
  const u = username.toLowerCase();
  const now = ctx?.now ?? Date.now();
  const evalCtx = { now, ...ctx, username: u };
  const personal = await getUserBuffs(u);
  for (const b of personal) {
    if (b.type === 'extra-pack' && isBuffActiveFor(b, evalCtx)) return true;
  }
  const community = await getCommunityBuffs();
  for (const b of community) {
    if (b.type === 'extra-pack' && isBuffActiveFor(b, evalCtx)) return true;
  }
  return false;
}

/**
 * Called when a card pull is successfully saved:
 * 1. Consumes 1 extra-pack credit if `options.wasCredit` is true.
 * 2. Decrements any `pulls`-duration buffs for `username` (both personal and community).
 */
export async function consumePullOnSave(
  username: string,
  options?: { wasCredit?: boolean; now?: number; streamKey?: string; seasonId?: string },
): Promise<void> {
  const u = username.toLowerCase();
  const now = options?.now ?? Date.now();
  const stream = options?.streamKey ?? (await currentBuffStreamKey().catch(() => undefined));
  const ctx = { now, streamKey: stream, seasonId: options?.seasonId, username: u };

  // 1. Consume 1 extra-pack credit if this was a credit pull
  if (options?.wasCredit) {
    const personal = await getUserBuffs(u);
    const pRes = consumeBuffPull(personal, { ...ctx, type: 'extra-pack', onlyOneCredit: true });
    if (pRes.consumedCredit) {
      await saveUserBuffs(u, pRes.buffs);
    } else {
      const comm = await getCommunityBuffs();
      const cRes = consumeBuffPull(comm, { ...ctx, type: 'extra-pack', onlyOneCredit: true });
      if (cRes.consumedCredit) {
        await saveCommunityBuffs(cRes.buffs);
      }
    }
  }

  // 2. Decrement pulls-duration buffs (personal & community)
  const personal = await getUserBuffs(u);
  const pPulls = consumeBuffPull(personal, { ...ctx, type: 'extra-pulls' });
  if (pPulls.consumedCredit) {
    await saveUserBuffs(u, pPulls.buffs);
  }
  const comm = await getCommunityBuffs();
  const cPulls = consumeBuffPull(comm, { ...ctx, type: 'extra-pulls' });
  if (cPulls.consumedCredit) {
    await saveCommunityBuffs(cPulls.buffs);
  }
}

export interface UseTrainerResult {
  ok: boolean;
  status: number;
  message?: string;
  error?: string;
  cardName?: string;
  buffName?: string;
}

/**
 * Uses a trainer card: confirms ownership of 1 Regular copy (excluding favourites/escrow),
 * verifies card kind is trainer and buff definition exists, confirms stacking rules, applies buff,
 * consumes 1 edition (retiring in ledger), records audit, and logs activity (type: 'buff').
 */
export async function useTrainerCard(
  username: string,
  cardNumber: number,
  seasonId?: string,
): Promise<UseTrainerResult> {
  const u = username.toLowerCase();
  const seasons = await listSeasons().catch(() => []);
  const season = seasonId
    ? seasons.find(s => s.id === seasonId) ?? (await getSeason(seasonId))
    : seasons.find(s => s.active && !s.endedAt) ?? seasons[0];
  if (!season) return { ok: false, status: 400, error: 'No active season.' };

  const packs = await getPacksForSeason(season);
  let trainerCard: Card | null = null;
  for (const p of packs) {
    const cards = await getPackCards(p.id);
    const found = cards.find(c => c.number === cardNumber);
    if (found) { trainerCard = found; break; }
  }
  if (!trainerCard) return { ok: false, status: 404, error: 'Card not found.' };
  if (trainerCard.kind !== 'trainer' || !trainerCard.buffId) {
    return { ok: false, status: 400, error: 'This card is not a trainer card.' };
  }

  const buffDef = await getBuffDef(trainerCard.buffId);
  if (!buffDef) return { ok: false, status: 400, error: 'This card has no valid buff.' };

  return withCollectionLock(season.collectionName, async (): Promise<UseTrainerResult> => {
    const coll = await getCollection(season.collectionName);
    const owned = coll[u] ?? [];
    const fromEntry = encodeEntry(cardNumber, 'regular');
    const remaining = removeEntries(owned, fromEntry, 1);
    if (!remaining) {
      return { ok: false, status: 400, error: `You do not hold a Regular copy of ${trainerCard.name}.` };
    }

    let spendIds: string[] | undefined;
    let retiredUid: number | undefined;
    let retiredCopyId: string | undefined;

    if (await isTracking(season.collectionName)) {
      const favs = await favouriteIdsOf(season.collectionName, u);
      const r = await spendablePrints(season.collectionName, u, fromEntry, 1, undefined, favs, 'spend');
      if (!r.ok) return { ok: false, status: 400, error: r.text };
      spendIds = r.ids ?? undefined;
      if (spendIds?.[0]) {
        retiredCopyId = spendIds[0];
        const copy = await getCopy(season.collectionName, spendIds[0]);
        if (copy?.uid) retiredUid = copy.uid;
      }
    }

    const now = Date.now();
    const stream = await currentBuffStreamKey().catch(() => undefined);
    const buffRes = await applyBuff(u, buffDef.id, {
      source: `card:${cardNumber}`,
      seasonId: season.id,
      streamKey: stream,
      now,
    });
    if (!buffRes.ok) {
      if (buffRes.reason === 'already_active') {
        return { ok: false, status: 400, error: `Buff "${buffDef.name}" is already active.` };
      }
      if (buffRes.reason === 'max_buffs') {
        return { ok: false, status: 400, error: 'You have reached the maximum number of active buffs.' };
      }
      return { ok: false, status: 400, error: 'Could not apply buff.' };
    }

    coll[u] = remaining;
    await saveCollection(season.collectionName, coll, {
      retire: spendIds ? { owner: u, ids: spendIds, who: u, note: 'trainer card used' } : undefined,
    });

    const durSummary = describeBuffDef(buffDef);
    await recordAudit(u, 'Trainer card used', `${trainerCard.name}, ${buffDef.name}, ${durSummary}`);

    await recordActivity({
      type: 'buff',
      username: u,
      collectionName: season.collectionName,
      cardNumber,
      cardName: trainerCard.name,
      buffName: buffDef.name,
      buffType: buffDef.type,
      magnitude: buffDef.magnitude,
      duration: durSummary,
      ...(retiredCopyId ? { copyId: retiredCopyId } : {}),
      ...(retiredUid ? { uid: retiredUid } : {}),
    });

    return {
      ok: true,
      status: 200,
      message: `Used ${trainerCard.name}! ${buffDef.name} is now active.`,
      cardName: trainerCard.name,
      buffName: buffDef.name,
    };
  });
}
