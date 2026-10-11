'use client';
import { useMemo, useState } from 'react';
import { CardTile } from '@/app/components/CardTile';
import { RARITIES, getRarity } from '@/lib/rarity';

export interface DexCard {
  id: string;
  number: number;
  name: string;
  imageUrl: string;
  stars: number;
  packName: string;
  pullRate: number;
  copies: number;
  upgradable: boolean;
  /** Points per copy: Regular, Reverse Holo, Full Art, Shiny Full Art. */
  values: [number, number, number, number];
}

/** Every card in a season, with a rarity filter and name search. */
export function CardDex({ cards }: { cards: DexCard[] }) {
  const [stars, setStars] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'number' | 'rarity' | 'value'>('number');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = cards.filter(c => (stars === null || c.stars === stars) && (!q || c.name.toLowerCase().includes(q)));
    return list.sort((a, b) =>
      sort === 'rarity' ? a.pullRate - b.pullRate || a.number - b.number
      : sort === 'value' ? b.values[0] - a.values[0] || a.number - b.number
      : a.number - b.number);
  }, [cards, stars, query, sort]);

  const tiers = RARITIES.filter(r => cards.some(c => c.stars === r.stars));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search cards…"
          aria-label="Search cards"
          className="bg-gray-950/80 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 w-56"
        />
        <div className="flex flex-wrap gap-1.5">
          <Chip active={stars === null} onClick={() => setStars(null)}>All</Chip>
          {tiers.map(r => (
            <Chip key={r.stars} active={stars === r.stars} onClick={() => setStars(stars === r.stars ? null : r.stars)} color={r.hex}>
              {'★'.repeat(r.stars)}
            </Chip>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          Sort
          <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} className="bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200">
            <option value="number">Card number</option>
            <option value="rarity">Rarest first</option>
            <option value="value">Most valuable</option>
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="text-center text-gray-500 py-12 text-sm">No cards match.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {shown.map(c => {
            const rarity = getRarity(c.stars);
            const tileClass = 'holo-hover relative aspect-[2/3] rounded-xl overflow-hidden border-2 bg-gray-900';
            const style = { borderColor: rarity?.hex, boxShadow: `0 0 18px -6px ${rarity?.hex}` };
            return (
              <div key={c.id} className="space-y-2">
                {c.imageUrl ? (
                  <CardTile imageUrl={c.imageUrl} alt={c.name} className={tileClass} style={style}>
                    <span className="absolute top-1 left-1 bg-gray-950/85 text-gray-300 text-[10px] font-bold px-1.5 rounded-full">#{c.number}</span>
                  </CardTile>
                ) : <div className={tileClass} style={style} />}
                <div className="text-center space-y-0.5">
                  <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                  <p className="text-xs" style={{ color: rarity?.hex }}>{'★'.repeat(c.stars)} {rarity?.label}</p>
                  <p className="text-[11px] text-gray-500">1 in {Math.round(1 / c.pullRate).toLocaleString()} · {c.copies} out there</p>
                  <p className="text-[11px] text-yellow-300/90 tabular-nums" title={c.upgradable ? 'Points per copy: Regular · Reverse Holo · Full Art · Shiny' : 'Points per copy'}>
                    {c.upgradable ? c.values.join(' · ') : c.values[0]} pts
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors ${active ? 'bg-yellow-500 text-gray-950 border-yellow-500' : 'border-gray-700 hover:text-white'}`}
      style={!active && color ? { color } : undefined}
    >
      {children}
    </button>
  );
}
