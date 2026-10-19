'use client';
import { useMemo, useRef } from 'react';
import { Icon } from '@/app/components/Icon';
import { cardThumbUrl } from '@/lib/card-art';
import { OPTIONAL_VARIANTS } from '../../../components/VariantSwitches';
import type { PackInput } from '@/lib/pack-clean';
import { pastedColumn, type CardFields, type WorkCard } from '@/lib/pack-editor-core';
import { VARIANT_LABELS } from '@/lib/variants';
import { getRarity } from '@/lib/rarity';
import { oneInLabel, totalWeight } from '@/lib/card-maths';
import { NumberInput, inputCls } from './fields';

type Col = 'name' | 'stars' | 'weight';

/**
 * Every card of the pack as a spreadsheet row (ROADMAP 20.2c). Cells edit in place into the same working state as the Edit view.
 * Enter moves down the column (Shift+Enter up), Tab moves along; "Fill down" copies a column's value from the first selected row to the
 * other selected rows (or to every row below when only one is selected); pasting several lines from a spreadsheet into a name, stars or
 * weight cell fills that column downward.
 */
export function GridView({ pack, cards, held, selected, focus, problemIds, onSelect, editCards, only, onShowAll }: {
  /** Show only these cards (the ones just imported); null shows all. */
  only?: Set<string> | null;
  onShowAll?: () => void;
  pack: PackInput;
  cards: WorkCard[];
  held: Set<number>;
  selected: Set<string>;
  focus: string | null;
  problemIds: Set<string>;
  onSelect: (id: string, mode: 'replace' | 'toggle' | 'range', visible: string[]) => void;
  editCards: (fn: (cards: WorkCard[]) => WorkCard[], key?: string) => void;
}) {
  const rows = useMemo(() => [...cards].filter(c => !only || only.has(c.id)).sort((a, b) => (a.number || 1e9) - (b.number || 1e9)), [cards, only]);
  const ids = rows.map(r => r.id);
  const total = totalWeight(cards.map(c => c.probability));
  const table = useRef<HTMLTableElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  const patch = (id: string, p: Partial<CardFields>, key?: string) => editCards(cs => cs.map(c => (c.id === id ? { ...c, ...p } : c)), key ? `grid:${id}:${key}` : undefined);

  function moveTo(col: Col, rowIdx: number) {
    const el = table.current?.querySelector<HTMLElement>(`[data-col="${col}"][data-row="${rowIdx}"]`);
    el?.focus(); (el as HTMLInputElement | null)?.select?.();
  }
  function onKey(e: React.KeyboardEvent, col: Col, i: number) {
    if (e.key === 'Enter') { e.preventDefault(); moveTo(col, Math.max(0, Math.min(rows.length - 1, i + (e.shiftKey ? -1 : 1)))); }
  }
  function onPaste(e: React.ClipboardEvent, col: Col, i: number) {
    const lines = pastedColumn(e.clipboardData.getData('text'));
    if (lines.length < 2) return;
    e.preventDefault();
    const byId = new Map<string, Partial<CardFields>>();
    lines.forEach((v, k) => {
      const r = rows[i + k];
      if (!r) return;
      if (col === 'name') byId.set(r.id, { name: v.slice(0, 80) });
      else if (col === 'stars') { const n = Math.round(Number(v)); if (n >= 1 && n <= 5) byId.set(r.id, { stars: n }); }
      else { const n = Number(v); if (v !== '' && Number.isFinite(n) && n >= 0) byId.set(r.id, { probability: n }); }
    });
    if (byId.size > 0) editCards(cs => cs.map(c => (byId.has(c.id) ? { ...c, ...byId.get(c.id)! } : c)));
  }
  function fillDown(col: 'stars' | 'weight') {
    const picked = rows.filter(r => selected.has(r.id));
    const from = picked[0] ?? rows.find(r => r.id === focus);
    if (!from) return;
    const targets = new Set(picked.length > 1 ? picked.slice(1).map(r => r.id) : rows.slice(rows.indexOf(from) + 1).map(r => r.id));
    editCards(cs => cs.map(c => (targets.has(c.id) ? { ...c, ...(col === 'stars' ? { stars: from.stars } : { probability: from.probability }) } : c)));
  }

  if (rows.length === 0) return <p className="card rounded-2xl px-5 py-12 text-center text-gray-500">No cards yet. Add one in the Edit view.</p>;

  const th = 'px-2 py-2 text-left text-[11px] uppercase tracking-wider text-gray-500 font-bold whitespace-nowrap';
  const cell = `${inputCls} py-1! px-2! text-sm!`;
  return (
    <div className="card rounded-2xl overflow-auto min-h-0 max-h-[75vh] xl:max-h-full">
      {only && <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm bg-sky-950/30 border-b border-sky-500/20 text-sky-200"><span>Showing the {rows.length} card{rows.length === 1 ? '' : 's'} just imported. Set their stars and weights here.</span><button type="button" onClick={onShowAll} className="font-bold underline">Show all cards</button></div>}
      <table ref={table} className="table table-xs w-full text-sm min-w-4xl">
        <thead className="sticky top-0 z-10 bg-gray-900">
          <tr className="border-b border-gray-800">
            <th className={`${th} w-8`}><span className="sr-only">Select</span></th>
            <th className={`${th} w-12`}>#</th>
            <th className={`${th} w-12`}><span className="sr-only">Art</span></th>
            <th className={th}>Name</th>
            <th className={th}>Stars <button type="button" onClick={() => fillDown('stars')} className="ml-1 normal-case tracking-normal text-yellow-400 hover:text-yellow-300" title="Copy the first selected row's stars to the other selected rows (or every row below it)">Fill down</button></th>
            <th className={th}>Weight <button type="button" onClick={() => fillDown('weight')} className="ml-1 normal-case tracking-normal text-yellow-400 hover:text-yellow-300" title="Copy the first selected row's weight to the other selected rows (or every row below it)">Fill down</button></th>
            <th className={th}>Chance</th>
            <th className={th}>Versions</th>
            <th className={th}>Sound</th>
            <th className={th}>Full art</th>
            <th className={`${th} w-8`}><span className="sr-only">Problems</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, i) => {
            const on = selected.has(c.id);
            const chance = oneInLabel(c.probability, total);
            return (
              <tr key={c.id} className={`border-b border-gray-800/60 ${focus === c.id ? 'bg-yellow-500/10' : on ? 'bg-white/5' : ''}`}>
                <td className="px-2"><input type="checkbox" checked={on} aria-label={`Select ${c.name || 'card'}`} onChange={() => onSelect(c.id, 'toggle', ids)} onClick={e => { if (e.shiftKey) { e.preventDefault(); onSelect(c.id, 'range', ids); } }} className="accent-yellow-400" /></td>
                <td className="px-2 text-gray-500 tabular-nums">{c.number || 'new'}{held.has(c.number) && <span title="Viewers hold this card" className="ml-1 text-gray-600"><Icon name="lock" /></span>}</td>
                <td className="px-2 py-1"><span className="block w-8 h-11 rounded-sm bg-gray-800 overflow-hidden">{c.imageUrl && <img src={cardThumbUrl(c.imageUrl)} alt="" loading="lazy" className="w-full h-full object-cover" />}</span></td>
                <td className="px-1 py-1 min-w-40"><input data-col="name" data-row={i} aria-label={`Name of card ${c.number || 'new'}`} className={cell} value={c.name} maxLength={80} onFocus={() => onSelect(c.id, 'replace', ids)} onChange={e => patch(c.id, { name: e.target.value }, 'name')} onKeyDown={e => onKey(e, 'name', i)} onPaste={e => onPaste(e, 'name', i)} /></td>
                <td className="px-1 py-1 w-24">
                  <select data-col="stars" data-row={i} aria-label={`Stars of ${c.name || 'card'}`} className="select select-sm w-full" style={{ color: getRarity(c.stars)?.hex }} value={c.stars} onChange={e => patch(c.id, { stars: Number(e.target.value) })} onKeyDown={e => onKey(e, 'stars', i)} onPaste={e => onPaste(e, 'stars', i)}>
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
                  </select>
                </td>
                <td className="px-1 py-1 w-28" onKeyDown={e => onKey(e, 'weight', i)} onPaste={e => onPaste(e, 'weight', i)}>
                  <NumberInput ariaLabel={`Weight of ${c.name || 'card'}`} value={c.probability} min={0} onChange={n => patch(c.id, { probability: n }, 'weight')} dataCol="weight" dataRow={i} />
                </td>
                <td className="px-2 text-gray-400 tabular-nums whitespace-nowrap">{chance}</td>
                <td className="px-2">
                  <span className="inline-flex gap-1" role="group" aria-label={`Versions of ${c.name || 'card'}`}>
                    {OPTIONAL_VARIANTS.map(v => {
                      const packOff = (pack.disabledVariants ?? []).includes(v);
                      const isOn = !packOff && !c.disabledVariants.includes(v);
                      return (
                        <button key={v} type="button" aria-pressed={isOn} disabled={packOff || !pack.upgradesEnabled} title={`${VARIANT_LABELS[v]}${packOff ? ' (off for the whole pack)' : ''}`}
                          onClick={() => patch(c.id, { disabledVariants: isOn ? [...c.disabledVariants, v] : c.disabledVariants.filter(x => x !== v) })}
                          className={`px-1.5 py-0.5 rounded-sm text-[11px] font-bold border disabled:opacity-40 ${isOn ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-500'}`}>{v === 'reverse' ? 'RH' : v === 'full' ? 'FA' : 'SH'}</button>
                      );
                    })}
                  </span>
                </td>
                <td className="px-2">{c.soundUrl
                  ? <button type="button" aria-label={`Play the sound of ${c.name || 'card'}`} onClick={() => { audio.current?.pause(); audio.current = new Audio(c.soundUrl); void audio.current.play().catch(() => {}); }} className="text-gray-300 hover:text-white"><Icon name="play" /></button>
                  : <span className="text-[11px] text-amber-300/90">missing</span>}</td>
                <td className="px-2 text-xs">{c.fullArtImageUrl ? <span className="text-gray-300">yes</span> : <span className={pack.upgradesEnabled ? 'text-amber-300/90' : 'text-gray-600'}>missing</span>}</td>
                <td className="px-2">{problemIds.has(c.id) && <Icon name="warning" className="text-amber-400" title="Has a problem" />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
