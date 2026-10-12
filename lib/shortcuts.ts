import { NAV_ITEMS } from './admin-nav';

// Keyboard shortcuts for the admin (pure, client-safe). Navigation is "g" then a letter, like GitHub. Everything is ignored while
// typing in a field and when a modifier key is held (so browser and OS shortcuts keep working).

export const SEQUENCE_WINDOW_MS = 1200;

export interface Shortcut { keys: string[]; label: string; href?: string; group: 'Go to' | 'Anywhere' }

export const GO_SHORTCUTS: Shortcut[] = NAV_ITEMS.map(i => ({ keys: ['g', i.key], label: i.label, href: i.href, group: 'Go to' as const }));

export const GLOBAL_SHORTCUTS: Shortcut[] = [
  { keys: ['Ctrl/⌘', 'K'], label: 'Open the command palette', group: 'Anywhere' },
  { keys: ['/'], label: 'Focus the search box on this page', group: 'Anywhere' },
  { keys: ['?'], label: 'Show these shortcuts', group: 'Anywhere' },
  { keys: ['Esc'], label: 'Close a dialog or the palette', group: 'Anywhere' },
];

export const ALL_SHORTCUTS: Shortcut[] = [...GLOBAL_SHORTCUTS, ...GO_SHORTCUTS];

export interface SeqState { pending: boolean; at: number }
export const IDLE: SeqState = { pending: false, at: 0 };

/** Advances the "g then letter" sequence. Returns the new state and, when a sequence completed, where to go. */
export function stepSequence(state: SeqState, key: string, now: number): { state: SeqState; go?: string } {
  const k = key.toLowerCase();
  if (state.pending && now - state.at <= SEQUENCE_WINDOW_MS) {
    const hit = NAV_ITEMS.find(i => i.key === k);
    return hit ? { state: IDLE, go: hit.href } : { state: IDLE };
  }
  return k === 'g' ? { state: { pending: true, at: now } } : { state: IDLE };
}

/** True when the key press came from somewhere text is being typed. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t as HTMLElement | null)?.tagName) return false;
  const el = t as HTMLElement;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
}
