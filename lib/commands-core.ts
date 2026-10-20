// Chat commands for Mix It Up (ROADMAP 19.2), the pure part (client-safe, no database): the command shape, the action registry with
// each action's variables and sample values, matching a typed command to a configured one, and building the reply text.

export const MAX_COMMANDS = 30;
export const REPLY_MAX = 400;
export const COOLDOWN_MAX_S = 3600;

export type CommandActionId = 'showoff' | 'card-stats' | 'my-stats' | 'collection' | 'leaderboard' | 'pulls-left' | 'text' | 'use-trainer';
export type ErrorKind = 'notFound' | 'notOwned' | 'cooldown' | 'offline' | 'notTrainer' | 'alreadyActive';

export interface ChatCommand {
  id: string;
  /** Without the "!". */
  name: string;
  aliases: string[];
  enabled: boolean;
  action: CommandActionId;
  /** The reply template: {variables} of the action. */
  reply: string;
  errors: Partial<Record<ErrorKind, string>>;
  /** One run per this many seconds for everyone (0 = none). */
  cooldownS: number;
  /** One run per viewer per this many seconds (0 = none). */
  userCooldownS: number;
  liveOnly: boolean;
}

export interface ActionInfo {
  label: string;
  description: string;
  /** The variables the reply can use, with a sample value for the preview. */
  vars: { name: string; sample: string; help: string }[];
  /** Which error texts the command can show. */
  errors: ErrorKind[];
}

const v = (name: string, sample: string, help = '') => ({ name, sample, help });

export const COMMAND_ACTIONS: Record<CommandActionId, ActionInfo> = {
  showoff: {
    label: 'Show off a card',
    description: "Puts one of the viewer's own cards on stream (the overlay show-off). Args: a card name or number, optionally with a version.",
    vars: [v('username', 'cheesefan'), v('cardName', 'Gouda Goat'), v('variant', 'Shiny'), v('edition', '#12', 'Edition number, empty when the edition has none'), v('printNumber', '#1023381', 'Unique serial number'), v('points', '480'), v('stars', '4')],
    errors: ['notFound', 'notOwned', 'cooldown', 'offline'],
  },
  'card-stats': {
    label: 'Card stats',
    description: 'Public facts about one card of the running season. Args: a card name or number.',
    vars: [v('cardName', 'Gouda Goat'), v('number', '12'), v('stars', '4'), v('rarity', 'Epic'), v('pullChance', '1 in 40'), v('printsMade', '57'), v('collectors', '31'), v('topHolder', 'cheesefan', 'Private collectors show as "a private collector"'), v('firstPulledBy', 'brielover'), v('points', '120', 'One Regular edition'), v('yourPrints', '2'), v('url', 'https://cheesytcg.app/cards?card=12', 'The card dex link')],
    errors: ['notFound', 'cooldown', 'offline'],
  },
  'my-stats': {
    label: 'My stats',
    description: "The viewer's own standing, or @someone's when given in the args. Private collectors keep their stats private.",
    vars: [v('rank', '7'), v('score', '5230'), v('cards', '18'), v('totalCards', '25'), v('prints', '41'), v('progressBonus', '310'), v('bestEdition', 'Gouda Goat #3'), v('rarestPrint', 'Gouda Goat'), v('profileUrl', 'https://cheesytcg.app/u/cheesefan')],
    errors: ['notFound', 'cooldown', 'offline'],
  },
  collection: {
    label: 'Show collection',
    description: "Shows the viewer's collection on the overlay.",
    vars: [v('cards', '18'), v('prints', '41')],
    errors: ['cooldown', 'offline'],
  },
  leaderboard: {
    label: 'Leaderboard',
    description: 'The top three collectors.',
    vars: [v('first', 'cheesefan (5230)'), v('second', 'brielover (4100)'), v('third', 'goatgirl (3900)')],
    errors: ['notFound', 'cooldown', 'offline'],
  },
  'pulls-left': {
    label: 'Pulls left',
    description: 'With paid pulls on: what is left this stream and the price.',
    vars: [v('left', '2'), v('limit', '3'), v('price', '100'), v('currency', 'Brie Bucks')],
    errors: ['notFound', 'cooldown', 'offline'],
  },
  text: {
    label: 'Fixed text',
    description: 'Just answers with the reply text.',
    vars: [v('username', 'cheesefan'), v('args', 'hello')],
    errors: ['cooldown', 'offline'],
  },
  'use-trainer': {
    label: 'Use trainer card',
    description: "Uses one of the viewer's trainer cards to activate its buff. Args: a card name or number.",
    vars: [v('cardName', 'Pack Surge Card'), v('buff', 'Pack Surge'), v('until', 'for 1 stream'), v('left', '3', 'Pulls left this stream')],
    errors: ['notFound', 'notOwned', 'notTrainer', 'alreadyActive', 'cooldown', 'offline'],
  },
};

/** What a viewer reads in the FAQ about each action (the FAQ lists the enabled commands, so it cannot drift). */
export const FAQ_LINES: Record<CommandActionId, string> = {
  showoff: 'shows one of your cards on stream. Add a card name or number, and a version if you like.',
  'card-stats': 'tells you about a card: how rare it is, how many editions were made and how many collectors have it. Add a card name or number.',
  'my-stats': 'tells you your rank, score and progress. Add @someone to look at another collector.',
  collection: 'shows your collection on stream.',
  leaderboard: 'names the top three collectors.',
  'pulls-left': 'tells you how many paid pulls you have left this stream.',
  text: 'answers with a short message.',
  'use-trainer': 'uses a trainer card from your collection to activate its buff. Add a card name or number.',
};

export const ACTION_IDS = Object.keys(COMMAND_ACTIONS) as CommandActionId[];

export const ERROR_LABELS: Record<ErrorKind, string> = {
  notFound: 'Not found', notOwned: 'Not theirs', cooldown: 'On cooldown', offline: 'Stream offline',
  notTrainer: 'Not a trainer card', alreadyActive: 'Already active',
};
export const ERROR_DEFAULTS: Record<ErrorKind, string> = {
  notFound: 'I could not find that.', notOwned: 'You do not have that yet.', cooldown: 'Easy there, try again in a few seconds.', offline: 'That only works while the stream is live.',
  notTrainer: 'That card is not a trainer card.', alreadyActive: 'That buff is already active.',
};

export const DEFAULT_COMMANDS: ChatCommand[] = [
  { id: 'showoff', name: 'showoff', aliases: [], enabled: true, action: 'showoff', reply: 'Showing off your {variant} {cardName} {edition}!', errors: {}, cooldownS: 0, userCooldownS: 0, liveOnly: false },
  { id: 'stats', name: 'stats', aliases: [], enabled: true, action: 'card-stats', reply: '{cardName}: {stars} stars, {pullChance}, {printsMade} editions made, {collectors} collectors. {url}', errors: {}, cooldownS: 5, userCooldownS: 0, liveOnly: false },
];

/** Replaces {name} with its value; unknown placeholders are dropped. */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/** Chat-ready: no Markdown marks, spaces tidied, at most REPLY_MAX characters. */
export function tidyReply(text: string): string {
  const t = text.replace(/[*`~]/g, '').replace(/\s+/g, ' ').replace(/\s+([.,!?])/g, '$1').trim();
  return t.length > REPLY_MAX ? `${t.slice(0, REPLY_MAX - 1).trimEnd()}…` : t;
}

export const renderReply = (template: string, vars: Record<string, string>) => tidyReply(interpolate(template, vars));

export function sampleVars(action: CommandActionId): Record<string, string> {
  return Object.fromEntries(COMMAND_ACTIONS[action].vars.map(x => [x.name, x.sample]));
}

/** The word a viewer typed, without "!" and in lower case. */
export const commandWord = (raw: unknown): string => (typeof raw === 'string' ? raw.trim().replace(/^!+/, '').split(/\s+/)[0]?.toLowerCase() ?? '' : '');

/** The enabled command whose name or an alias is this word. */
export function matchCommand(commands: ChatCommand[], raw: unknown): ChatCommand | null {
  const w = commandWord(raw);
  if (!w) return null;
  return commands.find(c => c.enabled && (c.name === w || c.aliases.includes(w))) ?? null;
}

const clampInt = (x: unknown, max: number): number => {
  const n = Math.floor(Number(x));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};
const word = (x: unknown): string => String(x ?? '').trim().replace(/^!+/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);

/** Cleans whatever came from the builder form or KV. Names and aliases stay unique across commands. */
export function cleanCommands(raw: unknown): { ok: true; commands: ChatCommand[] } | { ok: false; message: string } {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > MAX_COMMANDS) return { ok: false, message: `At most ${MAX_COMMANDS} commands.` };
  const used = new Set<string>();
  const ids = new Set<string>();
  const out: ChatCommand[] = [];
  for (const r of list as Record<string, unknown>[]) {
    const name = word(r?.name);
    if (!name) return { ok: false, message: 'Every command needs a name (letters, numbers, - and _).' };
    const aliases = (Array.isArray(r.aliases) ? r.aliases : String(r.aliases ?? '').split(/[,\s]+/)).map(word).filter(Boolean);
    const words = [name, ...new Set(aliases.filter(a => a !== name))];
    const clash = words.find(w => used.has(w));
    if (clash) return { ok: false, message: `"!${clash}" is used by two commands.` };
    words.forEach(w => used.add(w));
    const action = ACTION_IDS.includes(r.action as CommandActionId) ? (r.action as CommandActionId) : 'text';
    const errs = (r.errors ?? {}) as Record<string, unknown>;
    const errors: ChatCommand['errors'] = {};
    for (const k of COMMAND_ACTIONS[action].errors) { const t = tidyReply(String(errs[k] ?? '')); if (t) errors[k] = t; }
    let id = typeof r.id === 'string' && /^[a-z0-9-]{1,40}$/.test(r.id) ? r.id : name;
    while (ids.has(id)) id = `${id}-2`;
    ids.add(id);
    out.push({
      id, name, aliases: words.slice(1), enabled: r.enabled !== false, action,
      reply: String(r.reply ?? '').replace(/\s+/g, ' ').trim().slice(0, REPLY_MAX * 2),
      errors, cooldownS: clampInt(r.cooldownS, COOLDOWN_MAX_S), userCooldownS: clampInt(r.userCooldownS, COOLDOWN_MAX_S), liveOnly: r.liveOnly === true,
    });
  }
  return { ok: true, commands: out };
}

/** Flattens the variables next to ok/message, so Mix It Up's "JSON to special identifiers" can read each one. */
export function flatReply(ok: boolean, message: string, vars: Record<string, string>): Record<string, unknown> {
  const reserved = new Set(['ok', 'message', 'vars']);
  return { ...Object.fromEntries(Object.entries(vars).filter(([k]) => !reserved.has(k))), ok, message, vars };
}

/** The args typed after the command, from whichever field the bot used. */
export function argsFrom(body: Record<string, unknown>): string {
  for (const k of ['args', 'allargs', 'arguments']) if (typeof body[k] === 'string') return (body[k] as string).trim().slice(0, 120);
  return '';
}
