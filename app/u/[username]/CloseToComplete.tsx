import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { boardHrefForGive, closePacks } from '@/lib/close-to-complete';
import type { ProfileBase } from '@/lib/profile-data';

/** Packs this collector is 1 to 3 cards from finishing, each linking to the trade board filtered to listings that give those cards. Nothing when no pack is that close. */
export function CloseToComplete({ b }: { b: ProfileBase }) {
  const close = closePacks(b.packs, b.countMap);
  if (close.length === 0) return null;
  return (
    <ul className="rind rounded-2xl px-4 py-3 space-y-1.5" aria-label="Packs close to complete">
      {close.map(p => {
        const n = p.missing.length;
        return (
          <li key={p.packId} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-300">
            <Icon name="cheese" className="text-yellow-400" />
            <span><strong className="text-white">{n} card{n === 1 ? '' : 's'}</strong> from finishing <strong className="text-white">{p.pack}</strong> <span className="text-gray-500 tabular-nums">({p.owned}/{p.total})</span></span>
            <Link href={boardHrefForGive(p.missing.map(m => m.number), b.season.id)} className="ml-auto text-yellow-300 hover:text-yellow-200 font-semibold whitespace-nowrap" title={p.missing.map(m => m.name).join(', ')}>Find on the board →</Link>
          </li>
        );
      })}
    </ul>
  );
}
