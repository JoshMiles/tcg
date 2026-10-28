'use client';
import { Fragment, useState } from 'react';
import { Icon, type IconName } from '@/app/components/Icon';
import { ELEMENT_IDS, type ElementId, type OverlayLayout } from '@/lib/overlay-layout';
import { MAX_CUSTOM, moveCustomOnto, newCustom, type CustomKind } from '@/lib/overlay-custom';
import type { PropValue } from '@/lib/overlay-props';
import type { Mode } from './editor-types';
import { FxBadge, hasFx } from './editor-controls';

// Readable names, and the existing show/hide property of each element (none for the card and the collection grid).
export const LAYER_NAMES: Record<ElementId, string> = {
  card: 'Card', label: 'Label', serial: 'Edition badge', bar: 'Name and stars bar', got: '"got:" line',
  strip: 'Card strip', showlabel: 'Show-off label', banner: 'Moment banner', heading: 'Heading', grid: 'Collection grid',
};
// What each part is, for the icon beside its name in Layers.
const LAYER_KINDS: Record<ElementId, IconName> = {
  card: 'image', label: 'text', serial: 'text', bar: 'layers', got: 'text', strip: 'layers', showlabel: 'text', banner: 'text', heading: 'text', grid: 'layers',
};
const VISIBLE_KEY: Partial<Record<ElementId, string>> = {
  label: 'reveal.showLabel', serial: 'reveal.showSerial', bar: 'reveal.showInfoBar', got: 'reveal.showGotLine',
  strip: 'reveal.showMiniList', showlabel: 'show.showLabel', heading: 'collection.showHeading',
};
// The text style settings of each part, for the fx badge.
const STYLE_KEYS: Partial<Record<ElementId, string[]>> = {
  label: ['reveal.labelStyle'], serial: ['reveal.serialStyle'], bar: ['reveal.nameStyle', 'reveal.cardNumberStyle'], got: ['reveal.gotStyle'], strip: ['reveal.stripStyle'], showlabel: ['show.labelStyle'],
  banner: ['firstEver', 'firstPull', 'newCard'].flatMap(m => [`moment.${m}.textStyle`, `moment.${m}.subTextStyle`]), heading: ['collection.headingStyle'], grid: ['collection.cardStyle'],
};
const VIEWS: { view: Mode; label: string }[] = [
  { view: 'pack', label: 'Pack opening' },
  { view: 'collection', label: 'Collection' },
];

// The preview's elements as a list: select, hover-highlight, hide (where a show/hide setting exists) and reset a moved one.
export function LayersPanel({ overlapping, lowContrast, layout, selected, selection, locked, toggleSelect, toggleLock, linkSelection, unlinkSelection, valueOf, setValue, setLayoutVals, selectTarget, selectView, hoverElement, openLayerMenu }: {
  overlapping: string[];
  lowContrast: Record<string, number>;
  layout: OverlayLayout;
  selected: string;
  selection: string[];
  locked: string[];
  toggleSelect: (target: string) => void;
  toggleLock: (ids: string[]) => void;
  linkSelection: () => void;
  unlinkSelection: () => void;
  valueOf: (key: string) => PropValue;
  setValue: (key: string, raw: unknown) => void;
  setLayoutVals: (u: OverlayLayout | ((l: OverlayLayout) => OverlayLayout), label?: string) => void;
  selectTarget: (target: string) => void;
  selectView: (view: Mode) => void;
  hoverElement: (target: string) => void;
  openLayerMenu: (view: Mode, id: string | null, x: number, y: number) => void;
}) {
  const menuOn = (view: Mode, id: string | null) => (e: React.MouseEvent) => {
    e.preventDefault();
    openLayerMenu(view, id, e.clientX, e.clientY);
  };
  const reset = (view: Mode, id: ElementId) =>
    setLayoutVals(l => {
      const { [id]: _gone, ...rest } = l[view].elements ?? {};
      return { ...l, [view]: { ...l[view], elements: rest } };
    });
  // Custom layers (38.7): the add and delete edits, one History step each.
  const DRAG_TYPE = 'application/x-overlay-layer';
  type Custom = NonNullable<OverlayLayout['pack']['custom']>;
  const setCustom = (view: Mode, fn: (c: Custom) => Custom, label: string) =>
    setLayoutVals(l => ({ ...l, [view]: { ...l[view], custom: fn(l[view].custom ?? []) } }), label);
  const add = (view: Mode, kind: CustomKind) => {
    const layer = newCustom(kind, (layout[view].custom ?? []).map(c => c.id), layout.width, layout.height);
    setCustom(view, c => [...c, layer], `Add ${kind} layer`);
    selectView(view);
    selectTarget(`custom:${layer.id}`);
  };
  const [renaming, setRenaming] = useState('');
  const [folded, setFolded] = useState<string[]>([]); // collapsed link groups, keyed by their ids
  const linked = [...(layout.pack.links ?? []), ...(layout.collection.links ?? [])].flat().some(t => selection.includes(t));
  const rename = (view: Mode, layerId: string, name: string) => {
    setRenaming('');
    const n = name.trim().slice(0, 40);
    if (n && n !== (layout[view].custom ?? []).find(x => x.id === layerId)?.name) setCustom(view, c => c.map(x => (x.id === layerId ? { ...x, name: n } : x)), `Rename ${n}`);
  };
  return (
    <div data-layers className="px-3 py-2 space-y-2" onMouseLeave={() => hoverElement('')}>
      <div className="flex items-center gap-1 text-xs text-gray-500">
        <button type="button" disabled={selection.filter(t => !t.startsWith('custom:')).length < 2} onClick={linkSelection} title="Link the selected layers so they move and scale together" className="rounded border border-gray-700 px-1.5 py-0.5 hover:border-gray-500 hover:text-white disabled:opacity-40"><Icon name="link" /> Link</button>
        <button type="button" disabled={!linked} onClick={unlinkSelection} title="Release the selected layers' link" className="rounded border border-gray-700 px-1.5 py-0.5 hover:border-gray-500 hover:text-white disabled:opacity-40"><Icon name="unlink" /> Unlink</button>
      </div>
      {VIEWS.map(({ view, label }) => (
        <div key={view}>
          <button type="button" onClick={() => selectView(view)} onContextMenu={menuOn(view, null)} className="text-xs uppercase tracking-wide text-gray-500 font-semibold hover:text-white">
            {label}
          </button>
          <ul>
            {[...new Set(ELEMENT_IDS[view].flatMap(id => (layout[view].links?.find(s => s.includes(id)) ?? [id]).filter((t): t is ElementId => !t.startsWith('custom:'))))].map(id => {
              const set = layout[view].links?.find(s => s.includes(id));
              const gk = set?.join(',') ?? '';
              const head = !!set && set.find(t => !t.startsWith('custom:')) === id;
              if (set && folded.includes(gk) && !head) return null;
              const moved = !!layout[view].elements?.[id];
              const key = VISIBLE_KEY[id];
              const visible = key ? valueOf(key) !== false : true;
              return (
                <Fragment key={id}>
                {head && (
                  <li className="flex items-center gap-1 rounded text-xs text-gray-400">
                    <button type="button" aria-expanded={!folded.includes(gk)} onClick={() => setFolded(f => (f.includes(gk) ? f.filter(x => x !== gk) : [...f, gk]))} className="flex-1 flex items-center gap-1 px-2 py-0.5 text-left hover:text-white">
                      <Icon name={folded.includes(gk) ? 'chevronRight' : 'chevronDown'} />
                      <Icon name="link" />
                      Group {(layout[view].links ?? []).indexOf(set) + 1}
                    </button>
                  </li>
                )}
                <li
                  onMouseEnter={() => hoverElement(id)}
                  onDoubleClick={() => selectTarget(id)}
                  onContextMenu={menuOn(view, id)}
                  className={`flex items-center gap-1 rounded ${selection.includes(id) ? 'bg-yellow-500/15' : 'hover:bg-white/5'}`}
                >
                  <button
                    type="button"
                    onClick={e => (e.shiftKey ? toggleSelect(id) : selectTarget(id))}
                    aria-current={selected === id}
                    className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-1 text-left text-sm truncate ${visible ? 'text-gray-200' : 'text-gray-500 line-through'}`}
                  >
                    <Icon name={LAYER_KINDS[id]} className="text-gray-500 shrink-0" />
                    {LAYER_NAMES[id]}
                    {overlapping.includes(id) && <Icon name="warning" className="text-fuchsia-400 shrink-0" title="Overlaps a Twitch zone (webcam, chat or alerts)" />}
                    {STYLE_KEYS[id]?.some(k => hasFx(valueOf(k))) && <FxBadge />}
                    {moved && <span role="img" aria-label="moved" title="Moved from its normal spot" className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLock([id])}
                    aria-pressed={locked.includes(id)}
                    aria-label={`${locked.includes(id) ? 'Unlock' : 'Lock'} ${LAYER_NAMES[id]}`}
                    title={locked.includes(id) ? 'Unlock' : 'Lock against moving and resizing on the canvas'}
                    className={`px-1 hover:text-white ${locked.includes(id) ? 'text-yellow-400' : 'text-gray-600'}`}
                  >
                    <Icon name={locked.includes(id) ? 'lock' : 'unlock'} />
                  </button>
                  {moved && (
                    <button type="button" onClick={() => reset(view, id)} aria-label={`Reset ${LAYER_NAMES[id]} position`} title="Put back in its normal spot" className="px-1 text-gray-500 hover:text-white">
                      <Icon name="undo" />
                    </button>
                  )}
                  {key && (
                    <button
                      type="button"
                      onClick={() => setValue(key, !visible)}
                      aria-pressed={!visible}
                      aria-label={`Hide ${LAYER_NAMES[id]}`}
                      title={visible ? 'Hide' : 'Show'}
                      className="px-1 text-gray-500 hover:text-white"
                    >
                      <Icon name={visible ? 'eye' : 'eyeOff'} />
                    </button>
                  )}
                </li>
                </Fragment>
              );
            })}
          </ul>
          <ul>
            {(layout[view].custom ?? []).map(l => {
              const id = `custom:${l.id}`;
              return (
                <li key={l.id} draggable onDragStart={e => { e.dataTransfer.setData(DRAG_TYPE, `${view}:${l.id}`); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={e => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                  onDrop={e => {
                    const data = e.dataTransfer.getData(DRAG_TYPE);
                    if (!data) return;
                    e.preventDefault();
                    const at = data.indexOf(':'), from = data.slice(at + 1); // ids may hold ':' in a hand-edited layout
                    if (data.slice(0, at) !== view || !from) return;
                    if (moveCustomOnto(layout[view].custom ?? [], from, l.id) !== (layout[view].custom ?? [])) setCustom(view, c => moveCustomOnto(c, from, l.id), 'Reorder layers');
                  }}
                  onContextMenu={e => { selectView(view); selectTarget(id); menuOn(view, id)(e); }}
                  className={`flex items-center gap-1 rounded ${selection.includes(id) ? 'bg-yellow-500/15' : 'hover:bg-white/5'}`}>
                  {renaming === view + l.id ? (
                    <input autoFocus defaultValue={l.name} maxLength={40} aria-label="Layer name" onFocus={e => e.currentTarget.select()} onBlur={e => rename(view, l.id, e.currentTarget.value)}
                      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { e.currentTarget.value = l.name; e.currentTarget.blur(); } }}
                      className="flex-1 min-w-0 mx-1 my-0.5 rounded border border-gray-600 bg-gray-950 px-1.5 py-0.5 text-sm text-gray-100" />
                  ) : <button type="button" onClick={() => { selectView(view); selectTarget(id); }} onDoubleClick={() => setRenaming(view + l.id)} title="Double-click to rename" aria-current={selected === id} className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-1 text-left text-sm truncate ${l.visible ? 'text-gray-200' : 'text-gray-500 line-through'}`}>
                    <Icon name={l.kind === 'text' ? 'text' : l.kind === 'image' ? 'image' : l.kind === 'goal' ? 'trophy' : 'stop'} className="text-gray-500 shrink-0" />
                    {l.name}
                    {overlapping.includes(id) && <Icon name="warning" className="text-fuchsia-400 shrink-0" title="Overlaps a Twitch zone (webcam, chat or alerts)" />}
                    {lowContrast[id] !== undefined && <Icon name="warning" className="text-orange-400 shrink-0" title={`Low contrast (${lowContrast[id].toFixed(1)}:1)`} />}
                    {l.band === 'back' && <span className="text-[10px] text-gray-500 shrink-0">behind</span>}
                  </button>}
                  <button type="button" onClick={() => setCustom(view, c => c.map(x => (x.id === l.id ? { ...x, visible: !x.visible } : x)), `${l.visible ? 'Hide' : 'Show'} ${l.name}`)} aria-pressed={!l.visible} aria-label={`Hide ${l.name}`} title={l.visible ? 'Hide' : 'Show'} className="px-1 text-gray-500 hover:text-white">
                    <Icon name={l.visible ? 'eye' : 'eyeOff'} />
                  </button>
                  <button type="button" onClick={() => { if (selected === id) selectView(view); setCustom(view, c => c.filter(x => x.id !== l.id), `Delete ${l.name}`); }} aria-label={`Delete ${l.name}`} title="Delete layer" className="px-1 text-gray-500 hover:text-red-400">
                    <Icon name="trash" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-1 px-1 pt-1 text-xs text-gray-500">
            Add layer
            {(['text', 'image', 'shape', 'goal'] as CustomKind[]).map(k => (
              <button key={k} type="button" disabled={(layout[view].custom?.length ?? 0) >= MAX_CUSTOM} onClick={() => add(view, k)} className="rounded border border-gray-700 px-1.5 py-0.5 hover:border-gray-500 hover:text-white disabled:opacity-40">
                <Icon name="plus" /> {k}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
