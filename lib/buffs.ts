import { kv } from './db';
import { getActiveSeason, getPackCards, getPacksForSeason, getSeason, listAllPacks, listSeasons, updateCollection, withCollectionLock, withLock } from './kv';
import { ACHIEVEMENT_KINDS, getCustomGoals } from './achievement-settings';
import {
  consumeBuffPull, describeBuffDef, extraPackCreditsLeft, normalizeBuffDef, applyBuffToList, totalExtraPullsFromBuffs, rarityBoostFactor,
  isInstantBuffType, POINTS_DEFAULT, type TimedBuffType,
  type ActiveBuff, type BuffDef, type BuffEvalContext, type BuffUsage,
} from './buffs-core';
import { encodeEntry, removeEntries } from './variants';
import { favouriteIdsOf, spendablePrints } from './favourites';
import { getCopy, isTracking } from './serials';
import { recordAudit } from './audit';
import { recordActivity } from './activity';
import { addScoreBonus } from './score-bonus';
import { getLiveStatus } from './twitch-live';
import { hasAddRoute, hasViewersRoute, streamKey } from './mixitup-core';
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
  try {
    for (const g of await getCustomGoals()) if (g.buffId === buffId) achievements.push({ kind: `custom-${g.id}`, label: g.title });
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

/**
 * Reads a buff list (`user` = a viewer, null = the community list), lets `fn` change it and saves it back when it changed, all
 * under that list's lock so two requests cannot overwrite each other.
 */
async function editBuffs<T>(user: string | null, fn: (list: ActiveBuff[]) => { buffs: ActiveBuff[]; out: T }): Promise<T> {
  return withLock(user ? `buffs:${user}` : 'buffs:community', async () => {
    const list = user ? await getUserBuffs(user) : await getCommunityBuffs();
    const { buffs, out } = fn(list);
    if (JSON.stringify(buffs) !== JSON.stringify(list)) await (user ? saveUserBuffs(user, buffs) : saveCommunityBuffs(buffs));
    return out;
  });
}

export type ApplyBuffOutcome =
  | { ok: true; buffs: ActiveBuff[]; refreshed: boolean; /** A Brie Bucks grant that left some viewers unpaid: finish it with Retry unpaid. */ partial?: { grantId: string; unpaid: number; total: number } }
  | { ok: false; reason: 'not_found' | 'already_active' | 'max_buffs' | 'invalid_type' | 'community_disallowed' | 'no_season' | 'mixitup_off' | 'mixitup_failed' };

/** A one-shot buff (score-bonus, currency-grant) acts now on the viewer, or on everyone in stream chat for community scope. */
async function applyInstantBuff(def: BuffDef, username: string, options?: { seasonId?: string; dryRun?: boolean }): Promise<ApplyBuffOutcome> {
  const community = def.scope === 'community';
  const mix = await import('./mixitup');
  const settings = await mix.getMixItUpSettings();
  if (def.type === 'currency-grant' && (!settings.enabled || !hasAddRoute(settings))) return { ok: false, reason: 'mixitup_off' };
  if (community && (!settings.enabled || !hasViewersRoute(settings))) return { ok: false, reason: 'mixitup_off' };
  const season = def.type === 'score-bonus' ? (options?.seasonId ? await getSeason(options.seasonId) : await getActiveSeason()) : null;
  if (def.type === 'score-bonus' && !season) return { ok: false, reason: 'no_season' };
  const done: ApplyBuffOutcome = { ok: true, buffs: [], refreshed: false };
  if (options?.dryRun) return done;

  const amount = def.points ?? POINTS_DEFAULT;
  let players = [username.toLowerCase()];
  if (community) {
    const v = await mix.fetchChatViewers(settings);
    if (v.error) return { ok: false, reason: 'mixitup_failed' };
    players = v.users;
  }
  if (season) {
    await addScoreBonus(season.collectionName, players, amount);
    return done;
  }
  const g = await mix.startGrant(settings, def.name, amount, players);
  return g.unpaid > 0 ? { ...done, partial: { grantId: g.id, unpaid: g.unpaid, total: g.total } } : done;
}

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
    /** Check the rules (already active, too many buffs) without saving anything. */
    dryRun?: boolean;
  },
): Promise<ApplyBuffOutcome> {
  const def = await getBuffDef(buffId);
  if (!def) return { ok: false, reason: 'not_found' };
  if (def.type === 'grant-achievement') return { ok: false, reason: 'invalid_type' };

  if (def.scope === 'community' && options?.disallowCommunity) return { ok: false, reason: 'community_disallowed' };

  if (isInstantBuffType(def.type)) return applyInstantBuff(def, username, options);

  const now = options?.now ?? Date.now();
  return editBuffs(def.scope === 'community' ? null : username.toLowerCase(), existing => {
    const res = applyBuffToList(existing, def, {
      id: crypto.randomUUID(),
      now,
      streamKey: options?.streamKey,
      seasonId: options?.seasonId,
      source: options?.source ?? 'admin',
      username,
    });
    return { buffs: res.ok && !options?.dryRun ? res.buffs : existing, out: res };
  });
}

export async function currentBuffStreamKey(): Promise<string> {
  const live = await getLiveStatus().catch(() => null);
  const started = live?.live && live.startedAt ? Date.parse(live.startedAt) : NaN;
  return streamKey(Number.isFinite(started) ? started : null);
}

/** Whether the viewer has an active extra-pack credit (personal or community). */
export async function hasExtraPackCredit(username: string, ctx?: BuffEvalContext): Promise<boolean> {
  return (await creditsLeft(username.toLowerCase(), ctx)) > 0;
}

async function creditsLeft(u: string, ctx?: BuffEvalContext): Promise<number> {
  const [personal, community] = await Promise.all([getUserBuffs(u), getCommunityBuffs()]);
  return extraPackCreditsLeft(personal, community, { now: Date.now(), ...ctx, username: u });
}

// Credits a queued pull has been promised but not yet spent (a pull is queued first and saved later), so pulls queued
// back to back cannot all ride on one credit.
const holdKey = (u: string) => `buffs:credit-hold:${u}`;
const HOLD_TTL_S = 12 * 3600; // as long as a draw ticket (lib/draw.ts)

/** Holds one extra-pack credit for a queued pull. False = the viewer has none that another queued pull has not already claimed. */
export async function reserveExtraPackCredit(username: string, ctx?: BuffEvalContext): Promise<boolean> {
  const u = username.toLowerCase();
  const left = await creditsLeft(u, ctx);
  if (left <= 0) return false;
  const held = await kv.incr(holdKey(u));
  await kv.expire(holdKey(u), HOLD_TTL_S);
  if (held <= left) return true;
  await releaseExtraPackCredit(u);
  return false;
}

/** Gives back a hold from `reserveExtraPackCredit`: the pull was never queued, or its credit has been spent. */
export async function releaseExtraPackCredit(username: string): Promise<void> {
  const k = holdKey(username.toLowerCase());
  if ((await kv.decr(k).catch(() => 0)) <= 0) await kv.del(k).catch(() => {});
}

/** Extra pulls per stream that `username` gets from active buffs (personal + community). */
export async function extraPullsFromBuffs(username: string): Promise<number> {
  const u = username.toLowerCase();
  const [personal, community, streamKey, season] = await Promise.all([
    getUserBuffs(u), getCommunityBuffs(), currentBuffStreamKey().catch(() => undefined), getActiveSeason().catch(() => null),
  ]);
  return totalExtraPullsFromBuffs(personal, community, { now: Date.now(), streamKey, seasonId: season?.id, username: u });
}

/** Draw-weight multiplier for 3+ star cards from the viewer's active rarity-boost buffs (1 = none). */
export async function rarityBoostFor(username: string): Promise<number> {
  const u = username.toLowerCase();
  const [personal, community, streamKey, season] = await Promise.all([
    getUserBuffs(u), getCommunityBuffs(), currentBuffStreamKey().catch(() => undefined), getActiveSeason().catch(() => null),
  ]);
  return rarityBoostFactor(personal, community, { now: Date.now(), streamKey, seasonId: season?.id, username: u });
}

/**
 * Called when a card pull is successfully saved:
 * 1. Spends 1 extra-pack credit if `options.wasCredit` is true (and drops the hold taken when the pull was queued).
 * 2. Decrements any `pulls`-duration buffs for `username` (both personal and community).
 * `seasonId` is the season's id (what buffs store), not its collection name.
 */
export async function consumePullOnSave(
  username: string,
  options?: { wasCredit?: boolean; now?: number; streamKey?: string; seasonId?: string },
): Promise<void> {
  const u = username.toLowerCase();
  const now = options?.now ?? Date.now();
  const stream = options?.streamKey ?? (await currentBuffStreamKey().catch(() => undefined));
  const ctx = { now, streamKey: stream, seasonId: options?.seasonId, username: u };
  // Saves the list whenever it changed, not only when a credit went (stream keys seen and expired buffs are kept too).
  const consume = (user: string | null, type: TimedBuffType, onlyOneCredit?: boolean) =>
    editBuffs(user, list => {
      const r = consumeBuffPull(list, { ...ctx, type, onlyOneCredit });
      return { buffs: r.buffs, out: r.consumedCredit };
    });

  // 1. Spend 1 extra-pack credit if this was a credit pull
  if (options?.wasCredit) {
    if (!(await consume(u, 'extra-pack', true))) await consume(null, 'extra-pack', true);
    await releaseExtraPackCredit(u); // after the spend, so the credit never looks free in between
  }

  // 2. Decrement pulls-duration buffs (personal & community)
  await consume(u, 'extra-pulls');
  await consume(null, 'extra-pulls');
  await consume(u, 'rarity-boost');
  await consume(null, 'rarity-boost');
}

export interface UseTrainerResult {
  ok: boolean;
  status: number;
  message?: string;
  error?: string;
  /** Set for refusals callers react to, so they need not match the message text. */
  code?: 'already_active' | 'favourite';
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
  // Only a published season that has not ended counts; a draft, an ended or an unknown season is refused.
  const season = seasonId ? seasons.find(s => s.id === seasonId) : seasons.find(s => s.active);
  if (!season || season.status !== 'published' || season.endedAt) return { ok: false, status: 400, error: 'No active season.' };

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
    let retiredUid: number | undefined;
    let retiredCopyId: string | undefined;
    const now = Date.now();
    const stream = await currentBuffStreamKey().catch(() => undefined);
    const buffOpts = { source: `card:${cardNumber}`, seasonId: season.id, streamKey: stream, now };
    const refusal = (r: Extract<ApplyBuffOutcome, { ok: false }>): UseTrainerResult =>
      r.reason === 'already_active' ? { ok: false, status: 400, code: 'already_active', error: `Buff "${buffDef.name}" is already active.` }
      : r.reason === 'max_buffs' ? { ok: false, status: 400, error: 'You have reached the maximum number of active buffs.' }
      : r.reason === 'mixitup_off' ? { ok: false, status: 400, error: 'This buff needs Mix It Up, which is off or is missing an address it needs (add or chat viewers).' }
      : r.reason === 'mixitup_failed' ? { ok: false, status: 502, error: 'Mix It Up did not answer, so the buff was not applied.' }
      : { ok: false, status: 400, error: 'Could not apply buff.' };

    // Take the card (a refusal comes back as the result and writes nothing), then apply the buff.
    const refused = await updateCollection<UseTrainerResult | null>(season.collectionName, [u], async cards => {
      const fromEntry = encodeEntry(cardNumber, 'regular');
      const remaining = removeEntries(cards[u], fromEntry, 1);
      if (!remaining) {
        return { result: { ok: false, status: 400, error: `You do not hold a Regular edition of ${trainerCard.name}.` } };
      }

      let spendIds: string[] | undefined;
      if (await isTracking(season.collectionName)) {
        const favs = await favouriteIdsOf(season.collectionName, u);
        const r = await spendablePrints(season.collectionName, u, fromEntry, 1, undefined, favs, 'spend');
        if (!r.ok) return { result: { ok: false, status: 400, code: 'favourite', error: r.text } };
        spendIds = r.ids ?? undefined;
        if (spendIds?.[0]) {
          retiredCopyId = spendIds[0];
          const copy = await getCopy(season.collectionName, spendIds[0]);
          if (copy?.uid) retiredUid = copy.uid;
        }
      }

      // Check the buff can be applied first, then take the card, then apply it: a failed save then leaves no buff behind.
      const check = await applyBuff(u, buffDef.id, { ...buffOpts, dryRun: true });
      if (!check.ok) return { result: refusal(check) };

      return {
        result: null,
        cards: { [u]: remaining },
        ctx: { retire: spendIds ? { owner: u, ids: spendIds, who: u, note: 'trainer card used' } : undefined },
      };
    });
    if (refused) return refused;

    const buffRes = await applyBuff(u, buffDef.id, buffOpts);
    if (!buffRes.ok) {
      // Only a rare race (another grant filled the list since the check); the card is already spent, so leave a trail.
      await recordAudit(u, 'Trainer card buff not applied', `${trainerCard.name}, ${buffDef.name}: ${buffRes.reason}`);
      return refusal(buffRes);
    }

    const durSummary = describeBuffDef(buffDef);
    await recordAudit(u, 'Trainer card used', `${trainerCard.name}, ${buffDef.name}, ${durSummary}${buffRes.partial ? `, ${buffRes.partial.unpaid} of ${buffRes.partial.total} unpaid (grant ${buffRes.partial.grantId})` : ''}`);

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
      message: buffRes.partial
        ? `Used ${trainerCard.name}! ${buffDef.name} reached some viewers; ${buffRes.partial.unpaid} are still unpaid and staff can retry them.`
        : `Used ${trainerCard.name}! ${buffDef.name} is now active.`,
      cardName: trainerCard.name,
      buffName: buffDef.name,
    };
  });
}
