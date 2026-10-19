'use client';
import { useMemo, useRef, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { cardThumbUrl } from '@/lib/card-art';
import type { PackInput } from '@/lib/pack-clean';
import type { WorkCard } from '@/lib/pack-editor-core';
import { allowedVariants } from '@/lib/variants';
import { getRarity } from '@/lib/rarity';
import { oneInLabel, totalWeight } from '@/lib/card-maths';

type Sort = 'number' | 'name' | 'stars' | 'chance' | 'problems';

/** What is missing or odd about a card, as short marks for the list. */
export function cardMarks(c: WorkCard, pack: PackInput): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  if (!c.imageUrl) out.push({ id: 'art', label: 'No art' });
  if (pack.upgradesEnabled && c.kind !== 'trainer' && !c.fullArtImageUrl && allowedVariants(pack, c).includes('full')) out.push({ id: 'full', label: 'No full art' });
  if (!c.soundUrl) out.push({ id: 'sound', label: 'No sound' });
  if (!(c.probability > 0)) out.push({ id: 'odds', label: '0 odds' });
  if (c.kind === 'trainer') out.push({ id: 'trainer', label: 'Trainer' });
  else if (pack.upgradesEnabled && (c.disabledVariants.length > 0 || !c.upgradesEnabled)) out.push({ id: 'versions', label: 'Versions off' });
  return out;
}

export function CardList({
  pack, cards, problemIds, selected, focus, packRow, onSelect, onAdd, onDeleteSelected, changedIds, searchRef, onImport, needsOdds,
}: {
  /** Files chosen with Import art (the drop is handled by the workspace). */
  onImport?: (files: File[]) => void;
  /** Cards imported in this visit whose stars and odds are still the starting values. */
  needsOdds?: Set<string>;
  pack: PackInput;
  cards: WorkCard[];
  problemIds: Set<string>;
  selected: Set<string>;
  focus: string | null;
  packRow: { changed: boolean; problem: boolean };
  /** `mode`: replace the selection, toggle one card, or extend from the last click to this card. */
  onSelect: (id: string, mode: 'replace' | 'toggle' | 'range', visible: string[]) => void;
  onAdd: () => void;
  onDeleteSelected: () => void;
  changedIds: Set<string>;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [q, setQ] = useState('');
  const [stars, setStars] = useState(0);
  const [sort, setSort] = useState<Sort>('number');
  const total = useMemo(() => totalWeight(cards.map(c => c.probability)), [cards]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = cards.filter(c => (!needle || c.name.toLowerCase().includes(needle) || String(c.number) === needle) && (!stars || c.stars === stars));
    const by: Record<Sort, (a: WorkCard, b: WorkCard) => number> = {
      number: (a, b) => (a.number || 1e9) - (b.number || 1e9),
      name: (a, b) => a.name.localeCompare(b.name),
      stars: (a, b) => b.stars - a.stars || a.number - b.number,
      chance: (a, b) => a.probability - b.probability,
      problems: (a, b) => Number(problemIds.has(b.id)) - Number(problemIds.has(a.id)) || cardMarks(b, pack).length - cardMarks(a, pack).length,
    };
    return [...list].sort(by[sort]);
  }, [cards, q, stars, sort, problemIds, pack]);
  const ids = visible.map(c => c.id);
  const list = useRef<HTMLUListElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="p-3 space-y-2 border-b border-gray-800">
        <div className="relative">
          <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input ref={searchRef} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search cards ( / )" aria-label="Search cards" className="input input-sm w-full pl-8" />
        </div>
        <div className="flex gap-2">
          <select aria-label="Filter by rarity" value={stars} onChange={e => setStars(Number(e.target.value))} className="select select-sm flex-1 min-w-0">
            <option value={0}>All rarities</option>
            {[5, 4, 3, 2, 1].map(s => <option key={s} value={s}>{s} star{s === 1 ? '' : 's'}</option>)}
          </select>
          <select aria-label="Sort cards" value={sort} onChange={e => setSort(e.target.value as Sort)} className="select select-sm flex-1 min-w-0">
            <option value="number">Number</option><option value="name">Name</option><option value="stars">Stars</option><option value="chance">Chance (rarest)</option><option value="problems">Problems first</option>
          </select>
        </div>
      </div>

      <button type="button" onClick={() => onSelect('pack', 'replace', ids)} aria-pressed={focus === 'pack'}
        className={`flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-left border-b border-gray-800 ${focus === 'pack' ? 'bg-yellow-500/10 text-yellow-300' : 'text-gray-200 hover:bg-white/4'}`}>
        <Icon name="settings" /> <span className="flex-1">Pack settings</span>
        {packRow.problem && <span className="w-2 h-2 rounded-full bg-amber-400" aria-label="Has a problem" />}
        {packRow.changed && <span className="w-2 h-2 rounded-full bg-yellow-400" aria-label="Unsaved changes" />}
      </button>

      <ul ref={list} className="flex-1 min-h-0 overflow-y-auto" aria-label="Cards">
        {visible.length === 0 && <li className="px-3 py-6 text-sm text-gray-500 text-center">{cards.length === 0 ? 'No cards yet. Add the first one below.' : 'No card matches.'}</li>}
        {visible.map(c => {
          const marks = cardMarks(c, pack);
          const on = selected.has(c.id);
          const chance = oneInLabel(c.probability, total);
          return (
            <li key={c.id} data-card-row={c.id} className={`flex items-center gap-2 px-2 py-1.5 border-b border-gray-800/60 ${focus === c.id ? 'bg-yellow-500/10' : on ? 'bg-white/5' : 'hover:bg-white/3'}`}>
              <input type="checkbox" checked={on} aria-label={`Select ${c.name || 'card'}`} onChange={() => onSelect(c.id, 'toggle', ids)} className="accent-yellow-400 shrink-0" />
              <button type="button" onClick={e => onSelect(c.id, e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'replace', ids)} aria-current={focus === c.id} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                <span className="w-9 h-12 shrink-0 rounded-sm bg-gray-800 overflow-hidden flex items-center justify-center">
                  {c.imageUrl ? <img src={cardThumbUrl(c.imageUrl)} alt="" loading="lazy" className="w-full h-full object-cover" /> : <Icon name="image" className="text-gray-600" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-500 tabular-nums">{c.number ? `#${c.number}` : 'new'}</span>
                    <span className={`text-sm font-medium truncate ${c.name ? 'text-white' : 'text-gray-500 italic'}`}>{c.name || 'Untitled'}</span>
                    {changedIds.has(c.id) && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" aria-label="Unsaved changes" />}
                    {problemIds.has(c.id) && <Icon name="warning" className="text-amber-400 shrink-0" />}
                  </span>
                  <span className="flex items-center gap-2 text-[11px]">
                    <span style={{ color: getRarity(c.stars)?.hex }}>{'★'.repeat(c.stars)}</span>
                    <span className="text-gray-500 tabular-nums">{chance}</span>
                  </span>
                  {(marks.length > 0 || needsOdds?.has(c.id)) && <span className="flex flex-wrap gap-1 mt-0.5">{needsOdds?.has(c.id) && <span className="text-[10px] text-sky-300 bg-sky-500/10 border border-sky-500/20 rounded-sm px-1">Set stars and odds</span>}{marks.map(m => <span key={m.id} className="text-[10px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-sm px-1">{m.label}</span>)}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="p-3 border-t border-gray-800 flex items-center gap-2">
        <button type="button" onClick={onAdd} className="flex-1 px-3 py-2 btn btn-primary rounded-lg text-sm"><Icon name="plus" className="mr-1" />Add card</button>
        {onImport && (
          <>
            <input ref={pick} type="file" multiple accept="image/*,.gif,audio/*" className="hidden" aria-label="Choose art files" onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) onImport(f); }} />
            <input ref={folder} type="file" multiple className="hidden" aria-label="Choose a folder of art" {...({ webkitdirectory: '' } as object)} onChange={e => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) onImport(f); }} />
            <button type="button" onClick={() => pick.current?.click()} className="px-3 py-2 text-sm font-bold rounded-lg border border-gray-700 text-gray-200 hover:border-gray-500" title="Pick pictures and sounds, or drop a folder on this list">Import art</button>
            <button type="button" onClick={() => folder.current?.click()} className="px-2 py-2 text-sm text-gray-400 hover:text-white" aria-label="Import a folder of art" title="Import a whole folder"><Icon name="inbox" /></button>
          </>
        )}
        {selected.size > 0 && !(selected.size === 1 && selected.has('pack')) && (
          <button type="button" onClick={onDeleteSelected} className="px-3 py-2 text-sm font-bold text-red-300 hover:text-red-200 border border-red-500/30 rounded-lg" aria-label={`Delete ${selected.size} selected`}><Icon name="trash" /> {selected.size}</button>
        )}
      </div>
    </div>
  );
}
