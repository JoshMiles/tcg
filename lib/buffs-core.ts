import { RARITIES } from './rarity';
import { VARIANTS, VARIANT_LABELS } from './variants';
import { MAX_BUFFS } from './pull-limit-core';

// Trainer card buffs (ROADMAP 30.1). Pure and client-safe: no database, no network.
// A trainer card grants one buff when used, then the card is consumed (30.2). Achievements can also reference this catalogue (27.5).
// Note (A4): an `extra-pack` buff grants `magnitude` pack credits where one credit is used instead of counting against the stream
// limit AND waives the Brie Bucks deduction for that pull.

export interface BuffAchievementKind {
  kind: string;
  label: string;
  group: 'Set' | 'Rarity' | 'Version' | 'Edition number';
}

export const BUFF_ACHIEVEMENT_KINDS: readonly BuffAchievementKind[] = [
  { kind: 'complete', label: 'Completed set', group: 'Set' },
  { kind: 'master', label: 'Master set', group: 'Set' },
  ...[...RARITIES].sort((a, b) => a.stars - b.stars).map(r => ({ kind: `tier-${r.stars}`, label: `All ${r.label}`, group: 'Rarity' as const })),
  ...VARIANTS.filter(v => v !== 'regular').map(v => ({ kind: `all-${v}`, label: `All ${VARIANT_LABELS[v]}`, group: 'Version' as const })),
  { kind: 'first-edition', label: 'First edition', group: 'Edition number' },
  { kind: 'first-shiny', label: 'First shiny edition', group: 'Edition number' },
  { kind: 'five-firsts', label: 'Five firsts', group: 'Edition number' },
  { kind: 'early-bird', label: 'Early bird', group: 'Edition number' },
];

export { MAX_BUFFS };

export const BUFF_TYPES = ['extra-pulls', 'extra-pack', 'rarity-boost', 'score-bonus', 'currency-grant', 'grant-achievement'] as const;
export type BuffType = (typeof BUFF_TYPES)[number];

/** One-shot buffs: they act when applied (nothing is stored as an active buff), so duration, stacking and magnitude do not apply. */
export const INSTANT_BUFF_TYPES = ['score-bonus', 'currency-grant'] as const;
export type InstantBuffType = (typeof INSTANT_BUFF_TYPES)[number];
export const isInstantBuffType = (t: BuffType): t is InstantBuffType => (INSTANT_BUFF_TYPES as readonly string[]).includes(t);
/** Types that live as an ActiveBuff for a while. */
export type TimedBuffType = Exclude<BuffType, InstantBuffType | 'grant-achievement'>;

export const POINTS_MIN = 1;
export const POINTS_MAX = 10000;
export const POINTS_DEFAULT = 100;
/** Rarities with at least this many stars get the rarity boost. */
export const RARITY_BOOST_MIN_STARS = 3;
/** Each magnitude point of rarity-boost adds this much to the draw weight of those rarities. */
export const RARITY_BOOST_STEP = 0.1;

export const BUFF_TYPE_LABELS: Record<BuffType, string> = {
  'extra-pulls': 'Extra pulls per stream',
  'extra-pack': 'Free pack credits',
  'rarity-boost': 'Better chance of rare cards',
  'score-bonus': 'Bonus leaderboard points',
  'currency-grant': 'Bonus Brie Bucks',
  'grant-achievement': 'Grant an achievement',
};

export const DURATION_UNITS = ['hours', 'streams', 'season', 'pulls'] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

export const DURATION_UNIT_LABELS: Record<DurationUnit, string> = {
  hours: 'Hours',
  streams: 'Streams',
  season: 'Rest of active season',
  pulls: 'Next N pulls',
};

export const BUFF_STACK_MODES = ['refresh', 'reject'] as const;
export type BuffStackMode = (typeof BUFF_STACK_MODES)[number];

export const BUFF_SCOPES = ['self', 'community'] as const;
export type BuffScope = (typeof BUFF_SCOPES)[number];

export const MAGNITUDE_MIN = 1;
export const MAGNITUDE_MAX = 10;
export const HOURS_MIN = 1;
export const HOURS_MAX = 8760;
export const STREAMS_MIN = 1;
export const STREAMS_MAX = 30;
export const PULLS_MIN = 1;
export const PULLS_MAX = 100;
export const BUFF_NAME_MAX = 80;

export interface BuffDuration {
  unit: DurationUnit;
  /** Number of hours, streams, or pulls (omitted when unit === 'season'). */
  n?: number;
}

export interface BuffDef {
  id: string;
  name: string;
  type: BuffType;
  /** 1..10 for extra-pulls and extra-pack; 1 for grant-achievement. */
  magnitude: number;
  /** Not used when type === 'grant-achievement'. */
  duration: BuffDuration;
  stack: BuffStackMode;
  /** grant-achievement is always 'self'. */
  scope: BuffScope;
  /** Built-in achievement kind when type === 'grant-achievement'. */
  achievementId?: string;
  /** Flat amount (POINTS_MIN..POINTS_MAX) for score-bonus (points) and currency-grant (currency). */
  points?: number;
}

/** An applied personal or community buff instance (stored on a viewer or in `buffs:community`). */
export interface ActiveBuff {
  id: string;
  buffId: string;
  name: string;
  type: TimedBuffType;
  magnitude: number;
  stack: BuffStackMode;
  scope: BuffScope;
  source: string;
  grantedAt: number;
  /** Set when duration.unit === 'hours'. */
  until?: number;
  /** Set when duration.unit === 'streams': the max number of stream keys and the keys seen so far. */
  streamsMax?: number;
  streamKeys?: string[];
  /** Set when duration.unit === 'season': active season id when granted. */
  seasonId?: string;
  /** Set when duration.unit === 'pulls' on a personal buff, or type === 'extra-pack' personal credits remaining. */
  pullsLeft?: number;
  /**
   * For a community buff with `pulls` duration or `extra-pack` credits: each viewer gets their own count,
   * so we track how many pulls/credits each viewer has used rather than copying the buff onto every user.
   */
  pullsMax?: number;
  usedBy?: Record<string, number>;
}

export interface BuffUsage {
  cards: { packId: string; packName: string; cardId: string; cardNumber: number; cardName: string }[];
  achievements: { kind: string; label: string }[];
}

const KNOWN_ACHIEVEMENTS = new Set(BUFF_ACHIEVEMENT_KINDS.map(k => k.kind));

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};

export function clampDuration(unit: unknown, n: unknown): BuffDuration {
  const u: DurationUnit = (DURATION_UNITS as readonly unknown[]).includes(unit) ? (unit as DurationUnit) : 'hours';
  if (u === 'season') return { unit: 'season' };
  if (u === 'hours') return { unit: 'hours', n: clampInt(n, HOURS_MIN, HOURS_MAX, 24) };
  if (u === 'streams') return { unit: 'streams', n: clampInt(n, STREAMS_MIN, STREAMS_MAX, 1) };
  return { unit: 'pulls', n: clampInt(n, PULLS_MIN, PULLS_MAX, 5) };
}

export function normalizeBuffDef(raw: unknown): BuffDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id.trim().slice(0, 60) : '';
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, BUFF_NAME_MAX) : '';
  if (!id || !name) return null;
  const type: BuffType = (BUFF_TYPES as readonly unknown[]).includes(r.type) ? (r.type as BuffType) : 'extra-pulls';
  const stack: BuffStackMode = r.stack === 'reject' ? 'reject' : 'refresh';
  if (type === 'grant-achievement') {
    const ach = typeof r.achievementId === 'string' ? r.achievementId.trim() : '';
    const achievementId = KNOWN_ACHIEVEMENTS.has(ach) ? ach : BUFF_ACHIEVEMENT_KINDS[0].kind;
    return {
      id,
      name,
      type: 'grant-achievement',
      magnitude: 1,
      duration: { unit: 'season' },
      stack,
      scope: 'self',
      achievementId,
    };
  }
  if (isInstantBuffType(type)) {
    return { id, name, type, magnitude: 1, duration: { unit: 'season' }, stack: 'refresh', scope: r.scope === 'community' ? 'community' : 'self', points: clampInt(r.points, POINTS_MIN, POINTS_MAX, POINTS_DEFAULT) };
  }
  const magnitude = clampInt(r.magnitude, MAGNITUDE_MIN, MAGNITUDE_MAX, 1);
  const durRaw = (r.duration && typeof r.duration === 'object' ? r.duration : {}) as Record<string, unknown>;
  const duration = clampDuration(durRaw.unit ?? r.durationUnit, durRaw.n ?? r.durationN);
  const scope: BuffScope = r.scope === 'community' ? 'community' : 'self';
  return { id, name, type, magnitude, duration, stack, scope };
}

/** Validates and cleans raw form/input fields into a BuffDef, returning a human-readable error when invalid. */
export function cleanBuffDefInput(raw: Record<string, unknown>, existingId?: string): { ok: true; def: BuffDef } | { ok: false; message: string } {
  const id = (existingId ?? (typeof raw.id === 'string' ? raw.id.trim() : '')).slice(0, 60);
  if (!id) return { ok: false, message: 'Missing buff ID.' };
  const name = (typeof raw.name === 'string' ? raw.name.trim() : '').slice(0, BUFF_NAME_MAX);
  if (!name) return { ok: false, message: 'Give the buff a name.' };
  if (!(BUFF_TYPES as readonly unknown[]).includes(raw.type)) {
    return { ok: false, message: 'Choose a valid buff type.' };
  }
  const type = raw.type as BuffType;
  const stack: BuffStackMode = raw.stack === 'reject' ? 'reject' : 'refresh';

  if (type === 'grant-achievement') {
    const ach = typeof raw.achievementId === 'string' ? raw.achievementId.trim() : '';
    if (!KNOWN_ACHIEVEMENTS.has(ach)) {
      return { ok: false, message: 'Choose a built-in achievement to grant.' };
    }
    return {
      ok: true,
      def: {
        id,
        name,
        type: 'grant-achievement',
        magnitude: 1,
        duration: { unit: 'season' },
        stack,
        scope: 'self',
        achievementId: ach,
      },
    };
  }

  if (isInstantBuffType(type)) {
    const scope: BuffScope = raw.scope === 'community' ? 'community' : 'self';
    return { ok: true, def: { id, name, type, magnitude: 1, duration: { unit: 'season' }, stack: 'refresh', scope, points: clampInt(raw.points, POINTS_MIN, POINTS_MAX, POINTS_DEFAULT) } };
  }
  const magnitude = clampInt(raw.magnitude, MAGNITUDE_MIN, MAGNITUDE_MAX, 1);
  const durObj = (raw.duration && typeof raw.duration === 'object' ? raw.duration : null) as Record<string, unknown> | null;
  const duration = clampDuration(durObj ? durObj.unit : raw.durationUnit, durObj ? durObj.n : raw.durationN);
  const scope: BuffScope = raw.scope === 'community' ? 'community' : 'self';
  return {
    ok: true,
    def: { id, name, type, magnitude, duration, stack, scope },
  };
}

/** Short human description of a buff definition for the admin list and card editor. */
export function describeBuffDef(def: BuffDef): string {
  if (def.type === 'grant-achievement') {
    const kind = BUFF_ACHIEVEMENT_KINDS.find(k => k.kind === def.achievementId);
    return `Grants achievement "${kind?.label ?? def.achievementId ?? 'Unknown'}" (self)`;
  }
  if (isInstantBuffType(def.type)) {
    const n = (def.points ?? POINTS_DEFAULT).toLocaleString('en-US');
    return `${def.type === 'score-bonus' ? `+${n} leaderboard points` : `+${n} Brie Bucks`}, once when applied · ${def.scope === 'community' ? 'community' : 'self'}`;
  }
  const what = def.type === 'extra-pulls'
    ? `+${def.magnitude} pull${def.magnitude === 1 ? '' : 's'}/stream`
    : def.type === 'rarity-boost'
      ? `+${Math.round(def.magnitude * RARITY_BOOST_STEP * 100)}% chance of ${RARITY_BOOST_MIN_STARS}+ star cards`
      : `${def.magnitude} free pack credit${def.magnitude === 1 ? '' : 's'} (waives limit & Brie Bucks)`;
  const dur = def.duration.unit === 'season'
    ? 'for the active season'
    : def.duration.unit === 'hours'
      ? `for ${def.duration.n ?? 1}h`
      : def.duration.unit === 'streams'
        ? `for ${def.duration.n ?? 1} stream${(def.duration.n ?? 1) === 1 ? '' : 's'}`
        : `for ${def.duration.n ?? 1} pull${(def.duration.n ?? 1) === 1 ? '' : 's'}`;
  const who = def.scope === 'community' ? 'community' : 'self';
  return `${what} ${dur} · ${who} · stack: ${def.stack}`;
}

export interface BuffEvalContext {
  now: number;
  streamKey?: string;
  seasonId?: string | null;
  /** Viewer login (lowercase) when evaluating per-viewer remaining pulls on a community buff. */
  username?: string;
}

/**
 * Advances stream-key tracking on a buff if `ctx.streamKey` is provided, and returns the updated buff
 * or null if it has expired under `ctx`. Pure: never mutates the input.
 */
export function stepActiveBuff(buff: ActiveBuff, ctx: BuffEvalContext): ActiveBuff | null {
  if (buff.until !== undefined && buff.until <= ctx.now) return null;
  if (buff.seasonId !== undefined && ctx.seasonId !== undefined && ctx.seasonId !== buff.seasonId) return null;

  let next = buff;
  if (buff.streamsMax !== undefined) {
    const seen = buff.streamKeys ?? [];
    if (ctx.streamKey && !seen.includes(ctx.streamKey)) {
      const updated = [...seen, ctx.streamKey];
      if (updated.length > buff.streamsMax) return null;
      next = { ...next, streamKeys: updated };
    } else if (seen.length > buff.streamsMax) {
      return null;
    }
  }

  if (next.scope === 'self') {
    if (next.pullsLeft !== undefined && next.pullsLeft <= 0) return null;
  } else if (next.pullsMax !== undefined && ctx.username) {
    const used = next.usedBy?.[ctx.username.toLowerCase()] ?? 0;
    if (used >= next.pullsMax) return null;
  }

  return next;
}

/** Filters and updates a list of active buffs, dropping any that have expired. */
export function pruneActiveBuffs(buffs: readonly ActiveBuff[], ctx: BuffEvalContext): ActiveBuff[] {
  const out: ActiveBuff[] = [];
  for (const b of buffs) {
    // For community buffs pruned globally (without username), keep them unless time/stream/season expired.
    const stepped = stepActiveBuff(b, { ...ctx, username: b.scope === 'community' ? undefined : ctx.username });
    if (stepped) out.push(stepped);
  }
  return out.slice(0, MAX_BUFFS);
}

/** Is `buff` currently active for `ctx` (including per-viewer pull count on community buffs)? */
export function isBuffActiveFor(buff: ActiveBuff, ctx: BuffEvalContext): boolean {
  return stepActiveBuff(buff, ctx) !== null;
}

/** Builds a fresh ActiveBuff instance from a BuffDef (for extra-pulls or extra-pack). */
export function createActiveBuff(def: BuffDef, ctx: { id: string; now: number; streamKey?: string; seasonId?: string; source: string }): ActiveBuff | null {
  if (def.type === 'grant-achievement' || isInstantBuffType(def.type)) return null;
  const base: ActiveBuff = {
    id: ctx.id,
    buffId: def.id,
    name: def.name,
    type: def.type,
    magnitude: clampInt(def.magnitude, MAGNITUDE_MIN, MAGNITUDE_MAX, 1),
    stack: def.stack,
    scope: def.scope,
    source: ctx.source,
    grantedAt: ctx.now,
  };

  const { unit, n } = def.duration;
  if (unit === 'hours') {
    const hours = clampInt(n, HOURS_MIN, HOURS_MAX, 24);
    base.until = ctx.now + hours * 3_600_000;
  } else if (unit === 'streams') {
    const streams = clampInt(n, STREAMS_MIN, STREAMS_MAX, 1);
    base.streamsMax = streams;
    base.streamKeys = ctx.streamKey ? [ctx.streamKey] : [];
  } else if (unit === 'season') {
    base.seasonId = ctx.seasonId ?? '';
  } else if (unit === 'pulls') {
    const pulls = clampInt(n, PULLS_MIN, PULLS_MAX, 1);
    if (def.scope === 'community') {
      base.pullsMax = pulls;
      base.usedBy = {};
    } else {
      base.pullsLeft = pulls;
    }
  }

  // An extra-pack buff also tracks remaining pack credits (magnitude) if it doesn't already use pulls duration.
  if (def.type === 'extra-pack' && unit !== 'pulls') {
    if (def.scope === 'community') {
      base.pullsMax = base.magnitude;
      base.usedBy = {};
    } else {
      base.pullsLeft = base.magnitude;
    }
  }

  return base;
}

export type ApplyBuffResult =
  | { ok: true; buffs: ActiveBuff[]; refreshed: boolean }
  | { ok: false; reason: 'already_active' | 'max_buffs' | 'invalid_type' };

/**
 * Applies `def` to an existing list of active buffs (either personal or community), enforcing `stack` ('refresh' vs 'reject')
 * and `MAX_BUFFS` (20). `refresh` moves the expiry out (resets timer/streams/pulls) and does not add the magnitude again.
 */
export function applyBuffToList(
  existing: readonly ActiveBuff[],
  def: BuffDef,
  ctx: { id: string; now: number; streamKey?: string; seasonId?: string; source: string; username?: string },
): ApplyBuffResult {
  if (def.type === 'grant-achievement' || isInstantBuffType(def.type)) return { ok: false, reason: 'invalid_type' };
  const live = pruneActiveBuffs(existing, ctx);
  const fresh = createActiveBuff(def, ctx);
  if (!fresh) return { ok: false, reason: 'invalid_type' };

  const idx = live.findIndex(b => b.buffId === def.id && isBuffActiveFor(b, ctx));
  if (idx >= 0) {
    if (def.stack === 'reject') return { ok: false, reason: 'already_active' };
    // refresh: replace the existing active entry's expiry/counters without doubling magnitude
    const updated = [...live];
    updated[idx] = { ...fresh, id: live[idx].id };
    return { ok: true, buffs: updated, refreshed: true };
  }

  if (live.length >= MAX_BUFFS) return { ok: false, reason: 'max_buffs' };
  return { ok: true, buffs: [...live, fresh], refreshed: false };
}

/**
 * Consumes one pull from any `pulls`-limited buffs (or one pack credit when `kind === 'extra-pack'`) for `username`.
 * For a community buff, increments `usedBy[username]` on the shared buff without copying the buff onto every user.
 */
export function consumeBuffPull(
  buffs: readonly ActiveBuff[],
  ctx: BuffEvalContext & { username: string; type?: TimedBuffType; onlyOneCredit?: boolean },
): { buffs: ActiveBuff[]; consumedCredit: boolean } {
  const u = ctx.username.toLowerCase();
  const live = pruneActiveBuffs(buffs, ctx);
  let consumedCredit = false;
  const out: ActiveBuff[] = [];

  for (const b of live) {
    if (ctx.type && b.type !== ctx.type) {
      out.push(b);
      continue;
    }
    if (!isBuffActiveFor(b, { ...ctx, username: u })) {
      if (b.scope === 'community') out.push(b);
      continue;
    }
    if (ctx.onlyOneCredit && consumedCredit) {
      out.push(b);
      continue;
    }

    if (b.scope === 'self' && b.pullsLeft !== undefined) {
      consumedCredit = true;
      const left = b.pullsLeft - 1;
      if (left > 0) out.push({ ...b, pullsLeft: left });
    } else if (b.scope === 'community' && b.pullsMax !== undefined) {
      consumedCredit = true;
      const used = (b.usedBy?.[u] ?? 0) + 1;
      out.push({ ...b, usedBy: { ...(b.usedBy ?? {}), [u]: used } });
    } else {
      out.push(b);
    }
  }
  return { buffs: out, consumedCredit };
}

/** Extra-pack credits `username` can still spend across personal + community buffs. */
export function extraPackCreditsLeft(
  personal: readonly ActiveBuff[],
  community: readonly ActiveBuff[],
  ctx: BuffEvalContext & { username: string },
): number {
  const u = ctx.username.toLowerCase();
  const evalCtx = { ...ctx, username: u };
  let sum = 0;
  for (const b of personal) {
    if (b.type === 'extra-pack' && isBuffActiveFor(b, evalCtx)) sum += b.pullsLeft ?? 1;
  }
  for (const b of community) {
    if (b.type === 'extra-pack' && isBuffActiveFor(b, evalCtx)) sum += b.pullsMax !== undefined ? Math.max(0, b.pullsMax - (b.usedBy?.[u] ?? 0)) : 1;
  }
  return sum;
}

/** Total extra pulls per stream granted to `username` by personal + community buffs. */
export function totalExtraPullsFromBuffs(
  personal: readonly ActiveBuff[],
  community: readonly ActiveBuff[],
  ctx: BuffEvalContext & { username: string },
): number {
  const u = ctx.username.toLowerCase();
  const evalCtx = { ...ctx, username: u };
  let sum = 0;
  for (const b of personal) {
    if (b.type === 'extra-pulls' && isBuffActiveFor(b, evalCtx)) sum += b.magnitude;
  }
  for (const b of community) {
    if (b.type === 'extra-pulls' && isBuffActiveFor(b, evalCtx)) sum += b.magnitude;
  }
  return sum;
}

/**
 * Draw-weight multiplier for rarities with RARITY_BOOST_MIN_STARS or more stars: 1 + 10% per magnitude point, summed over every
 * active rarity-boost (personal + community). Other rarities keep their weight, so their share of the draw drops.
 */
export function rarityBoostFactor(
  personal: readonly ActiveBuff[],
  community: readonly ActiveBuff[],
  ctx: BuffEvalContext & { username: string },
): number {
  const evalCtx = { ...ctx, username: ctx.username.toLowerCase() };
  let points = 0;
  for (const b of [...personal, ...community]) {
    if (b.type === 'rarity-boost' && isBuffActiveFor(b, evalCtx)) points += b.magnitude;
  }
  return 1 + points * RARITY_BOOST_STEP;
}

/** A card's draw weight after the boost. */
export const boostedWeight = (probability: number, stars: number, factor: number): number =>
  stars >= RARITY_BOOST_MIN_STARS ? probability * factor : probability;
