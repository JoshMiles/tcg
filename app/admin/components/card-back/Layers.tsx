'use client';
import { useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { KIND_LABELS, MAX_ELEMENTS, MAX_TEXT_BOXES, type CardBackStyle } from '@/lib/card-back';
import { addText, alignElements, distributeElements, duplicateElement, moveElement, patchElements, removeElement, stepElement, type AlignMode, type Box } from '@/lib/card-back-edit';

const tool = 'inline-flex items-center justify-center px-2 py-1 text-xs font-bold rounded-md border border-gray-700 text-gray-200 hover:border-gray-500 disabled:opacity-40';

/**
 * The layers list: every element, top layer first, with show / hide, lock, reorder (drag, or the arrows), duplicate and delete for text boxes, Add text,
 * and Align / Distribute for several selected free elements.
 */
export function Layers({ style, selection, boxes, onSelect, onChange }: {
  style: CardBackStyle;
  selection: Set<string>;
  boxes: Record<string, Box>;
  onSelect: (ids: Set<string>) => void;
  /** `key` coalesces repeated edits into one undo step. */
  onChange: (next: CardBackStyle, key?: string) => void;
  onGesture?: () => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const rows = [...style.elements].reverse();
  const picked = style.elements.filter(e => selection.has(e.id));
  const free = picked.filter(e => e.place === 'free');
  const label = (id: string) => { const e = style.elements.find(x => x.id === id)!; return e.kind === 'text' ? (e.text || 'Empty text') : KIND_LABELS[e.kind]; };
  const click = (id: string, shift: boolean) => {
    const next = new Set(shift ? selection : []);
    next.delete('bg');
    if (shift && next.has(id)) next.delete(id); else next.add(id);
    onSelect(next);
  };
  const add = () => { const r = addText(style); if (r) { onChange(r.style); onSelect(new Set([r.id])); } };
  const boxIds = Object.fromEntries(free.map(e => [e.id, boxes[e.id]]).filter(([, b]) => b));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={tool} onClick={add} disabled={style.elements.length >= MAX_ELEMENTS || style.elements.filter(e => e.kind === 'text').length >= MAX_TEXT_BOXES}><Icon name="plus" className="mr-1" />Add text</button>
        <button type="button" className={tool} onClick={() => onSelect(new Set(['bg']))} aria-pressed={selection.has('bg')}>Background</button>
      </div>

      <ul aria-label="Layers" className="space-y-1">
        {rows.map(e => {
          const sel = selection.has(e.id);
          return (
            <li key={e.id} draggable onDragStart={() => setDragId(e.id)} onDragEnd={() => { setDragId(null); setOver(null); }}
              onDragOver={ev => { ev.preventDefault(); setOver(e.id); }} onDrop={() => { if (dragId && dragId !== e.id) onChange(moveElement(style, dragId, e.id)); setDragId(null); setOver(null); }}
              className={`flex items-center gap-1 rounded-lg border px-1.5 py-1 text-sm ${sel ? 'border-yellow-500/60 bg-yellow-500/10' : 'border-gray-800 bg-gray-900/50'} ${over === e.id ? 'ring-1 ring-sky-400' : ''}`}>
              <button type="button" onClick={() => onChange(patchElements(style, [e.id], { show: !e.show }))} aria-pressed={e.show} aria-label={`${e.show ? 'Hide' : 'Show'} ${label(e.id)}`} className={`p-1 ${e.show ? 'text-gray-200' : 'text-gray-600 line-through'}`}><Icon name="eye" /></button>
              <button type="button" onClick={() => onChange(patchElements(style, [e.id], { locked: !e.locked }))} aria-pressed={e.locked} aria-label={`${e.locked ? 'Unlock' : 'Lock'} ${label(e.id)}`} className={`p-1 ${e.locked ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-300'}`}><Icon name="lock" /></button>
              <button type="button" onClick={ev => click(e.id, ev.shiftKey || ev.ctrlKey || ev.metaKey)} aria-pressed={sel} className={`flex-1 min-w-0 text-left truncate ${e.show ? 'text-gray-100' : 'text-gray-500'}`}>
                {label(e.id)} <span className="text-[10px] text-gray-500">{e.place === 'free' ? 'free' : 'stack'}</span>
              </button>
              <button type="button" onClick={() => onChange(stepElement(style, e.id, 1))} aria-label={`Move ${label(e.id)} up`} className="p-1 text-gray-500 hover:text-white"><Icon name="chevronUp" /></button>
              <button type="button" onClick={() => onChange(stepElement(style, e.id, -1))} aria-label={`Move ${label(e.id)} down`} className="p-1 text-gray-500 hover:text-white"><Icon name="chevronDown" /></button>
              {e.kind === 'text' && <>
                <button type="button" onClick={() => { const r = duplicateElement(style, e.id); if (r) { onChange(r.style); onSelect(new Set([r.id])); } }} aria-label={`Duplicate ${label(e.id)}`} className="p-1 text-gray-500 hover:text-white"><Icon name="copy" /></button>
                <button type="button" onClick={() => { onChange(removeElement(style, e.id)); onSelect(new Set()); }} aria-label={`Delete ${label(e.id)}`} className="p-1 text-gray-500 hover:text-red-300"><Icon name="trash" /></button>
              </>}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-gray-600">Top of the list is the front layer. Elements in the stack keep the classic column; drag one on the card to place it freely.</p>

      {free.length >= 2 && (
        <div className="space-y-1.5 border-t border-gray-800 pt-2">
          <p className="text-xs text-gray-400">Align {free.length} elements</p>
          <div className="flex flex-wrap gap-1">
            {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as AlignMode[]).map(m => <button key={m} type="button" className={tool} onClick={() => onChange(alignElements(style, free.map(e => e.id), m, boxIds))}>{m[0].toUpperCase() + m.slice(1)}</button>)}
          </div>
          <div className="flex gap-1">
            <button type="button" className={tool} disabled={free.length < 3} onClick={() => onChange(distributeElements(style, free.map(e => e.id), 'x', boxIds))}>Distribute across</button>
            <button type="button" className={tool} disabled={free.length < 3} onClick={() => onChange(distributeElements(style, free.map(e => e.id), 'y', boxIds))}>Distribute down</button>
          </div>
        </div>
      )}
    </div>
  );
}
