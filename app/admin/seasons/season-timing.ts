import type { Season } from '@/lib/types';

const rel = (ms: number) => {
  const m = Math.round(Math.abs(ms) / 60_000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};

/** A short badge for a season's schedule: "Starts in 3d", "Ends in 6h", "Ended", or null when there is nothing to say. */
export function seasonTiming(s: Pick<Season, 'startsAt' | 'endsAt' | 'endedAt' | 'active' | 'autoStart' | 'status'>, now = Date.now()): { label: string; tone: 'soon' | 'info' } | null {
  if (s.endedAt) return null;
  if (s.status === 'published' && !s.active && s.startsAt !== undefined && s.startsAt > now) return { label: `Starts in ${rel(s.startsAt - now)}${s.autoStart ? ' (auto)' : ''}`, tone: 'soon' };
  if (s.active && s.endsAt !== undefined) return s.endsAt > now ? { label: `Ends in ${rel(s.endsAt - now)}`, tone: 'soon' } : { label: 'Ending now', tone: 'soon' };
  if (s.status === 'published' && !s.active && s.startsAt !== undefined && s.startsAt <= now && s.autoStart) return { label: 'Starts on the next visit', tone: 'info' };
  return null;
}
