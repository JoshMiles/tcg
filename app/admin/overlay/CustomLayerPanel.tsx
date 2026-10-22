'use client';

import { useState } from 'react';
import { IMAGE_FITS, SHAPES, isSafeImageUrl, type CustomLayer } from '@/lib/overlay-custom';
import type { Mode } from './editor-types';
import { inputCls } from './editor-controls';
import { useOverlayEditor } from './OverlayEditorContext';

/** The selected custom layer's fields (ROADMAP 38.7 a): name, box, opacity and one field per kind. The real tools and panels come later. */
export function CustomLayerPanel({ view, layerId }: { view: Mode; layerId: string }) {
  const { layout, setLayoutVals } = useOverlayEditor();
  const layer = layout[view].custom?.find(l => l.id === layerId);
  const [bad, setBad] = useState(false);
  if (!layer) return null;
  const set = (patch: Record<string, unknown>) =>
    setLayoutVals(l => ({ ...l, [view]: { ...l[view], custom: (l[view].custom ?? []).map(x => (x.id === layerId ? ({ ...x, ...patch } as CustomLayer) : x)) } }), `Custom layer "${layer.name}"`);
  const num = (label: string, key: 'x' | 'y' | 'w' | 'h' | 'rotate', unit = 'px') => (
    <label className="text-xs text-gray-500 space-y-1">
      {label}
      <span className="flex items-center gap-1">
        <input type="number" value={layer[key]} onChange={e => { if (e.target.value !== '' && Number.isFinite(Number(e.target.value))) set({ [key]: Number(e.target.value) }); }} className={`${inputCls} block w-20`} />
        <span className="text-gray-600">{unit}</span>
      </span>
    </label>
  );
  return (
    <section aria-label="Custom layer" className="p-3 space-y-3">
      <label className="text-xs text-gray-500 space-y-1 block">
        Name
        <input value={layer.name} maxLength={40} onChange={e => set({ name: e.target.value })} className={`${inputCls} block w-full`} />
      </label>
      <div className="grid grid-cols-3 gap-2">{num('X', 'x')}{num('Y', 'y')}{num('Rotate', 'rotate', 'deg')}{num('Width', 'w')}{num('Height', 'h')}</div>
      <label className="text-xs text-gray-500 space-y-1 block">
        Opacity {Math.round(layer.opacity * 100)}%
        <input type="range" min={0} max={100} value={Math.round(layer.opacity * 100)} onChange={e => set({ opacity: Number(e.target.value) / 100 })} className="range range-xs w-full" />
      </label>
      {layer.kind === 'text' && (
        <>
          <label className="text-xs text-gray-500 space-y-1 block">
            Wording
            <textarea value={layer.text} maxLength={300} rows={3} onChange={e => set({ text: e.target.value })} className="textarea textarea-sm block w-full" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-500 space-y-1">Size (px)<input type="number" min={6} max={400} value={layer.size} onChange={e => { if (e.target.value !== '') set({ size: Number(e.target.value) }); }} className={`${inputCls} block w-20`} /></label>
            <label className="text-xs text-gray-500 space-y-1">Colour<input type="color" value={layer.color} onChange={e => set({ color: e.target.value })} className="block h-8 w-12" /></label>
          </div>
        </>
      )}
      {layer.kind === 'image' && (
        <>
          <label className="text-xs text-gray-500 space-y-1 block">
            Image URL (an uploaded file or a path on this site)
            <input
              key={layer.url}
              defaultValue={layer.url}
              onBlur={e => { const v = e.target.value.trim(); if (v === '' || isSafeImageUrl(v)) { setBad(false); if (v !== layer.url) set({ url: v }); } else setBad(true); }}
              className={`${inputCls} block w-full`}
            />
          </label>
          {bad && <p className="text-xs text-red-400">Only uploaded files and paths on this site can be used.</p>}
          <label className="text-xs text-gray-500 space-y-1 block">
            Fit
            <select value={layer.fit} onChange={e => set({ fit: e.target.value })} className="select select-sm block">{IMAGE_FITS.map(f => <option key={f} value={f}>{f}</option>)}</select>
          </label>
        </>
      )}
      {layer.kind === 'shape' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-500 space-y-1">Shape<select value={layer.shape} onChange={e => set({ shape: e.target.value })} className="select select-sm block">{SHAPES.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="text-xs text-gray-500 space-y-1">Fill<input type="color" value={layer.fill.type === 'solid' ? layer.fill.color : '#facc15'} onChange={e => set({ fill: { type: 'solid', color: e.target.value } })} className="block h-8 w-12" /></label>
        </div>
      )}
    </section>
  );
}
