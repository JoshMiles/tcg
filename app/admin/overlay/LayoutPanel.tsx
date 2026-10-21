'use client';
import { DEFAULT_LAYOUT, DEFAULT_PLACEMENT, ELEMENT_IDS, LAYOUT_PRESETS, VERTICAL_LAYOUT_PRESETS, isVertical, type ElementId, type OverlayLayout, type Placement } from '@/lib/overlay-layout';
import { Segmented, btn, ghost, inputCls } from './editor-controls';
import type { Mode } from './editor-types';

// The Layout category: stage size and where each view sits. `layoutVals` is the raw (still being typed) layout, `layout` the sanitized copy.
export function LayoutPanel({
  layout, layoutVals, isScene, sceneName, isPack, selected, mode, setMode, setLayoutVals, setPlacement, setValue, setNotice,
}: {
  layout: OverlayLayout;
  layoutVals: OverlayLayout;
  isScene: boolean;
  sceneName: string;
  isPack: boolean;
  selected: string;
  mode: Mode;
  setMode: (m: Mode) => void;
  setLayoutVals: (u: OverlayLayout | ((l: OverlayLayout) => OverlayLayout), label?: string) => void;
  setPlacement: (patch: Partial<Placement> | ((p: Placement) => Partial<Placement>)) => void;
  setValue: (key: string, raw: unknown) => void;
  setNotice: (message: string) => void;
}) {
  const placement = layout[mode];
  const setSize = (patch: Partial<Pick<OverlayLayout, 'width' | 'height'>>) => setLayoutVals(l => ({ ...l, ...patch }), 'Stage size');
  const moved = (p: Placement) => p.scale !== 1 || p.offsetX !== 0 || p.offsetY !== 0 || !!Object.keys(p.elements ?? {}).length;
  const elements = placement.elements ?? {};
  const selectedMoved = (ELEMENT_IDS[mode] as readonly string[]).includes(selected) && !!elements[selected as ElementId];
  const setElements = (next: Placement['elements']) => setLayoutVals(l => ({ ...l, [mode]: { ...l[mode], elements: next } }), 'Reset elements');
  const viewName = mode === 'pack' ? 'pack opening' : 'collection view';
  return (
    <div className="p-3 space-y-5">
      <section className="space-y-2">
        <h4 className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Browser source size <span className="normal-case text-gray-600 font-normal">· {isScene ? `scene "${sceneName}"` : 'shared by both views'}</span></h4>
        <p className="text-xs text-gray-400 leading-relaxed">
          Set the OBS browser source to <code className="text-yellow-400">{layout.width}</code> × <code className="text-yellow-400">{layout.height}</code>.
          The overlay is drawn at this size and scaled to fit if your source differs, so nothing gets cut off.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {LAYOUT_PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => setSize({ width: p.width, height: p.height })}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${layout.width === p.width && layout.height === p.height ? 'border-yellow-500 text-yellow-300' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-gray-600 mr-1">Vertical</span>
          {VERTICAL_LAYOUT_PRESETS.map(p => (
            <button
              key={p.label}
              type="button"
              onClick={() => setSize({ width: p.width, height: p.height })}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${layout.width === p.width && layout.height === p.height ? 'border-yellow-500 text-yellow-300' : 'border-gray-700 text-gray-300 hover:border-gray-500'}`}
            >
              {p.label}
            </button>
          ))}
          <button type="button" onClick={() => setSize({ width: layout.height, height: layout.width })} title="Swap width and height" className={`${btn} border border-gray-700 text-gray-300 hover:border-gray-500 py-1`}>Rotate</button>
        </div>
        {isVertical(layout) && (
          <div className="rounded-lg border border-sky-500/25 bg-sky-950/20 p-2.5 text-xs text-sky-100/90 space-y-1.5">
            <p>Vertical stage. The collection wraps to the stage width, so pick how many cards fit on a line (3 or 4 suits a phone-shaped canvas) under Collection, then centre each view here.</p>
            {!isPack && <button type="button" onClick={() => { setValue('collection.perRow', 4); setNotice('Set the collection to 4 cards per row. Review, then Save.'); }} className={`${btn} border border-sky-400/40 text-sky-200 hover:bg-sky-500/10 py-1`}>Show 4 cards per row</button>}
          </div>
        )}
        <div className="flex gap-3">
          <label className="text-xs text-gray-500 space-y-1">Width
            <input type="number" min={320} max={3840} value={layoutVals.width} onChange={e => setSize({ width: Number(e.target.value) })} className={`${inputCls} block w-24`} />
          </label>
          <label className="text-xs text-gray-500 space-y-1">Height
            <input type="number" min={240} max={2160} value={layoutVals.height} onChange={e => setSize({ height: Number(e.target.value) })} className={`${inputCls} block w-24`} />
          </label>
        </div>
      </section>

      <section className="space-y-3 border-t border-gray-800 pt-4">
        <h4 className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Position</h4>
        <Segmented
          label="Placing"
          value={mode}
          onChange={v => setMode(v as Mode)}
          options={[{ id: 'pack', label: 'Pack opening', dot: moved(layout.pack) }, { id: 'collection', label: 'Collection', dot: moved(layout.collection) }]}
          wrap
        />
        <p className="text-xs text-gray-500 leading-relaxed">
          The size and position of the {viewName} are independent of the other view. <strong className="text-gray-400">Drag it on the canvas</strong>, or select it and use the arrow keys (Shift for bigger steps).
        </p>
        <label className="block space-y-1 text-sm text-gray-300">
          Size <span className="text-white font-semibold">{Math.round(placement.scale * 100)}%</span>
          <input
            type="range" min={0.3} max={1.5} step={0.01} value={placement.scale}
            onChange={e => setPlacement({ scale: Number(e.target.value) })}
            className="block w-full accent-yellow-500"
          />
        </label>
        <div className="flex gap-3">
          <label className="text-xs text-gray-500 space-y-1">Offset X
            <input type="number" value={placement.offsetX} onChange={e => setPlacement({ offsetX: Number(e.target.value) })} className={`${inputCls} block w-24`} />
          </label>
          <label className="text-xs text-gray-500 space-y-1">Offset Y
            <input type="number" value={placement.offsetY} onChange={e => setPlacement({ offsetY: Number(e.target.value) })} className={`${inputCls} block w-24`} />
          </label>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          Each part (label, bar, card strip...) also moves on its own: drag it, or select it and use the arrow keys. <strong className="text-gray-400">Shift+drag</strong> moves the whole view.
        </p>
        <div className="flex flex-wrap gap-2">
          {selectedMoved && <button type="button" onClick={() => { const { [selected as ElementId]: _gone, ...rest } = elements; setElements(rest); }} className={ghost}>Reset {selected}</button>}
          {Object.keys(elements).length > 0 && <button type="button" onClick={() => setElements({})} className={ghost}>Reset all elements</button>}
          <button type="button" onClick={() => setPlacement({ offsetX: 0, offsetY: 0 })} className={ghost}>Center</button>
          <button type="button" onClick={() => setPlacement({ ...DEFAULT_PLACEMENT })} className={`${btn} text-gray-400 hover:text-white`}>Reset {viewName}</button>
        </div>
      </section>

      <button type="button" onClick={() => setLayoutVals(DEFAULT_LAYOUT, 'Reset the whole layout')} className="text-xs text-gray-500 hover:text-red-300">Reset the whole layout</button>
    </div>
  );
}
