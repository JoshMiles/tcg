import { cardThumbUrl } from '@/lib/card-art';
import { VARIANT_LABELS, encodeEntry } from '@/lib/variants';
import { serialMultiplier } from '@/lib/scoring-core';
import { parseCopyId, type SerialPool } from '@/lib/serials-core';
import { SerialChip } from '@/app/components/SerialChip';
import { getRarity } from '@/lib/rarity';
import type { TradeItem } from '@/lib/trade-core';
import type { TradeCardInfo } from '@/lib/trade-view-core';

const SHORT: Record<string, string> = { regular: '', reverse: 'RH', full: 'FA', shiny: 'SH' };

/**
 * A row of card stacks: thumbnail, name, version badge and ×count. Plain markup, so it works in server and client components.
 * With a `pool` (the serial numbers the copies would come from) each stack also lists the serial numbers that move in the trade: trades
 * move the newest copies first, so these are the highest numbers of the pool. A serial that earns a points bonus is gold.
 */
export function TradeStacks({ items, cards, className = '', pool, hideCount = false, wanted, uids, anyPrint = false }: { items: TradeItem[]; cards: Record<number, TradeCardInfo>; className?: string; pool?: SerialPool; hideCount?: boolean; wanted?: Record<number, number>; uids?: Record<string, number>; /** Say "any print" under a stack that has no chosen prints (the side whoever accepts chooses). */ anyPrint?: boolean }) {
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {items.map(i => {
        const c = cards[i.cardNumber];
        const art = (i.variant === 'full' || i.variant === 'shiny') && c?.fullArtImageUrl ? c.fullArtImageUrl : c?.imageUrl;
        const rarity = getRarity(c?.stars ?? 1);
        // Chosen prints (`ids`) are shown as they are; otherwise the newest of the pool, which is what would move.
        const picked = i.ids?.flatMap(id => { const p = parseCopyId(id); return p ? [{ n: p.n, uid: uids?.[id] }] : []; }).sort((a, b) => b.n - a.n);
        const serials = picked ? picked.map(p => p.n) : [...(pool?.[encodeEntry(i.cardNumber, i.variant)] ?? [])].slice(-i.count).reverse();
        return (
          <li key={`${i.cardNumber}:${i.variant}`} className="flex items-center gap-2 rounded-xl bg-gray-950/60 border border-gray-800 pr-3 p-1.5" title={`${c?.name ?? `#${i.cardNumber}`}, ${VARIANT_LABELS[i.variant]}`}>
            <span className="relative w-9 h-[52px] rounded-md overflow-hidden shrink-0 border" style={{ borderColor: rarity?.hex }}>
              {art && <img src={cardThumbUrl(art)} alt="" loading="lazy" className="w-full h-full object-cover" />}
              {SHORT[i.variant] && <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] font-bold text-yellow-300 text-center leading-tight">{SHORT[i.variant]}</span>}
            </span>
            <span className="min-w-0 text-xs leading-tight">
              <span className="block font-semibold text-white truncate max-w-[9rem]">{c?.name ?? `#${i.cardNumber}`}</span>
              <span className="block text-gray-500">{VARIANT_LABELS[i.variant]}{!hideCount && i.count > 1 && <span className="text-yellow-400 font-bold"> ×{i.count}</span>}</span>
              {wanted?.[i.cardNumber] ? <span className="mt-1 inline-block rounded-full border border-purple-400/30 bg-purple-500/10 px-1.5 text-[10px] font-bold text-purple-300">{wanted[i.cardNumber]} want this</span> : null}
              {anyPrint && !i.ids && <span className="block text-[10px] text-gray-600">any print</span>}
              {serials.length > 0 && c && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {serials.slice(0, 4).map(n => {
                    const m = serialMultiplier(n, { serialBonusMax: c.bonus.max, serialBonusCutoff: c.bonus.cutoff });
                    const uid = picked?.find(p => p.n === n)?.uid;
                    return (
                      <span key={n} className="inline-flex items-center gap-1">
                        <SerialChip n={n} bonus={m > 1 ? Math.round(m * 100) / 100 : undefined} className="!text-[10px] !px-1.5 !py-0" />
                        {uid && <span className="text-[10px] text-gray-400">Print #{uid}</span>}
                      </span>
                    );
                  })}
                  {serials.length > 4 && <span className="text-[10px] text-gray-500 self-center">+{serials.length - 4}</span>}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
