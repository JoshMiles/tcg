import { Icon } from './Icon';
import { STAFF_BADGE_LABELS, type StaffBadge as Badge } from '@/lib/staff-badge-core';

/** Streamer / Admin / Mod marker. `compact` is the shield alone (leaderboard rows). */
export function StaffBadge({ badge, compact = false }: { badge: Badge | null | undefined; compact?: boolean }) {
  if (!badge) return null;
  const label = STAFF_BADGE_LABELS[badge];
  return (
    <span className="inline-flex items-center gap-1 shrink-0 rounded-full border border-purple-400/40 bg-purple-500/15 px-1.5 py-0.5 align-middle text-[10px] font-extrabold uppercase tracking-wider text-purple-200" title={`${label} on the channel`}>
      <Icon name="shield" />{compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}
