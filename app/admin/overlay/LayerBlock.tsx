'use client';

import { ScrubLabel } from '../components/workspace/ScrubLabel';
import { ELEMENT_IDS,type ElementId } from '@/lib/overlay-layout';
import { LAYER_NAMES } from './LayersPanel';
import { ghost, inputCls } from './editor-controls';
import { useOverlayEditor } from './OverlayEditorContext';

/** A number field where Up / Down step 1 and Shift+Up / Down step 10; each change is reported as the new value. */
function NumField({ label, value, unit, onChange }: { label: string; value: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="text-xs text-gray-500 space-y-1">
      <ScrubLabel value={value} onChange={onChange}>{label}</ScrubLabel>
      <span className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={e => { if (e.target.value !== '' && Number.isFinite(Number(e.target.value))) onChange(Number(e.target.value)); }}
          onKeyDown={e => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            onChange(value + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
          }}
          className={`${inputCls} block w-20`}
        />
        {unit && <span className="text-gray-600">{unit}</span>}
      </span>
    </label>
  );
}

/** Position, size and opacity of the selected part, as numbers. Top of Properties in Layer mode; not shown in a pack override. */
export function LayerBlock() {
  const { isPack, selected, layout, editLayer, resetLayer } = useOverlayEditor();
  const id = selected as ElementId;
  if (isPack || !(Object.values(ELEMENT_IDS).flat() as string[]).includes(selected)) return null;
  const view = (ELEMENT_IDS.collection as readonly string[]).includes(id) ? 'collection' : 'pack';
  const e = layout[view].elements?.[id] ?? { scale: 1, offsetX: 0, offsetY: 0 };
  const opacity = Math.round((e.opacity ?? 1) * 100);
  const changed = e.scale !== 1 || e.offsetX !== 0 || e.offsetY !== 0 || e.opacity !== undefined;
  return (
    <section aria-label="Layer" className="p-3 space-y-2 border-b border-gray-800">
      <h3 className="text-[10px] uppercase tracking-wide text-gray-600">Layer</h3>
      <div className="flex flex-wrap gap-3">
        <NumField label="X" value={e.offsetX} unit="px" onChange={v => editLayer(view, id, { offsetX: v })} />
        <NumField label="Y" value={e.offsetY} unit="px" onChange={v => editLayer(view, id, { offsetY: v })} />
        <NumField label="Size" value={Math.round(e.scale * 100)} unit="%" onChange={v => editLayer(view, id, { scale: v / 100 })} />
      </div>
      <div className="flex items-end gap-2">
        <label className="text-xs text-gray-500 space-y-1 flex-1">
          Opacity
          <input
            type="range" min={0} max={100} step={1} value={opacity}
            onChange={ev => editLayer(view, id, { opacity: Number(ev.target.value) / 100 })}
            aria-label={`${LAYER_NAMES[id]} opacity`}
            className="block w-full accent-yellow-500"
          />
        </label>
        <NumField label="" value={opacity} unit="%" onChange={v => editLayer(view, id, { opacity: v / 100 })} />
      </div>
      <p className="text-[11px] text-gray-500 leading-snug">X and Y are relative to where the part normally sits.</p>
      <button type="button" disabled={!changed} onClick={() => resetLayer(view, id)} className={`${ghost} disabled:opacity-40`}>
        Reset {LAYER_NAMES[id]}
      </button>
    </section>
  );
}
