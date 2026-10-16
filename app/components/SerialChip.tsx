import { Icon } from '@/app/components/Icon';

/**
 * A copy's serial number as a chip: "#7". The first copies of a card are worth extra points, so a copy that earns a bonus is gold
 * (with the multiplier), and #1 is the "first ever". One look for the serial everywhere it is shown (feeds, trades, dialogs).
 */
export function SerialChip({ n, bonus, est = false, className = '', title }: { n: number; bonus?: number; est?: boolean; className?: string; title?: string }) {
  const first = n === 1;
  const gold = !!bonus && bonus > 1;
  const tone = first ? 'bg-gradient-to-r from-yellow-300 to-yellow-500 text-gray-950 border-yellow-200 shadow-[0_0_10px_rgba(250,204,21,.45)]'
    : gold ? 'text-yellow-200 border-yellow-500/60 bg-yellow-500/10'
    : 'text-gray-300 border-gray-700 bg-gray-900/60';
  return (
    <span
      title={title ?? (first ? 'The very first print ever made' : gold ? `Edition #${n}: worth ×${bonus} points` : `Edition #${n}`)}
      className={`inline-flex items-center gap-1 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-extrabold tabular-nums whitespace-nowrap ${tone} ${className}`}
    >
      {first && <Icon name="cheese" className="w-3 h-3" />}#{n}{est ? '~' : ''}{gold && !first && <span className="text-[10px] font-bold opacity-90">×{bonus}</span>}
    </span>
  );
}
