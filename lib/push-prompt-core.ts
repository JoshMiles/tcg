// The "turn on alerts" banner: when to show it and how a "Not now" is remembered (pure, client-safe). The component is
// app/components/site/PushPrompt.tsx; the subscribe flow it runs is lib/push-client.ts.

export const PROMPT_KEY = 'tcg_push_prompt';
/** "Not now" hides the banner this long. */
export const SNOOZE_DAYS = 14;
/** After this many "Not now" taps the banner stops for good (Settings still has the switch). */
export const MAX_DISMISSALS = 3;

export interface PromptState { until: number; n: number }
export type PromptMode = 'turn-on' | 'install' | null;

/** The stored value (JSON) read defensively: anything odd means "never dismissed". */
export function parsePromptState(raw: string | null): PromptState {
  try {
    const o = JSON.parse(raw ?? 'null') as Partial<PromptState> | null;
    const until = Number(o?.until), n = Number(o?.n);
    return { until: Number.isFinite(until) && until > 0 ? until : 0, n: Number.isInteger(n) && n > 0 ? n : 0 };
  } catch { return { until: 0, n: 0 }; }
}

/** One more "Not now": hide for SNOOZE_DAYS and count it. */
export function dismissed(s: PromptState, now: number): PromptState {
  return { until: now + SNOOZE_DAYS * 86_400_000, n: s.n + 1 };
}

/** A phone, a tablet, or the installed app (a computer's browser tab does not get the banner). */
export function isPhoneLike(ua: string, touchPoints: number, standalone: boolean): boolean {
  return standalone || /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
}

export interface PromptInput {
  /** The server has Web Push set up (VAPID keys) and the viewer is signed in. */
  serverEnabled: boolean;
  phone: boolean;
  /** `pushSupport()` from lib/push-client. */
  support: 'ok' | 'install-first' | 'unsupported';
  permission: NotificationPermission | 'unsupported';
  /** This device already has a push subscription. */
  subscribed: boolean;
  state: PromptState;
  now: number;
}

/** 'turn-on': offer the subscribe button. 'install': an iPhone in Safari cannot ask yet, so point at the install guide. null: show nothing. */
export function promptMode(i: PromptInput): PromptMode {
  if (!i.serverEnabled || !i.phone || i.subscribed || i.permission === 'denied') return null;
  if (i.state.n >= MAX_DISMISSALS || i.now < i.state.until) return null;
  if (i.support === 'install-first') return 'install';
  if (i.support === 'ok' && i.permission === 'default') return 'turn-on';
  return null;
}
