import { cardThumbUrl } from '@/lib/card-art';
import { VARIANT_LABELS } from '@/lib/variants';
import { getRarity } from '@/lib/rarity';
import type { TradeItem } from '@/lib/trade-core';
import type { TradeCardInfo } from '@/lib/trade-view-core';

const SHORT: Record<string, string> = { regular: '', reverse: 'RH', full: 'FA', shiny: '✨' };

/** A row of card stacks: thumbnail, name, version badge and ×count. Plain markup, so it works in server and client components. */
export function TradeStacks({ items, cards, className = '' }: { items: TradeItem[]; cards: Record<number, TradeCardInfo>; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {items.map(i => {
        const c = cards[i.cardNumber];
        const art = (i.variant === 'full' || i.variant === 'shiny') && c?.fullArtImageUrl ? c.fullArtImageUrl : c?.imageUrl;
        const rarity = getRarity(c?.stars ?? 1);
        return (
          <li key={`${i.cardNumber}:${i.variant}`} className="flex items-center gap-2 rounded-xl bg-gray-950/60 border border-gray-800 pr-3 p-1.5" title={`${c?.name ?? `#${i.cardNumber}`}, ${VARIANT_LABELS[i.variant]}`}>
            <span className="relative w-9 h-[52px] rounded-md overflow-hidden shrink-0 border" style={{ borderColor: rarity?.hex }}>
              {art && <img src={cardThumbUrl(art)} alt="" loading="lazy" className="w-full h-full object-cover" />}
              {SHORT[i.variant] && <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] font-bold text-yellow-300 text-center leading-tight">{SHORT[i.variant]}</span>}
            </span>
            <span className="min-w-0 text-xs leading-tight">
              <span className="block font-semibold text-white truncate max-w-[9rem]">{c?.name ?? `#${i.cardNumber}`}</span>
              <span className="block text-gray-500">{VARIANT_LABELS[i.variant]}{i.count > 1 && <span className="text-yellow-400 font-bold"> ×{i.count}</span>}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
