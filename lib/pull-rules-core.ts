// Mix It Up commands and OBS actions on big pulls (ROADMAP 55.6d, 55.8), the pure part: the rule shape, cleaning and matching. No database, no network.
// lib/mixitup.ts (`firePullRules`) reads the saved rules and queues the job; the Mix It Up page edits them.
import { getRarity } from './rarity';
import { VARIANTS, VARIANT_LABELS } from './variants';
import type { Variant } from './types';
import type { PullFeed } from './bridge-core';

export const RULES_MAX = 10;
export const REVEAL_MAX_MS = 15_000;
const REVEAL_DEFAULT_MS = 3000;

/** The overlay's `revealInMs` (save to card reveal), clamped to 0..15 s; an old cached overlay sends none, so assume a classic opening. */
export const revealDelay = (raw: unknown): number =>
  typeof raw === 'number' && Number.isFinite(raw) ? Math.min(REVEAL_MAX_MS, Math.max(0, Math.round(raw))) : REVEAL_DEFAULT_MS;

export const SCENE_SECS_DEFAULT = 8;
export const SCENE_SECS_MAX = 60;

/** What a rule does in OBS (55.8). `scene` and `source` are names TCG Bridge reported; the scene is left again after `sceneSecs`. */
export interface PullObs { clip?: true; scene?: string; sceneSecs?: number; source?: string }

/** `when` holds the conditions a pull must meet (all of the ones that are set). No condition at all means every pull. */
export interface PullRule {
  id: string;
  on: boolean;
  when: { minRarity?: number; variants?: Variant[]; newToDex?: boolean };
  /** A Mix It Up command id from the list TCG Bridge reported. Empty when the rule only does OBS actions. */
  commandId: string;
  obs?: PullObs;
  /** A chat line (55.10), said when the card is revealed. Variables: SHOUT_VARS. */
  say?: string;
}

export const SHOUT_VARS = ['viewer', 'card', 'rarity', 'edition'] as const;
export const SHOUT_MAX = 300;
const sayOf = (v: unknown): string => (typeof v === 'string' ? v.trim().slice(0, SHOUT_MAX) : '');
/** The shout with its variables filled in. {edition} is "#12" (the copy number) or empty when the pull has none. */
export const shoutText = (say: string, pull: PullFacts): string =>
  say.replace(/\{(viewer|card|rarity|edition)\}/g, (_, k: string) => k === 'viewer' ? pull.username : k === 'card' ? pull.cardName : k === 'rarity' ? getRarity(pull.stars)?.label ?? '' : pull.serial ? `#${pull.serial}` : '').replace(/\s+/g, ' ').trim();

const hasObs = (o: PullObs | undefined): o is PullObs => !!o && (!!o.clip || !!o.scene || !!o.source);
const secsOf = (v: unknown): number => (Number.isInteger(v) && (v as number) >= 1 ? Math.min(SCENE_SECS_MAX, v as number) : SCENE_SECS_DEFAULT);
/** The OBS part of a stored or posted rule, keeping only names that pass `ok`. */
function readObs(raw: unknown, ok: (kind: 'scene' | 'source', name: string) => boolean): PullObs | undefined {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: PullObs = {};
  if (o.clip === true) out.clip = true;
  if (typeof o.scene === 'string' && o.scene && ok('scene', o.scene)) { out.scene = o.scene; out.sceneSecs = secsOf(o.sceneSecs); }
  if (typeof o.source === 'string' && o.source && ok('source', o.source)) out.source = o.source;
  return hasObs(out) ? out : undefined;
}

/** What a saved pull is, as far as the rules care. `isNew` = the first copy of this card the viewer has (new to their dex). */
export interface PullFacts { username: string; cardName: string; stars: number; variant: Variant; isNew: boolean; serial?: number; imageUrl?: string }

/** The card as the app's live feed window shows it (ROADMAP 55.11). */
export const feedOf = (p: PullFacts): PullFeed => ({ viewer: p.username, card: p.cardName, rarity: getRarity(p.stars)?.label ?? '', stars: p.stars, variant: VARIANT_LABELS[p.variant], ...(p.serial ? { serial: p.serial } : {}), ...(p.imageUrl ? { image: p.imageUrl } : {}) });

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The first switched-on rule the pull meets, or null. */
export function matchRule(rules: readonly PullRule[], pull: PullFacts): PullRule | null {
  for (const r of rules) {
    if (!r.on) continue;
    const w = r.when;
    if (w.minRarity !== undefined && pull.stars < w.minRarity) continue;
    if (w.variants?.length && !w.variants.includes(pull.variant)) continue;
    if (w.newToDex && !pull.isNew) continue;
    return r;
  }
  return null;
}

/** The arguments Mix It Up's command gets: the viewer, the card, the rarity and the variant, as words ($arg1text to $arg4text). */
export const pullArgs = (pull: PullFacts): string[] => [pull.username, pull.cardName, getRarity(pull.stars)?.label ?? '', VARIANT_LABELS[pull.variant]];

/** What the Test button sends. */
export const SAMPLE_PULL: PullFacts = { username: 'cheesyviewer', cardName: 'Gouda Goat', stars: 4, variant: 'shiny', isNew: true };

/** A rule that was stored, or null when it is unusable (junk in KV never reaches a pull). Lenient on purpose; saving uses cleanRuleInput. */
function readRule(raw: unknown): PullRule | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const w = (r.when && typeof r.when === 'object' ? r.when : {}) as Record<string, unknown>;
  const obs = readObs(r.obs, () => true);
  const say = sayOf(r.say);
  if (typeof r.id !== 'string' || !ID.test(r.id) || typeof r.commandId !== 'string' || !(GUID.test(r.commandId) || (r.commandId === '' && (obs || say)))) return null;
  const when: PullRule['when'] = {};
  if (typeof w.minRarity === 'number' && Number.isInteger(w.minRarity) && w.minRarity >= 1 && w.minRarity <= 5) when.minRarity = w.minRarity;
  if (Array.isArray(w.variants)) {
    const v = VARIANTS.filter(x => (w.variants as unknown[]).includes(x));
    if (v.length) when.variants = v;
  }
  if (w.newToDex === true) when.newToDex = true;
  return { id: r.id, on: r.on === true, when, commandId: r.commandId.toLowerCase(), ...(obs ? { obs } : {}), ...(say ? { say } : {}) };
}

/** Whatever is stored, as at most RULES_MAX usable rules. */
export function normalizeRules(raw: unknown): PullRule[] {
  return (Array.isArray(raw) ? raw : []).map(readRule).filter((r): r is PullRule => r !== null).slice(0, RULES_MAX);
}

/** The rules from the Big pulls form: fields `rule_<n>_id | on | min | variants | new | command | clip | scene | secs | source | say`, n from 0. A row with no command and no OBS action is an empty row and is skipped. */
export function rulesFromForm(form: { get(k: string): unknown; getAll(k: string): unknown[] }): unknown[] {
  const out: unknown[] = [];
  for (let i = 0; i < RULES_MAX + 1; i++) {
    if (form.get(`rule_${i}_id`) === null) break;
    const command = String(form.get(`rule_${i}_command`) ?? '').trim();
    const obs = { clip: form.get(`rule_${i}_clip`) === 'on', scene: String(form.get(`rule_${i}_scene`) ?? ''), sceneSecs: Number(form.get(`rule_${i}_secs`)), source: String(form.get(`rule_${i}_source`) ?? '') };
    const say = String(form.get(`rule_${i}_say`) ?? '');
    if (!command && !obs.clip && !obs.scene && !obs.source && !say.trim()) continue;
    const min = Number(form.get(`rule_${i}_min`));
    out.push({
      id: String(form.get(`rule_${i}_id`) || '') || `r${Date.now().toString(36)}${i}`,
      on: form.get(`rule_${i}_on`) === 'on',
      when: {
        ...(min >= 1 ? { minRarity: min } : {}),
        variants: form.getAll(`rule_${i}_variants`).map(String),
        newToDex: form.get(`rule_${i}_new`) === 'on',
      },
      commandId: command,
      obs,
      say,
    });
  }
  return out;
}

/**
 * Checks the rules a staff member saves. `reported` is the command ids TCG Bridge last reported, `obsNames` the scene and source names it
 * last reported. A command or OBS name must be in its list; while a list is empty (the app is off for a moment) a rule may keep what it
 * already had, `existing`, but nothing new is accepted.
 */
export function cleanRulesInput(raw: unknown[], reported: readonly string[], existing: readonly PullRule[], obsNames: { scenes: readonly string[]; sources: readonly string[] } = { scenes: [], sources: [] }): { ok: true; rules: PullRule[] } | { ok: false; message: string } {
  if (raw.length > RULES_MAX) return { ok: false, message: `At most ${RULES_MAX} rules.` };
  const known = new Set((reported.length ? reported : existing.map(r => r.commandId)).map(x => x.toLowerCase()));
  const keptObs = (k: 'scene' | 'source') => existing.map(r => r.obs?.[k]).filter((x): x is string => !!x);
  const knownObs = { scene: new Set(obsNames.scenes.length ? obsNames.scenes : keptObs('scene')), source: new Set(obsNames.sources.length ? obsNames.sources : keptObs('source')) };
  const rules: PullRule[] = [];
  for (const [i, item] of raw.entries()) {
    const n = `Rule ${i + 1}`;
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const w = (r.when && typeof r.when === 'object' ? r.when : {}) as Record<string, unknown>;
    const id = typeof r.id === 'string' && ID.test(r.id) ? r.id : '';
    if (!id) return { ok: false, message: `${n} has no id.` };
    if (rules.some(x => x.id === id)) return { ok: false, message: `${n} repeats another rule.` };
    const command = typeof r.commandId === 'string' ? r.commandId.trim().toLowerCase() : '';
    const obs = readObs(r.obs, (k, name) => knownObs[k].has(name));
    const o = (r.obs && typeof r.obs === 'object' ? r.obs : {}) as Record<string, unknown>;
    if ((typeof o.scene === 'string' && o.scene && !obs?.scene) || (typeof o.source === 'string' && o.source && !obs?.source)) return { ok: false, message: `${n}: that OBS scene or source is not in the list TCG Bridge reported.` };
    const say = sayOf(r.say);
    if (!command && (obs || say)) { /* OBS actions or a chat line only */ } else if (!command || !known.has(command)) return { ok: false, message: reported.length || command ? `${n}: that Mix It Up command is not in the list TCG Bridge reported.` : `${n}: pair TCG Bridge to choose a command.` };
    const when: PullRule['when'] = {};
    if (w.minRarity !== undefined && w.minRarity !== null) {
      const m = Number(w.minRarity);
      if (!Number.isInteger(m) || m < 1 || m > 5) return { ok: false, message: `${n}: the rarity must be between 1 and 5 stars.` };
      if (m > 1) when.minRarity = m; // at least 1 star is every card
    }
    if (Array.isArray(w.variants) && w.variants.length) {
      if (!w.variants.every(v => (VARIANTS as readonly unknown[]).includes(v))) return { ok: false, message: `${n}: unknown card version.` };
      when.variants = VARIANTS.filter(v => (w.variants as unknown[]).includes(v));
    }
    if (w.newToDex === true) when.newToDex = true;
    rules.push({ id, on: r.on === true, when, commandId: command, ...(obs ? { obs } : {}), ...(say ? { say } : {}) });
  }
  return { ok: true, rules };
}
