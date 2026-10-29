// What each key looks like and what it asks for (ROADMAP 57.13a). Pure: no Stream Deck SDK, so bridge/scripts/check-deck.ts drives it. The plugin keeps no logic of
// its own: it draws the state the app pushed and sends the app a request.
import { DECK_STATS, type DeckRequest, type DeckState, type DeckStatKind } from './protocol';

export type KeyKind = 'buff' | 'last-buff' | 'pause' | 'happy' | 'test-pull' | 'show-card' | 'show-last' | 'show-big' | 'stat' | 'skip' | 'clear-queue' | 'queue' | 'trading' | 'scene' | 'preview' | 'refresh' | 'checklist';

/** The action UUIDs in manifest.json. */
export const ACTION_KIND: Record<string, KeyKind> = {
  'tv.cheesygidds.tcgbridge.buff': 'buff',
  'tv.cheesygidds.tcgbridge.last-buff': 'last-buff',
  'tv.cheesygidds.tcgbridge.pause': 'pause',
  'tv.cheesygidds.tcgbridge.happy-hour': 'happy',
  'tv.cheesygidds.tcgbridge.test-pull': 'test-pull',
  'tv.cheesygidds.tcgbridge.show-card': 'show-card',
  'tv.cheesygidds.tcgbridge.show-last': 'show-last',
  'tv.cheesygidds.tcgbridge.show-big': 'show-big',
  'tv.cheesygidds.tcgbridge.stat': 'stat',
  'tv.cheesygidds.tcgbridge.skip': 'skip',
  'tv.cheesygidds.tcgbridge.clear-queue': 'clear-queue',
  'tv.cheesygidds.tcgbridge.queue': 'queue',
  'tv.cheesygidds.tcgbridge.trading': 'trading',
  'tv.cheesygidds.tcgbridge.scene': 'scene',
  'tv.cheesygidds.tcgbridge.preview': 'preview',
  'tv.cheesygidds.tcgbridge.refresh': 'refresh',
  'tv.cheesygidds.tcgbridge.checklist': 'checklist',
};

/** The staff keys (61.3, and Test pull / Show a card since 61.5) and the staff action each needs, the names of bridge/src/staffpages.ts: a mod-linked PC has no 'preview-url', 'test-pull' or 'show-card'. */
const STAFF_NEEDS: Partial<Record<KeyKind, string>> = { trading: 'trading', scene: 'scene', preview: 'preview-url', 'test-pull': 'test-pull', 'show-card': 'show-card', 'show-last': 'show-card', 'show-big': 'show-card' };
/** The staff-only part of a view: null when the key may be used. The app refuses the request again (bridge/src/deck.ts runStaffPcKey), this is only what the key shows. */
function staffRefusal(kind: KeyKind, state: DeckState): string | null {
  const need = STAFF_NEEDS[kind];
  if (!need) return null;
  return !state.staff ? 'Staff only' : state.staff.can.includes(need) ? null : 'Admins only';
}
/** True when a staff key is shown as refused (so a press does nothing). */
export const staffRefused = (kind: KeyKind, state: DeckState | null): boolean => !!state && staffRefusal(kind, state) !== null;

/** The scene a Scene key switches to, picked in its settings ('' = none). */
export const sceneOf = (s: Settings): string => (typeof s.scene === 'string' ? s.scene.trim().slice(0, 80) : '');

export type Settings = Record<string, unknown>;
/** How long a press must be held to end a running happy hour or to clear the queue. */
export const HOLD_MS = 1000;
/** A Queue key skips the next pull only when it is pressed again within this long. */
export const SKIP_MS = 3000;

/** What a Stat key can show: the stats the site gives, and the happy hour time left, which is already in the state (so it asks the site for nothing). */
export const STAT_CHOICES = [...DECK_STATS, 'happy'] as const;
export type StatChoice = (typeof STAT_CHOICES)[number];
/** The stat a Stat key shows, or null when none is picked. */
export const statOf = (s: Settings): StatChoice | null => STAT_CHOICES.find(k => k === s.stat) ?? null;

/** The card a Show a card key shows, picked in its settings: a name or a number like "#12" (the same text as the Staff tab's card box); '' = the site picks one. */
export const cardOf = (s: Settings): string => (typeof s.card === 'string' ? s.card.trim().slice(0, 80) : '');

/** Test pull and the Show keys play on the live overlay. */
export const onOverlay = (kind: KeyKind): boolean => kind === 'test-pull' || kind === 'show-card' || kind === 'show-last' || kind === 'show-big';
/** While OBS is live they need the same 1 second hold as the other keys that cannot be undone (61.5). */
export const liveHold = (kind: KeyKind, state: DeckState | null): boolean => onOverlay(kind) && !!state?.live;

/** A name cut to fit one line of a key (about 10 characters). */
export const fit = (t: string, n = 10): string => (t.length <= n ? t : `${t.slice(0, n - 1)}.`);

/** The viewer a Show a card key names: no @, lowercase, a Twitch login; '' when none (the site and the app check it again). */
export function viewerOf(s: Settings): string {
  const n = typeof s.viewer === 'string' ? s.viewer.trim().replace(/^@/, '').toLowerCase() : '';
  return /^[a-z0-9_]{2,25}$/.test(n) ? n : '';
}

/** "12:34": minutes and seconds left, rounded up to the second, never below 0:00 (the same as the app's tray tooltip). */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── Happy hour settings ──

export const PRESETS: Record<string, { minutes: number; kind: 'free' | 'discount'; percent: number }> = {
  p15: { minutes: 15, kind: 'free', percent: 0 },
  p30: { minutes: 30, kind: 'discount', percent: 50 },
  p60: { minutes: 60, kind: 'discount', percent: 25 },
};

/** The happy hour a key starts: a preset, or custom minutes and kind. Numbers are kept to whole values in range; the site has the last word. */
export function happyStart(s: Settings): Extract<DeckRequest, { what: 'happy-start' }> {
  const p = typeof s.preset === 'string' ? PRESETS[s.preset] : undefined;
  if (p) return { what: 'happy-start', ...p };
  const kind = s.kind === 'discount' ? 'discount' : 'free';
  const whole = (v: unknown, min: number, max: number, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : dflt);
  return { what: 'happy-start', minutes: whole(s.minutes, 1, 240, 15), kind, percent: kind === 'discount' ? whole(s.percent, 1, 99, 25) : 0 };
}

const offWords = (r: Extract<DeckRequest, { what: 'happy-start' }>) => (r.kind === 'free' ? 'free' : `${r.percent}% off`);

// ── Drawing ──

export type Tone = 'on' | 'idle' | 'warn' | 'bad' | 'off';
const COLOURS: Record<Tone, string> = { on: '#4ade80', idle: '#e5e7eb', warn: '#fbbf24', bad: '#ee3b3b', off: '#6b7280' };
/** Each glyph is drawn on a 144 x 144 canvas, in the tone's colour. */
export const GLYPHS: Record<KeyKind | 'play', string> = {
  buff: '<polygon points="80,20 42,82 70,82 62,126 102,60 74,60" />',
  'last-buff': '<path d="M36 72a36 36 0 1 0 12-27" fill="none" stroke-width="9" stroke-linecap="round"/><polyline points="30,28 38,50 60,44" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><polygon points="76,48 56,80 72,80 68,100 90,68 74,68" stroke="none"/>',
  pause: '<rect x="40" y="30" width="22" height="84" rx="4"/><rect x="82" y="30" width="22" height="84" rx="4"/>',
  play: '<polygon points="46,28 112,72 46,116"/>',
  happy: '<circle cx="72" cy="72" r="46" fill="none" stroke-width="9"/><polyline points="72,42 72,74 94,86" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>',
  'test-pull': '<rect x="38" y="20" width="68" height="104" rx="8" fill="none" stroke-width="9"/><polyline points="56,74 68,88 92,56" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>',
  'show-card': '<rect x="24" y="32" width="58" height="86" rx="8" fill="none" stroke-width="9"/><rect x="62" y="26" width="58" height="86" rx="8" fill="#0a0f21" stroke-width="9"/>',
  'show-last': '<rect x="40" y="24" width="64" height="96" rx="8" fill="none" stroke-width="9"/><polygon points="58,50 58,94 94,72"/>',
  'show-big': '<rect x="40" y="24" width="64" height="96" rx="8" fill="none" stroke-width="9"/><polygon points="72,44 79,63 99,63 83,75 89,95 72,83 55,95 61,75 45,63 65,63"/>',
  stat: '<rect x="30" y="76" width="26" height="42" rx="4"/><rect x="59" y="48" width="26" height="70" rx="4"/><rect x="88" y="26" width="26" height="92" rx="4"/>',
  skip: '<polygon points="28,28 94,72 28,116"/><rect x="104" y="28" width="14" height="88" rx="3"/>',
  'clear-queue': '<rect x="30" y="40" width="84" height="12" rx="4"/><rect x="56" y="26" width="32" height="14" rx="3"/><path d="M42 62h60l-5 56H47z" fill="none" stroke-width="9" stroke-linejoin="round"/>',
  queue: '<rect x="26" y="34" width="92" height="14" rx="4"/><rect x="26" y="65" width="92" height="14" rx="4"/><rect x="26" y="96" width="60" height="14" rx="4"/>',
  trading: '<polygon points="22,36 88,36 88,20 124,44 88,68 88,52 22,52"/><polygon points="122,92 56,92 56,76 20,100 56,124 56,108 122,108"/>',
  scene: '<rect x="22" y="34" width="100" height="76" rx="8" fill="none" stroke-width="9"/><polygon points="62,54 62,90 94,72"/>',
  preview: '<path d="M16 72Q72 14 128 72Q72 130 16 72Z" fill="none" stroke-width="9" stroke-linejoin="round"/><circle cx="72" cy="72" r="16"/>',
  refresh: '<path d="M116 72a44 44 0 1 1-13-31" fill="none" stroke-width="9" stroke-linecap="round"/><polygon points="120,18 120,56 84,48" stroke="none"/>',
  checklist: '<rect x="28" y="28" width="88" height="88" rx="10" fill="none" stroke-width="9"/><polyline points="48,64 60,78 82,50" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><rect x="48" y="92" width="48" height="9" rx="3"/>',
};

/** A key image as an SVG data URI: a dark tile with one glyph, no text (the title is the key's own text). */
export function icon(glyph: KeyKind | 'play', tone: Tone): string {
  const c = COLOURS[tone];
  const slash = tone === 'off' ? '<path d="M28 116 116 28" stroke="#ee3b3b" stroke-width="9" stroke-linecap="round"/>' : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="144" height="144"><rect width="144" height="144" rx="18" fill="#0a0f21"/><g fill="${c}" stroke="${c}" stroke-width="0">${GLYPHS[glyph]}</g>${slash}</svg>`;
  return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}

export interface View { title: string; image: string }

/** What a key shows. `state` is null while the app is not reachable (not running, link switched off, or the plugin has not found it yet). */
export function view(kind: KeyKind, state: DeckState | null, s: Settings, now: number): View {
  if (!state) return { title: 'App closed', image: icon(kind, 'off') };
  if (!state.ready) return { title: 'Not paired', image: icon(kind, 'off') };
  const refused = staffRefusal(kind, state);
  if (refused) return { title: refused, image: icon(kind, 'off') };
  switch (kind) {
    case 'buff': {
      const id = typeof s.buff === 'string' ? s.buff : '';
      // The app's list says nothing about a buff being active or on cooldown, so the key shows the name only.
      const name = state.buffs.find(b => b.id === id)?.name ?? (typeof s.name === 'string' ? s.name : '');
      return { title: id ? name : 'Pick a buff', image: icon('buff', id ? 'idle' : 'off') };
    }
    case 'last-buff': return { title: 'Last buff', image: icon('last-buff', 'idle') };
    case 'pause': {
      if (state.paused === null) return { title: 'Waiting', image: icon('pause', 'off') };
      if (!state.paused) return { title: 'Pulls open', image: icon('pause', 'on') };
      return { title: state.reason ? `Paused\n${state.reason}` : 'Paused', image: icon('play', 'warn') };
    }
    case 'happy': {
      if (state.happy && state.happy.endsAt > now) return { title: `${clock(state.happy.endsAt - now)}\n${state.happy.what.replace(/ packs$/, '')}`, image: icon('happy', 'on') };
      const r = happyStart(s);
      return { title: `Happy hour\n${r.minutes} min ${offWords(r)}`, image: icon('happy', 'idle') };
    }
    case 'test-pull': return state.live ? { title: 'Test pull\nLIVE', image: icon('test-pull', 'warn') } : { title: 'Test pull', image: icon('test-pull', 'idle') };
    case 'show-card': {
      const who = viewerOf(s);
      const card = cardOf(s);
      const title = !who ? 'Name a viewer' : card ? `${fit(who)}\n${fit(card)}` : `Show card\n${fit(who)}`;
      return { title, image: icon('show-card', !who ? 'off' : state.live ? 'warn' : 'idle') };
    }
    case 'show-last': return { title: 'Show\nlast pull', image: icon('show-last', state.live ? 'warn' : 'idle') };
    case 'show-big': return { title: 'Show last\nbig pull', image: icon('show-big', state.live ? 'warn' : 'idle') };
    case 'stat': return statView(statOf(s), state, now);
    case 'skip': return { title: 'Skip\nnext pull', image: icon('skip', 'idle') };
    case 'clear-queue': return { title: 'Clear\nqueue', image: icon('clear-queue', 'idle') };
    case 'queue': { const n = state.stats.queue; return { title: `Waiting\n${n ?? '-'}`, image: icon('queue', n ? 'on' : 'idle') }; }
    case 'trading': return state.staff?.tradingPaused ? { title: 'Trading\npaused', image: icon('trading', 'warn') } : { title: 'Trading\nopen', image: icon('trading', 'on') };
    case 'scene': {
      const name = sceneOf(s);
      return name ? { title: `Scene\n${name}`, image: icon('scene', state.staff?.scene === name ? 'on' : 'idle') } : { title: 'Pick a scene', image: icon('scene', 'off') };
    }
    case 'preview': return { title: 'Preview\noverlay', image: icon('preview', 'idle') };
    case 'refresh': return { title: 'Refresh\noverlay', image: icon('refresh', 'idle') };
    case 'checklist': {
      const c = state.checklist; // the last run's result stays until the next run
      if (!c) return { title: 'Run\nchecklist', image: icon('checklist', 'idle') };
      return c.failing > 0 ? { title: `Checklist\n${Math.min(c.failing, 99)} failing`, image: icon('checklist', 'bad') } : { title: `Checklist\n${c.total}/${c.total} OK`, image: icon('checklist', 'on') };
    }
  }
}

/** A Stat key: the label and the number, or "-" until the site has said. The goal is the site's own text ("Label: 37 / 50"), split at its last ": ". */
function statView(stat: StatChoice | null, state: DeckState, now: number): View {
  const st = state.stats;
  if (!stat) return { title: 'Pick a stat', image: icon('stat', 'off') };
  if (stat === 'happy') {
    const h = state.happy;
    return h && h.endsAt > now ? { title: `Happy hour\n${clock(h.endsAt - now)}`, image: icon('stat', 'on') } : { title: 'No happy\nhour', image: icon('stat', 'idle') };
  }
  if (stat === 'goal') {
    if (st.goal === undefined) return { title: 'Goal\n-', image: icon('stat', 'idle') };
    if (st.goal === null) return { title: 'Goal\nnone set', image: icon('stat', 'idle') };
    const i = st.goal.lastIndexOf(': ');
    return { title: i < 0 ? fit(st.goal) : `${fit(st.goal.slice(0, i))}\n${fit(st.goal.slice(i + 2))}`, image: icon('stat', 'on') };
  }
  if (stat === 'lastBig') {
    if (st.lastBig === undefined) return { title: 'Big pull\n-', image: icon('stat', 'idle') };
    return st.lastBig ? { title: `${fit(st.lastBig.username)}\n${fit(st.lastBig.cardName)}`, image: icon('stat', 'on') } : { title: 'Big pull\nnone yet', image: icon('stat', 'idle') };
  }
  if (stat === 'topPuller') {
    if (st.topPuller === undefined) return { title: 'Top puller\n-', image: icon('stat', 'idle') };
    return st.topPuller ? { title: `${fit(st.topPuller.username)}\n${st.topPuller.packs} packs`, image: icon('stat', 'on') } : { title: 'Top puller\nnone yet', image: icon('stat', 'idle') };
  }
  const n = st[stat];
  return { title: `${stat === 'queue' ? 'Queue' : 'Packs'}\n${n ?? '-'}`, image: icon('stat', n === undefined ? 'idle' : 'on') };
}

/** The request a press makes, or null when the key has nothing to ask for (a Buff key with no buff picked). A Trading key asks for the opposite of what the state shows. */
export function requestFor(kind: KeyKind, s: Settings, state: DeckState | null = null): DeckRequest | null {
  switch (kind) {
    case 'buff': return typeof s.buff === 'string' && s.buff ? { what: 'buff', id: s.buff } : null;
    case 'last-buff': return { what: 'last-buff' };
    case 'pause': return { what: 'pause' };
    case 'happy': return happyStart(s);
    case 'test-pull': return { what: 'test-pull' };
    case 'show-card': { const username = viewerOf(s); const card = cardOf(s); return username ? { what: 'show-card', username, ...(card ? { card } : {}) } : null; }
    case 'show-last': return { what: 'show-last', big: false };
    case 'show-big': return { what: 'show-last', big: true };
    case 'refresh': return { what: 'refresh' };
    case 'checklist': return { what: 'checklist' };
    case 'stat': return statOf(s) === 'queue' ? { what: 'skip' } : null; // the other stats do nothing on a press
    case 'skip': return { what: 'skip' };
    case 'clear-queue': return { what: 'clear-queue' }; // only sent after a 1 second hold (controller.ts)
    case 'queue': return null; // shows a number; a press does nothing
    case 'trading': return state?.staff ? { what: 'trading', pause: !state.staff.tradingPaused } : null;
    case 'scene': { const name = sceneOf(s); return name ? { what: 'scene', name } : null; }
    case 'preview': return { what: 'preview' };
  }
}
