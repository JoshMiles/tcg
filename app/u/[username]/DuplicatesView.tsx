import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { CardTile } from '@/app/components/CardTile';
import { stillFor } from '@/lib/card-art';
import { duplicateGroups } from '@/lib/duplicates';
import { getRarity } from '@/lib/rarity';
import { VARIANT_LABELS, usesFullArt } from '@/lib/variants';
import type { GridCard } from './CollectionGrid';

/** Repeat editions (same card, same version) grouped by card. The owner can put the spares on the trade board; one edition always stays. */
export function DuplicatesView({ grid, isOwner, ownerName, backHref }: { grid: GridCard[]; isOwner: boolean; ownerName: string; backHref: string }) {
  const groups = duplicateGroups(grid);
  return (
    <div className="space-y-4">
      <Link href={backHref} className="text-sm text-gray-500 hover:text-white">← Collection</Link>
      <h2 className="font-display text-2xl font-bold text-white">Duplicates</h2>
      {groups.length === 0
        ? <p className="rind rounded-2xl p-6 text-center text-sm text-gray-400">{isOwner ? 'You have' : `${ownerName} has`} no repeat editions yet. Two editions of the same card in the same version show up here.</p>
        : <ul className="space-y-3">
            {groups.map(({ card, repeats }) => {
              const art = usesFullArt(repeats[0].variant) && card.fullArtImageUrl ? card.fullArtImageUrl : card.imageUrl; // artFor lives in a client file, which a server component cannot call
              return (
                <li key={card.id} className="card rounded-2xl p-3 flex items-center gap-3">
                  <span className="w-14 aspect-2/3 rounded-lg overflow-hidden bg-gray-800 shrink-0"><CardTile imageUrl={art} still={stillFor(card, art)} alt="" className="relative w-full h-full" /></span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-sm font-bold text-white truncate">#{card.number} {card.name} <span style={{ color: getRarity(card.stars)?.hex }}>{'★'.repeat(card.stars)}</span></p>
                    <ul className="space-y-1.5">
                      {repeats.map(r => (
                        <li key={r.variant} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <span className="text-gray-300">{VARIANT_LABELS[r.variant]} <span className="text-gray-500 tabular-nums">×{r.count}</span></span>
                          <span className="text-yellow-300 text-xs font-bold tabular-nums">{r.spare} spare</span>
                          {isOwner && <Link href={`/trade/new?listing=1&give=${card.number}.${r.variant}.${r.spare}`} className="btn btn-primary btn-xs rounded-lg ml-auto"><Icon name="trade" />Offer on the board</Link>}
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ul>}
    </div>
  );
}
