// What each key looks like and what it asks for (ROADMAP 57.13a). Pure: no Stream Deck SDK, so bridge/scripts/check-deck.ts drives it. The plugin keeps no logic of
// its own: it draws the state the app pushed and sends the app a request.
import { DECK_STATS, type DeckRequest, type DeckState, type DeckStatKind } from './protocol';

export type KeyKind = 'buff' | 'last-buff' | 'pause' | 'happy' | 'test-pull' | 'show-card' | 'stat';

/** The action UUIDs in manifest.json. */
export const ACTION_KIND: Record<string, KeyKind> = {
  'tv.cheesygidds.tcgbridge.buff': 'buff',
  'tv.cheesygidds.tcgbridge.last-buff': 'last-buff',
  'tv.cheesygidds.tcgbridge.pause': 'pause',
  'tv.cheesygidds.tcgbridge.happy-hour': 'happy',
  'tv.cheesygidds.tcgbridge.test-pull': 'test-pull',
  'tv.cheesygidds.tcgbridge.show-card': 'show-card',
  'tv.cheesygidds.tcgbridge.stat': 'stat',
};

export type Settings = Record<string, unknown>;
/** How long a press must be held to end a running happy hour. */
export const HOLD_MS = 1000;
/** A Queue key skips the next pull only when it is pressed again within this long. */
export const SKIP_MS = 3000;

/** The stat a Stat key shows, or null when none is picked. */
export const statOf = (s: Settings): DeckStatKind | null => DECK_STATS.find(k => k === s.stat) ?? null;

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

export type Tone = 'on' | 'idle' | 'warn' | 'off';
const COLOURS: Record<Tone, string> = { on: '#4ade80', idle: '#e5e7eb', warn: '#fbbf24', off: '#6b7280' };
/** Each glyph is drawn on a 144 x 144 canvas, in the tone's colour. */
export const GLYPHS: Record<KeyKind | 'play', string> = {
  buff: '<polygon points="80,20 42,82 70,82 62,126 102,60 74,60" />',
  'last-buff': '<path d="M36 72a36 36 0 1 0 12-27" fill="none" stroke-width="9" stroke-linecap="round"/><polyline points="30,28 38,50 60,44" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><polygon points="76,48 56,80 72,80 68,100 90,68 74,68" stroke="none"/>',
  pause: '<rect x="40" y="30" width="22" height="84" rx="4"/><rect x="82" y="30" width="22" height="84" rx="4"/>',
  play: '<polygon points="46,28 112,72 46,116"/>',
  happy: '<circle cx="72" cy="72" r="46" fill="none" stroke-width="9"/><polyline points="72,42 72,74 94,86" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>',
  'test-pull': '<rect x="38" y="20" width="68" height="104" rx="8" fill="none" stroke-width="9"/><polyline points="56,74 68,88 92,56" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>',
  'show-card': '<rect x="24" y="32" width="58" height="86" rx="8" fill="none" stroke-width="9"/><rect x="62" y="26" width="58" height="86" rx="8" fill="#0a0f21" stroke-width="9"/>',
  stat: '<rect x="30" y="76" width="26" height="42" rx="4"/><rect x="59" y="48" width="26" height="70" rx="4"/><rect x="88" y="26" width="26" height="92" rx="4"/>',
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
    case 'test-pull': return { title: 'Test pull', image: icon('test-pull', 'idle') };
    case 'show-card': {
      const who = viewerOf(s);
      return { title: who ? `Show card\n${who}` : 'Name a viewer', image: icon('show-card', who ? 'idle' : 'off') };
    }
    case 'stat': return statView(statOf(s), state.stats);
  }
}

/** A Stat key: the label and the number, or "-" until the site has said. The goal is the site's own text ("Label: 37 / 50"), split at its last ": ". */
function statView(stat: DeckStatKind | null, st: DeckState['stats']): View {
  if (!stat) return { title: 'Pick a stat', image: icon('stat', 'off') };
  if (stat === 'goal') {
    if (st.goal === undefined) return { title: 'Goal\n-', image: icon('stat', 'idle') };
    if (st.goal === null) return { title: 'Goal\nnone set', image: icon('stat', 'idle') };
    const i = st.goal.lastIndexOf(': ');
    return { title: i < 0 ? st.goal : `${st.goal.slice(0, i)}\n${st.goal.slice(i + 2)}`, image: icon('stat', 'on') };
  }
  const n = st[stat];
  return { title: `${stat === 'queue' ? 'Queue' : 'Packs'}\n${n ?? '-'}`, image: icon('stat', n === undefined ? 'idle' : 'on') };
}

/** The request a press makes, or null when the key has nothing to ask for (a Buff key with no buff picked). */
export function requestFor(kind: KeyKind, s: Settings): DeckRequest | null {
  switch (kind) {
    case 'buff': return typeof s.buff === 'string' && s.buff ? { what: 'buff', id: s.buff } : null;
    case 'last-buff': return { what: 'last-buff' };
    case 'pause': return { what: 'pause' };
    case 'happy': return happyStart(s);
    case 'test-pull': return { what: 'test-pull' };
    case 'show-card': { const username = viewerOf(s); return username ? { what: 'show-card', username } : null; }
    case 'stat': return statOf(s) === 'queue' ? { what: 'skip' } : null; // the other stats do nothing on a press
  }
}
