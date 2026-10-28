// Live stats in OBS text sources (ROADMAP 57.4). Plain TypeScript, no Electron. Each stat can be mapped to one OBS text input the app read
// from OBS itself; the app then writes the stat's text with SetInputSettings (`text` only). Nothing is mapped until the streamer picks a
// source, and a stat that is not mapped never touches a source, so its text stays as it is.
import { happyText, type HappyFacts } from './happyhour';

export const STAT_IDS = ['packs', 'lastBig', 'topPuller', 'happyHour', 'goal', 'queue'] as const;
export type StatId = (typeof STAT_IDS)[number];
/** Stat to the OBS text source it is written to; '' = not mapped. */
export type StatMap = Record<StatId, string>;
export const STAT_LABELS: Record<StatId, string> = { packs: 'Packs this stream', lastBig: 'Last big pull', topPuller: 'Top puller', happyHour: 'Happy hour countdown', goal: 'Pack goal progress', queue: 'Queue length' };
export const noStatMap = (): StatMap => ({ packs: '', lastBig: '', topPuller: '', happyHour: '', goal: '', queue: '' });

/** The OBS input kinds that have a `text` setting (GDI+ and FreeType 2, every version). */
const TEXT_KINDS = new Set(['text_gdiplus', 'text_gdiplus_v2', 'text_gdiplus_v3', 'text_ft2_source', 'text_ft2_source_v2']);

/** The names of the text inputs in OBS's input list (`GetInputList`). */
export function textInputNames(inputs: readonly { inputName?: unknown; inputKind?: unknown }[]): string[] {
  return inputs.flatMap(i => (typeof i.inputName === 'string' && i.inputName && typeof i.inputKind === 'string' && TEXT_KINDS.has(i.inputKind) ? [i.inputName] : []));
}

/** The mapping read from disk or the window: known stats only, names up to 200 characters, and a source serves one stat (the first). */
export function cleanStatMap(raw: unknown): StatMap {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = noStatMap();
  const used = new Set<string>();
  for (const id of STAT_IDS) {
    const v = o[id];
    if (typeof v === 'string' && v !== '' && v.length <= 200 && !used.has(v)) { out[id] = v; used.add(v); }
  }
  return out;
}

/** A mapping from the window: a source that was not already mapped must be a text input OBS reported (`known`), else it is dropped. */
export function acceptStatMap(raw: unknown, known: readonly string[], current: StatMap): StatMap {
  const next = cleanStatMap(raw);
  for (const id of STAT_IDS) if (next[id] && next[id] !== current[id] && !known.includes(next[id])) next[id] = '';
  return next;
}

/** What the site last said (`stats` action). `null` until it has answered once: nothing is written before that. */
export interface StatFacts {
  packs?: number;
  lastBig?: { username: string; cardName: string } | null;
  topPuller?: { username: string; packs: number } | null;
  /** The pack goal's finished text from the site ("Label: 37 / 50"); null = no goal for this stream (ROADMAP 57.5). */
  goal?: string | null;
  queue?: number;
}

/** The site's answer, checked: numbers must be numbers and names text; anything else is left out (so nothing is written for it). */
export function cleanStatFacts(raw: unknown): StatFacts {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : undefined);
  const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, 80) : undefined);
  const out: StatFacts = {};
  const packs = count(o.packs);
  if (packs !== undefined) out.packs = packs;
  const queue = count(o.queue);
  if (queue !== undefined) out.queue = queue;
  const big = o.lastBig as { username?: unknown; cardName?: unknown } | null | undefined;
  if (big === null) out.lastBig = null;
  else if (text(big?.username) !== undefined && text(big?.cardName) !== undefined) out.lastBig = { username: text(big!.username)!, cardName: text(big!.cardName)! };
  if (o.goal === null) out.goal = null;
  else if (text(o.goal) !== undefined) out.goal = text(o.goal)!;
  const top = o.topPuller as { username?: unknown; packs?: unknown } | null | undefined;
  if (top === null) out.topPuller = null;
  else if (text(top?.username) !== undefined && count(top?.packs) !== undefined) out.topPuller = { username: text(top!.username)!, packs: count(top!.packs)! };
  return out;
}

/** The text of one stat, or null when the site has not said yet. A stat with nothing to show gives '' (the source is cleared). */
export function statText(id: StatId, facts: StatFacts, happy: HappyFacts | null, now: number): string | null {
  switch (id) {
    case 'packs': return typeof facts.packs === 'number' ? `Packs: ${facts.packs}` : null;
    case 'lastBig': return facts.lastBig === undefined ? null : facts.lastBig ? `${facts.lastBig.username}: ${facts.lastBig.cardName}` : '';
    case 'topPuller': return facts.topPuller === undefined ? null : facts.topPuller ? `Top puller: ${facts.topPuller.username} (${facts.topPuller.packs})` : '';
    case 'goal': return facts.goal === undefined ? null : (facts.goal ?? '');
    case 'queue': return typeof facts.queue === 'number' ? `Queue: ${facts.queue}` : null;
    case 'happyHour': return happyText(happy, now);
  }
}

/** Source name to text for every mapped stat that has a value. */
export function wantedTexts(map: StatMap, facts: StatFacts | null, happy: HappyFacts | null, now: number): Record<string, string> {
  const out: Record<string, string> = {};
  if (!facts) return out;
  for (const id of STAT_IDS) {
    const text = map[id] ? statText(id, facts, happy, now) : null;
    if (text !== null) out[map[id]] = text.slice(0, 200);
  }
  return out;
}

/** The stats the site must send for this mapping (the happy hour comes with every answer). */
export const siteStats = (map: StatMap): StatId[] => STAT_IDS.filter(id => id !== 'happyHour' && map[id]);

/**
 * Whether to ask the site for stats (ROADMAP 57.4, 57.13b) and for which: while OBS is connected and a stat is mapped to a text source, and while a Stream Deck
 * Stat key shows one (`deck`). `obs` says the OBS part is on (the app then also writes the texts). Nothing else polls.
 */
export function statsPlan(map: StatMap, obsConnected: boolean, deck: readonly StatId[]): { poll: boolean; obs: boolean; ask: StatId[] } {
  const obs = obsConnected && STAT_IDS.some(id => map[id]);
  return { poll: obs || deck.length > 0, obs, ask: STAT_IDS.filter(id => id !== 'happyHour' && ((obs && map[id]) || deck.includes(id))) };
}

/**
 * Writes texts to OBS: a source is written only when its text differs from the one last accepted, and at most once per `minMs`. A write
 * that fails is tried again on a later `push` (at least `minMs` later), never in a loop. `push` is called about once a second.
 */
export class TextWriter {
  private sent = new Map<string, string>();
  private tried = new Map<string, number>();
  private busy = new Set<string>();

  constructor(private set: (source: string, text: string) => Promise<void>, private minMs = 1000) {}

  /** Forget what OBS holds (OBS reconnected, or the settings changed): every wanted text is written again. */
  reset(): void { this.sent.clear(); }

  push(wanted: Record<string, string>, now = Date.now()): void {
    for (const [source, text] of Object.entries(wanted)) {
      if (this.busy.has(source) || this.sent.get(source) === text || now - (this.tried.get(source) ?? -Infinity) < this.minMs) continue;
      this.tried.set(source, now);
      this.busy.add(source);
      void this.set(source, text).then(() => { this.sent.set(source, text); }, () => undefined).finally(() => { this.busy.delete(source); });
    }
  }
}
