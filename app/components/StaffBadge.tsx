import { Icon } from './Icon';
import { STAFF_BADGE_LABELS, type StaffBadge as Badge } from '@/lib/staff-badge-core';

/** Streamer / Admin / Mod marker. `compact` is the shield alone (leaderboard rows). */
export function StaffBadge({ badge, compact = false }: { badge: Badge | null | undefined; compact?: boolean }) {
  if (!badge) return null;
  const label = STAFF_BADGE_LABELS[badge];
  return (
    <span className="badge badge-sm badge-soft shrink-0 align-middle text-[10px] font-extrabold uppercase tracking-wider [--badge-color:#c084fc]" title={`${label} on the channel`}>
      <Icon name="shield" />{compact ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}
