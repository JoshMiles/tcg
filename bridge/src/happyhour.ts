// Happy hour from the app (ROADMAP 57.3). Plain TypeScript. The site owns the happy hour (KV, its own end time); the app only starts or
// ends it through POST /api/bridge/action and shows what the site last said, so it never keeps its own idea of whether one is running.

/** What the site says is running: `what` is "free packs" or "25% off packs", `endsAt` is epoch milliseconds. */
export interface HappyFacts { what: string; endsAt: number }

/** The tray's presets (the Control tab has the full form). `body` is sent as is. */
export const HAPPY_PRESETS: { label: string; body: { action: 'happy-hour-start'; minutes: number; kind: 'free' | 'discount'; percent?: number } }[] = [
  { label: '15 minutes, free packs', body: { action: 'happy-hour-start', minutes: 15, kind: 'free' } },
  { label: '30 minutes, 50% off', body: { action: 'happy-hour-start', minutes: 30, kind: 'discount', percent: 50 } },
  { label: '60 minutes, 25% off', body: { action: 'happy-hour-start', minutes: 60, kind: 'discount', percent: 25 } },
];

/** "12:34": minutes and seconds left, rounded up to the second, never below 0:00. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "Happy hour: free packs, 12:34 left", or '' when none runs (or it has run out by this PC's clock). */
export function happyText(h: HappyFacts | null, now: number): string {
  return h && h.endsAt > now ? `Happy hour: ${h.what}, ${clock(h.endsAt - now)} left` : '';
}
