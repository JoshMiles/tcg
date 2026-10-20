'use client';
import { useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { ELEMENT_IDS, type ElementId, type OverlayLayout } from '@/lib/overlay-layout';
import type { PropValue } from '@/lib/overlay-props';
import type { Mode } from './editor-types';

// Readable names, and the existing show/hide property of each element (none for the card and the collection grid).
const NAMES: Record<ElementId, string> = {
  card: 'Card', label: 'Label', serial: 'Edition badge', bar: 'Name and stars bar', got: '"got:" line',
  strip: 'Card strip', showlabel: 'Show-off label', heading: 'Heading', grid: 'Collection grid',
};
const VISIBLE_KEY: Partial<Record<ElementId, string>> = {
  label: 'reveal.showLabel', serial: 'reveal.showSerial', bar: 'reveal.showInfoBar', got: 'reveal.showGotLine',
  strip: 'reveal.showMiniList', showlabel: 'show.showLabel', heading: 'collection.showHeading',
};
const VIEWS: { view: Mode; label: string }[] = [
  { view: 'pack', label: 'Pack opening' },
  { view: 'collection', label: 'Collection' },
];

// The preview's elements as a list: select, hover-highlight, hide (where a show/hide setting exists) and reset a moved one.
export function LayersPanel({ layout, selected, valueOf, setValue, setLayoutVals, selectTarget, selectView, hoverElement, openLayerMenu }: {
  layout: OverlayLayout;
  selected: string;
  valueOf: (key: string) => PropValue;
  setValue: (key: string, raw: unknown) => void;
  setLayoutVals: (u: OverlayLayout | ((l: OverlayLayout) => OverlayLayout)) => void;
  selectTarget: (target: string) => void;
  selectView: (view: Mode) => void;
  hoverElement: (target: string) => void;
  openLayerMenu: (view: Mode, id: string | null, x: number, y: number) => void;
}) {
  const menuOn = (view: Mode, id: string | null) => (e: React.MouseEvent) => {
    e.preventDefault();
    openLayerMenu(view, id, e.clientX, e.clientY);
  };
  const [open, setOpen] = useState(true);
  const reset = (view: Mode, id: ElementId) =>
    setLayoutVals(l => {
      const { [id]: _gone, ...rest } = l[view].elements ?? {};
      return { ...l, [view]: { ...l[view], elements: rest } };
    });
  return (
    <section className="border-b border-gray-800/80">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5">
        <Icon name="chevronRight" className={`w-3 h-3 text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        <Icon name="layers" className="text-gray-400" />
        <span className="text-sm font-semibold text-gray-200">Layers</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2" onMouseLeave={() => hoverElement('')}>
          {VIEWS.map(({ view, label }) => (
            <div key={view}>
              <button type="button" onClick={() => selectView(view)} onContextMenu={menuOn(view, null)} className="text-xs uppercase tracking-wide text-gray-500 font-semibold hover:text-white">
                {label}
              </button>
              <ul>
                {ELEMENT_IDS[view].map(id => {
                  const moved = !!layout[view].elements?.[id];
                  const key = VISIBLE_KEY[id];
                  const visible = key ? valueOf(key) !== false : true;
                  return (
                    <li
                      key={id}
                      onMouseEnter={() => hoverElement(id)}
                      onContextMenu={menuOn(view, id)}
                      className={`flex items-center gap-1 rounded ${selected === id ? 'bg-yellow-500/15' : 'hover:bg-white/5'}`}
                    >
                      <button
                        type="button"
                        onClick={() => selectTarget(id)}
                        aria-current={selected === id}
                        className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-1 text-left text-sm truncate ${visible ? 'text-gray-200' : 'text-gray-500 line-through'}`}
                      >
                        {NAMES[id]}
                        {moved && <span role="img" aria-label="moved" title="Moved from its normal spot" className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />}
                      </button>
                      {moved && (
                        <button type="button" onClick={() => reset(view, id)} aria-label={`Reset ${NAMES[id]} position`} title="Put back in its normal spot" className="px-1 text-gray-500 hover:text-white">
                          <Icon name="undo" />
                        </button>
                      )}
                      {key && (
                        <button
                          type="button"
                          onClick={() => setValue(key, !visible)}
                          aria-pressed={!visible}
                          aria-label={`Hide ${NAMES[id]}`}
                          title={visible ? 'Hide' : 'Show'}
                          className="px-1 text-gray-500 hover:text-white"
                        >
                          <Icon name={visible ? 'eye' : 'eyeOff'} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
