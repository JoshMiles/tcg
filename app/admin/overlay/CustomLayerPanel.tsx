'use client';

import { useEffect, useState } from 'react';
import { FontPicker } from '@/app/admin/components/workspace/FontPicker';
import { BACK_FONTS, FONT_CATEGORIES } from '@/lib/card-back';
import { loadBackFont } from '@/lib/card-back-fonts';
import { IMAGE_FITS, MAX_CUSTOM_TEXT, SHAPES, VALIGNS, isSafeImageUrl, type CustomLayer, type CustomText } from '@/lib/overlay-custom';
import type { PropDef } from '@/lib/overlay-props';
import type { Mode } from './editor-types';
import { Segmented, TextControl, TextPatchPanel, inputCls } from './editor-controls';
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
      {layer.kind === 'text' && <TextFields layer={layer} view={view} set={set} />}
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

/** A text layer's fields: the wording (token chips, markup buttons, live result), font, size, colour, vertical align and the shared Character panel. */
function TextFields({ layer, view, set }: { layer: CustomText; view: Mode; set: (patch: Record<string, unknown>) => void }) {
  const { valueOf, focusText, setFocusText } = useOverlayEditor();
  const id = `custom-text-${layer.id}`;
  // A double-click on the layer in the preview, or the Text tool, asks for the wording field.
  useEffect(() => {
    if (focusText !== layer.id) return;
    const el = document.getElementById(id) as HTMLInputElement | null;
    el?.focus();
    el?.select();
    setFocusText('');
  }, [focusText, layer.id, id, setFocusText]);
  // The collection view only knows the viewer's name.
  const def: PropDef = { key: 'custom.text', group: 'custom', label: 'Wording', type: 'text', default: '', maxLength: MAX_CUSTOM_TEXT, tokens: view === 'pack' ? ['user', 'cardName', 'variant', 'pack', 'stars'] : ['user'] };
  return (
    <>
      <label htmlFor={id} className="text-xs text-gray-500 block">Wording</label>
      <TextControl def={def} id={id} value={layer.text} onChange={v => set({ text: String(v) })} />
      <FontPicker
        label="Font"
        fonts={BACK_FONTS}
        categories={FONT_CATEGORIES}
        extra={[{ id: 'inherit', label: 'Overlay font', css: 'inherit', category: 'Site' }]}
        value={layer.font}
        onChange={v => set({ font: v })}
        onNeedFont={f => { void loadBackFont(f, 700); }}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-gray-500 space-y-1">Size (px)<input type="number" min={6} max={400} value={layer.size} onChange={e => { if (e.target.value !== '') set({ size: Number(e.target.value) }); }} className={`${inputCls} block w-20`} /></label>
        <label className="text-xs text-gray-500 space-y-1">Colour<input type="color" value={layer.color} onChange={e => set({ color: e.target.value })} className="block h-8 w-12" /></label>
      </div>
      <Segmented label="Vertical align" value={layer.valign} onChange={v => set({ valign: v })} options={VALIGNS.map(a => ({ id: a, label: a }))} />
      <TextPatchPanel
        own={layer.style}
        inherited={{}}
        fontId={layer.font === 'inherit' ? String(valueOf('text.font')) : layer.font}
        wording
        stopLabel="Clear every style field of this layer"
        onChange={v => set({ style: v })}
      />
    </>
  );
}
