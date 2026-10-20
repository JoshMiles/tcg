import { kv, inSandbox } from './db';
import { getActiveSeasonWithPacks, getCollection } from './kv';
import { getHiddenUsers } from './user-admin';
import { getSeasonOverview } from './site-data';
import { ownersByCard } from './site-data';
import { collectionBonuses, copyPoints, pointsFor } from './leaderboard';
import { countVariants, decodeEntry, VARIANTS, VARIANT_LABELS } from './variants';
import { resolveCard, type ShowCard } from './showoff';
import { prepareShowOff } from './showoff-prepare';
import { getOwnerCopies, mintedCounts, pageCopies } from './serials';
import { getRarity } from './rarity';
import { enqueueEvent } from './webhooks';
import { recordActivity } from './activity';
import { liveGate } from './overlay-settings';
import { getLiveStatus } from './twitch-live';
import { currentStreamKey, getMixItUpSettings, pullsUsedThisStream, type MixItUpLogEntry } from './mixitup';
import { pullRole, roleLimitOf } from './mixitup-core';
import { getStreamBuff, getUserPullLimit } from './pull-limit';
import { effectiveLimit, streamBuffAmount } from './pull-limit-core';
import { SITE_URL } from './site';
import { profileHref } from './profile-url';
import {
  DEFAULT_COMMANDS, ERROR_DEFAULTS, cleanCommands, interpolate, matchCommand, renderReply, tidyReply,
  type ChatCommand, type ErrorKind,
} from './commands-core';
import { getBuffDef, useTrainerCard, getUserBuffs, getCommunityBuffs, currentBuffStreamKey, extraPullsFromBuffs } from './buffs';
import { describeBuffDef, isBuffActiveFor } from './buffs-core';

// Chat commands (ROADMAP 19.2): the configured commands in KV and the code that runs one. The webhook (`/api/webhooks/command`) and the
// builder's Try it box both call runCommand; Try it passes `dry`, which checks everything but queues no overlay event and spends no cooldown.

const KEY = 'mixitup:commands';
const STATS_KEY = 'mixitup:cmdstats';
const LOG_KEY = 'mixitup:cmdlog';

/** The saved commands; the two defaults (!showoff and !stats) are created the first time anything asks. */
export async function getCommands(): Promise<ChatCommand[]> {
  const stored = await kv.get<unknown>(KEY).catch(() => null);
  if (Array.isArray(stored)) {
    const r = cleanCommands(stored);
    return r.ok ? r.commands : [];
  }
  const seeded = cleanCommands(DEFAULT_COMMANDS);
  const commands = seeded.ok ? seeded.commands : [];
  await kv.set(KEY, commands).catch(() => {});
  return commands;
}

export async function saveCommands(commands: ChatCommand[]): Promise<void> {
  await kv.set(KEY, commands);
}

export type CommandStats = Record<string, { count: number; last: number }>;
export async function getCommandStats(): Promise<CommandStats> {
  return (await kv.get<CommandStats>(STATS_KEY).catch(() => null)) ?? {};
}

/** The last 20 command runs, as Log rows. */
export async function getCommandLog(): Promise<MixItUpLogEntry[]> {
  return (await kv.lrange<MixItUpLogEntry>(LOG_KEY, 0, 19).catch(() => null)) ?? [];
}

async function noteRun(c: ChatCommand, username: string, ok: boolean, detail: string): Promise<void> {
  try {
    await kv.lpush(LOG_KEY, { at: Date.now(), username, what: 'command', ok, detail: `!${c.name} ${detail}`.trim() });
    await kv.ltrim(LOG_KEY, 0, 19);
    const stats = await getCommandStats();
    stats[c.id] = { count: (stats[c.id]?.count ?? 0) + 1, last: Date.now() };
    await kv.set(STATS_KEY, stats);
  } catch { /* the log never breaks a command */ }
}

export interface RunInput { command: string; username: string; args: string; dry?: boolean; role?: unknown }
export interface RunOutput {
  /** False for an unknown or switched-off command (then `message` is empty and the bot says nothing). */
  known: boolean;
  ok: boolean;
  message: string;
  vars: Record<string, string>;
}

type Fail = { fail: true; kind?: ErrorKind; message: string; vars?: Record<string, string> };
type Done = { fail?: false; vars: Record<string, string> };
const fail = (message: string, kind?: ErrorKind, vars?: Record<string, string>): Fail => ({ fail: true, kind, message, vars });

interface Ctx { user: string; args: string; dry: boolean; sandbox: boolean; role?: unknown }

async function season() {
  const active = await getActiveSeasonWithPacks();
  if (!active) return null;
  const overview = await getSeasonOverview(active.season);
  const collection = await getCollection(active.season.collectionName);
  return { season: active.season, overview, collection };
}

const NO_SEASON = 'There is no season running right now.';
const asCards = (cards: { number: number; name: string; stars: number }[]): ShowCard[] => cards.map(c => ({ number: c.number, name: c.name, stars: c.stars }));

const KIND_OF: Record<string, ErrorKind | undefined> = { none: 'notFound', ambiguous: 'notFound', 'nothing-to-show': 'notFound', 'not-owned': 'notOwned', cooldown: 'cooldown' };

async function doShowOff(c: Ctx): Promise<Done | Fail> {
  if (await liveGate('collection')) return fail(ERROR_DEFAULTS.offline, 'offline');
  const r = await prepareShowOff(c.user, c.args, { dry: c.dry });
  if (!r.ok) return fail(r.message, KIND_OF[r.error]);
  const { plan } = r;
  const s = await season();
  const card = s?.overview.cards.find(x => x.number === plan.cardNumber);
  const cv = s?.overview.values.cards.get(plan.cardNumber);
  const points = cv && s ? Math.round(copyPoints(cv, plan.variant, plan.serial, s.overview.values.settings)) : 0;
  if (!c.dry && !c.sandbox) {
    await enqueueEvent({
      id: crypto.randomUUID(), type: 'card', username: plan.username, queuedAt: Date.now(),
      cardNumber: plan.cardNumber, variant: plan.variant, serial: plan.serial, serialMult: plan.serialMult, uid: plan.uid,
    });
    await recordActivity({ type: 'trigger', kind: 'card', username: plan.username, cardName: plan.cardName });
  }
  return { vars: {
    username: plan.username, cardName: plan.cardName, variant: plan.variant === 'regular' ? '' : VARIANT_LABELS[plan.variant],
    edition: plan.serial ? `#${plan.serial}` : '', printNumber: plan.uid ? `#${plan.uid}` : '', points: String(points), stars: String(card?.stars ?? ''),
  } };
}

const PRIVATE = 'a private collector';

async function doCardStats(c: Ctx): Promise<Done | Fail> {
  const s = await season();
  if (!s) return fail(NO_SEASON);
  const text = c.args.trim();
  if (!text) return fail('Which card? Try the name or the number.', 'notFound');
  const num = /^#?(\d{1,6})$/.exec(text);
  const all = asCards(s.overview.cards);
  const r = resolveCard({ number: num ? Number(num[1]) : null, name: num ? '' : text, variant: null }, all, new Set(all.map(x => x.number)), () => null);
  if (!r.ok) return fail(r.reason === 'ambiguous' ? r.message : `I could not find a card called "${text}".`, 'notFound');
  const n = r.card.number;
  const card = s.overview.cards.find(x => x.number === n)!;
  const cv = s.overview.values.cards.get(n);
  const hidden = await getHiddenUsers();

  const minted = await mintedCounts(s.season.collectionName).catch(() => new Map<number, number>());
  let made = 0;
  for (const [entry, count] of minted) if (decodeEntry(entry).cardNumber === n) made += count;
  if (made === 0) made = cv?.copies ?? 0;

  const top = ownersByCard(s.collection, s.overview.values, 1).get(n)?.top[0];
  const collectors = ownersByCard(s.collection, s.overview.values, 1, hidden).get(n)?.collectors ?? 0;

  let first = 'nobody yet';
  try {
    const firsts = (await Promise.all(VARIANTS.map(v => pageCopies(s.season.collectionName, n, v, 0, 1, true)))).flatMap(p => p.copies);
    const oldest = firsts.sort((a, b) => a.at - b.at)[0];
    if (oldest) {
      const who = (oldest.ev.find(e => e.type === 'minted')?.who ?? oldest.owner ?? '').toLowerCase();
      if (who) first = hidden.has(who) ? PRIVATE : who;
    }
  } catch { /* the ledger is not tracking this season */ }

  const mine = (s.collection[c.user] ?? []).filter(e => decodeEntry(e).cardNumber === n).length;
  return { vars: {
    cardName: card.name, number: String(n), stars: String(card.stars), rarity: getRarity(card.stars)?.label ?? '',
    pullChance: cv && cv.pullRate > 0 ? `1 in ${Math.max(1, Math.round(1 / cv.pullRate)).toLocaleString('en-US')}` : 'never',
    printsMade: String(made), collectors: String(collectors),
    topHolder: top ? (hidden.has(top.username) ? PRIVATE : top.username) : 'nobody yet',
    firstPulledBy: first, points: String(Math.round(cv?.values.regular ?? 0)), yourPrints: String(mine),
    url: `${SITE_URL}/cards?card=${n}&season=${encodeURIComponent(s.season.id)}`,
  } };
}

async function doMyStats(c: Ctx): Promise<Done | Fail> {
  const s = await season();
  if (!s) return fail(NO_SEASON);
  const asked = c.args.trim().split(/\s+/)[0]?.replace(/^@/, '').toLowerCase() ?? '';
  const target = asked || c.user;
  const hidden = await getHiddenUsers();
  if (target !== c.user && hidden.has(target)) return fail('This collector keeps their stats private.');
  const entries = s.collection[target] ?? [];
  if (entries.length === 0) return fail(target === c.user ? 'You have no cards yet.' : `${target} has no cards yet.`, 'notFound');
  const values = s.overview.values;
  const held = pointsFor(values, entries, target);
  const b = collectionBonuses(values, held.unique.size);
  const score = Math.round(held.points + b.completion + b.set);
  const rank = s.overview.rows.filter(r => r.score > held.points + b.completion + b.set).length + 1;

  let best = 'none yet';
  try {
    const copies = (await getOwnerCopies(s.season.collectionName, target)).sort((a, z) => a.n - z.n);
    if (copies[0]) best = `${s.overview.cards.find(x => x.number === copies[0].card)?.name ?? 'a card'} #${copies[0].n}`;
  } catch { /* not tracked */ }
  let rarest = '';
  let rarestRate = Infinity;
  for (const cardNumber of held.unique) {
    const rate = values.cards.get(cardNumber)?.pullRate ?? Infinity;
    if (rate < rarestRate) { rarestRate = rate; rarest = s.overview.cards.find(x => x.number === cardNumber)?.name ?? ''; }
  }
  return { vars: {
    rank: String(rank), score: String(score), cards: String(held.unique.size), totalCards: String(values.totalCards), prints: String(held.copies),
    progressBonus: String(Math.round(b.completion + b.set)), bestEdition: best, rarestPrint: rarest || 'none yet', profileUrl: `${SITE_URL}${profileHref(target)}`,
  } };
}

async function doCollection(c: Ctx): Promise<Done | Fail> {
  if (await liveGate('collection')) return fail(ERROR_DEFAULTS.offline, 'offline');
  const s = await season();
  const entries = s?.collection[c.user] ?? [];
  if (!c.dry && !c.sandbox) {
    await enqueueEvent({ id: crypto.randomUUID(), type: 'collection', username: c.user, queuedAt: Date.now() });
    await recordActivity({ type: 'trigger', kind: 'collection', username: c.user });
  }
  return { vars: { cards: String(countVariants(entries).size), prints: String(entries.length) } };
}

async function doLeaderboard(): Promise<Done | Fail> {
  const s = await season();
  if (!s) return fail(NO_SEASON);
  const rows = s.overview.rows;
  if (rows.length === 0) return fail('Nobody is on the leaderboard yet.', 'notFound');
  const at = (i: number) => (rows[i] ? `${rows[i].username} (${Math.round(rows[i].score).toLocaleString('en-US')})` : '-');
  return { vars: { first: at(0), second: at(1), third: at(2) } };
}

async function doPullsLeft(c: Ctx): Promise<Done | Fail> {
  const m = await getMixItUpSettings();
  if (!m.enabled) return fail('Paid pulls are off right now.', 'notFound');
  const extra = streamBuffAmount(await getStreamBuff(), await currentStreamKey()) + await extraPullsFromBuffs(c.user);
  const eff = effectiveLimit(roleLimitOf(m, pullRole(c.role, c.user)), await getUserPullLimit(c.user), Date.now(), extra);
  const used = await pullsUsedThisStream(c.user);
  return { vars: {
    left: eff.limit > 0 ? String(Math.max(0, eff.limit - used)) : 'unlimited', limit: eff.limit > 0 ? String(eff.limit) : 'unlimited',
    price: String(m.cost), currency: m.currency,
  } };
}

async function doUseTrainer(c: Ctx): Promise<Done | Fail> {
  const s = await season();
  if (!s) return fail(NO_SEASON);
  const text = c.args.trim();
  if (!text) return fail('Which trainer card? Try the name or the number.', 'notFound');
  const num = /^#?(\d{1,6})$/.exec(text);
  const all = asCards(s.overview.cards);
  const r = resolveCard({ number: num ? Number(num[1]) : null, name: num ? '' : text, variant: null }, all, new Set(all.map(x => x.number)), () => null);
  if (!r.ok) return fail(r.reason === 'ambiguous' ? r.message : `I could not find a card called "${text}".`, 'notFound');
  const n = r.card.number;
  const card = s.overview.cards.find(x => x.number === n)!;

  if (card.kind !== 'trainer' || !card.buffId) {
    return fail(ERROR_DEFAULTS.notTrainer, 'notTrainer', { cardName: card.name, args: c.args });
  }

  const owned = s.collection[c.user] ?? [];
  const regularCount = owned.filter(e => decodeEntry(e).cardNumber === n && decodeEntry(e).variant === 'regular').length;
  if (regularCount === 0) {
    return fail(ERROR_DEFAULTS.notOwned, 'notOwned', { cardName: card.name, args: c.args });
  }

  const buffDef = await getBuffDef(card.buffId);
  if (!buffDef) {
    return fail(ERROR_DEFAULTS.notTrainer, 'notTrainer', { cardName: card.name, args: c.args });
  }

  const durSummary = describeBuffDef(buffDef);

  if (buffDef.stack === 'reject') {
    const stream = await currentBuffStreamKey().catch(() => undefined);
    const evalCtx = { now: Date.now(), streamKey: stream, seasonId: s.season.id, username: c.user };
    const userBuffs = await getUserBuffs(c.user);
    const commBuffs = await getCommunityBuffs();
    const active = userBuffs.some(b => b.buffId === buffDef.id && isBuffActiveFor(b, evalCtx)) ||
                   commBuffs.some(b => b.buffId === buffDef.id && isBuffActiveFor(b, evalCtx));
    if (active) return fail(ERROR_DEFAULTS.alreadyActive, 'alreadyActive', { cardName: card.name, buff: buffDef.name, until: durSummary });
  }

  if (!c.dry) {
    const res = await useTrainerCard(c.user, n, s.season.id);
    if (!res.ok) {
      const err = res.error || 'Failed to use trainer card.';
      if (res.code === 'already_active') return fail(err, 'alreadyActive', { cardName: card.name, buff: buffDef.name, until: durSummary });
      if (res.code === 'favourite') return fail(err, 'notOwned', { cardName: card.name, buff: buffDef.name });
      return fail(err, undefined, { cardName: card.name, buff: buffDef.name });
    }
  }

  let left = 'unlimited';
  const m = await getMixItUpSettings();
  if (m.enabled) {
    const extra = streamBuffAmount(await getStreamBuff(), await currentStreamKey()) + await extraPullsFromBuffs(c.user);
    const eff = effectiveLimit(roleLimitOf(m, pullRole(c.role, c.user)), await getUserPullLimit(c.user), Date.now(), extra);
    const used = await pullsUsedThisStream(c.user);
    if (eff.limit > 0) left = String(Math.max(0, eff.limit - used));
  }

  return {
    vars: {
      cardName: card.name,
      buff: buffDef.name,
      until: durSummary,
      left,
    },
  };
}

const doText = async (c: Ctx): Promise<Done> => ({ vars: { username: c.user, args: c.args } });

/**
 * Runs one chat command. Unknown or switched-off commands are `known: false` (the webhook answers with an empty message).
 * `dry` (the builder's Try it): the same checks and reply, but no overlay event, no cooldown spent, no log line.
 */
export async function runCommand(input: RunInput, commands?: ChatCommand[]): Promise<RunOutput> {
  const list = commands ?? await getCommands();
  const cmd = matchCommand(list, input.command);
  if (!cmd) return { known: false, ok: false, message: '', vars: {} };
  const user = input.username.toLowerCase().replace(/^@/, '').trim();
  const ctx: Ctx = { user, args: input.args, dry: !!input.dry, sandbox: await inSandbox(), role: input.role };
  const base = { username: user, args: input.args };
  const refuse = async (kind: ErrorKind | undefined, message: string, extraVars?: Record<string, string>): Promise<RunOutput> => {
    const text = tidyReply(interpolate((kind && cmd.errors[kind]) || message, { ...base, ...extraVars }));
    if (!ctx.dry) await noteRun(cmd, user, false, `refused: ${kind ?? 'error'}`);
    return { known: true, ok: false, message: text, vars: extraVars ?? {} };
  };

  if (cmd.liveOnly) {
    const live = await getLiveStatus().catch(() => null);
    if (live && !live.live) return refuse('offline', ERROR_DEFAULTS.offline);
  }
  const cdKey = `cmd:cd:${cmd.id}`;
  const ucdKey = `cmd:ucd:${cmd.id}:${user}`;
  const cooling = (cmd.cooldownS > 0 && (await kv.get(cdKey).catch(() => null)) !== null) || (cmd.userCooldownS > 0 && (await kv.get(ucdKey).catch(() => null)) !== null);
  if (cooling && !ctx.dry) return refuse('cooldown', ERROR_DEFAULTS.cooldown);

  let r: Done | Fail;
  try {
    r = cmd.action === 'showoff' ? await doShowOff(ctx)
      : cmd.action === 'card-stats' ? await doCardStats(ctx)
      : cmd.action === 'my-stats' ? await doMyStats(ctx)
      : cmd.action === 'collection' ? await doCollection(ctx)
      : cmd.action === 'leaderboard' ? await doLeaderboard()
      : cmd.action === 'pulls-left' ? await doPullsLeft(ctx)
      : cmd.action === 'use-trainer' ? await doUseTrainer(ctx)
      : await doText(ctx);
  } catch {
    r = fail('Something went wrong, try again in a moment.');
  }
  if (r.fail) return refuse(r.kind, r.message, r.vars);

  if (!ctx.dry) {
    if (cmd.cooldownS > 0) await kv.set(cdKey, 1, { ex: cmd.cooldownS }).catch(() => {});
    if (cmd.userCooldownS > 0) await kv.set(ucdKey, 1, { ex: cmd.userCooldownS }).catch(() => {});
    await noteRun(cmd, user, true, input.args ? `"${input.args.slice(0, 40)}"` : '');
  }
  return { known: true, ok: true, message: renderReply(cmd.reply, r.vars), vars: r.vars };
}
