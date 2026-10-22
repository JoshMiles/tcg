'use client';
import { Icon, type IconName } from '@/app/components/Icon';
import { ELEMENT_IDS, type ElementId, type OverlayLayout } from '@/lib/overlay-layout';
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
export function LayersPanel({ layout, selected, selection, locked, toggleSelect, toggleLock, valueOf, setValue, setLayoutVals, selectTarget, selectView, hoverElement, openLayerMenu }: {
  layout: OverlayLayout;
  selected: string;
  selection: string[];
  locked: string[];
  toggleSelect: (target: string) => void;
  toggleLock: (ids: string[]) => void;
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
  const reset = (view: Mode, id: ElementId) =>
    setLayoutVals(l => {
      const { [id]: _gone, ...rest } = l[view].elements ?? {};
      return { ...l, [view]: { ...l[view], elements: rest } };
    });
  return (
    <div data-layers className="px-3 py-2 space-y-2" onMouseLeave={() => hoverElement('')}>
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
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
