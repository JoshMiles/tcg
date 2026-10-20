import { Icon } from '@/app/components/Icon';

/**
 * A copy's serial number as a chip: "#7". The first copies of a card are worth extra points, so a copy that earns a bonus is gold
 * (with the multiplier), and #1 is the "first ever". One look for the serial everywhere it is shown (feeds, trades, dialogs).
 */
/** On a collection tile or binder pocket: a solid plate, so the chip stays readable on yellow art. Other surfaces keep the chip's own gold look. */
export const tileChipClass = 'absolute bottom-1 left-1 border-yellow-400! bg-gray-950! bg-none! text-yellow-300! shadow-none! text-[9px]! px-1.5! py-0! leading-tight';

export function SerialChip({ n, bonus, est = false, className = '', title }: { n: number; bonus?: number; est?: boolean; className?: string; title?: string }) {
  const first = n === 1;
  const gold = !!bonus && bonus > 1;
  const tone = first ? 'bg-linear-to-r from-yellow-300 to-yellow-500 text-gray-950 border-yellow-200 shadow-[0_0_10px_rgba(250,204,21,.45)]'
    : gold ? 'badge-soft badge-warning'
    : 'badge-ghost';
  return (
    <span
      title={title ?? (first ? 'The very first edition ever made' : gold ? `Edition #${n}: worth ×${bonus} points` : `Edition #${n}`)}
      className={`badge badge-xs gap-1 font-extrabold tabular-nums whitespace-nowrap ${tone} ${className}`}
    >
      {first && <Icon name="cheese" className="w-3 h-3" />}#{n}{est ? '~' : ''}{gold && !first && <span className="text-[10px] font-bold opacity-90">×{bonus}</span>}
    </span>
  );
}
