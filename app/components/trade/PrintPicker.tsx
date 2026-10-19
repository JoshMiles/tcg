'use client';
import { Icon } from '@/app/components/Icon';
import { SerialChip } from '@/app/components/SerialChip';
import { serialMultiplier } from '@/lib/scoring-core';
import { newestIds, type PrintInfo, type TradeCardInfo } from '@/lib/trade-view-core';

/**
 * Tick exactly `count` of the prints you could trade of one card + version (the newest are ticked to start with, which is what a trade
 * moves when you pick nothing). Clicking another print when `count` are ticked swaps out the oldest tick. `giving` adds a warning for
 * an edition that earns a print bonus or is Print #1.
 */
export function PrintPicker({
  prints, count, selected, onChange, card, giving = false,
}: {
  prints: PrintInfo[];
  count: number;
  selected: string[];
  onChange: (ids: string[]) => void;
  card?: TradeCardInfo;
  /** These prints leave the viewer: warn about the ones worth keeping. */
  giving?: boolean;
}) {
  const ordered = [...prints].sort((a, b) => b.n - a.n);
  const toggle = (id: string) => {
    if (selected.includes(id)) { if (selected.length > 1) onChange(selected.filter(x => x !== id)); return; }
    onChange(selected.length >= count ? [...selected.slice(1), id] : [...selected, id]);
  };
  const mult = (n: number) => (card ? serialMultiplier(n, { serialBonusMax: card.bonus.max, serialBonusCutoff: card.bonus.cutoff }) : 1);
  const chosen = prints.filter(p => selected.includes(p.id));
  const first = chosen.some(p => p.n === 1);
  const bonus = chosen.some(p => p.n !== 1 && mult(p.n) > 1);
  return (
    <div className="w-full space-y-1.5 rounded-lg border border-gray-800 bg-gray-950/50 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-400">
        <span>Tick {count === 1 ? 'one edition' : `${count} editions`} ({selected.length}/{count})</span>
        <button type="button" onClick={() => onChange(newestIds(prints, count))} className="font-semibold text-yellow-400 hover:text-yellow-300">Use the newest</button>
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Editions you can choose">
        {ordered.map(p => {
          const on = selected.includes(p.id);
          const m = mult(p.n);
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(p.id)}
                title={`${p.uid ? `Edition #${p.uid}, ` : ''}Print #${p.n}`}
                className={`inline-flex items-center gap-1 rounded-full border px-1 py-0.5 transition-colors ${on ? 'border-yellow-400 bg-yellow-500/15' : 'border-gray-800 hover:border-gray-600'}`}
              >
                {on && <Icon name="check" className="ml-0.5 text-yellow-300" />}
                <SerialChip n={p.n} bonus={m > 1 ? Math.round(m * 100) / 100 : undefined} className="text-[10px]! px-1.5! py-0!" />
                {p.uid && <span className="pr-1 text-[10px] text-gray-400">Edition #{p.uid}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {giving && (first || bonus) && (
        <p role="note" className="flex items-start gap-1.5 text-[11px] text-amber-300">
          <Icon name="alert" className="mt-0.5 shrink-0" />
          <span>{first ? 'You are giving away Print #1, the first edition ever made.' : 'One of these editions earns a print bonus. The points go with it.'}</span>
        </p>
      )}
    </div>
  );
}
