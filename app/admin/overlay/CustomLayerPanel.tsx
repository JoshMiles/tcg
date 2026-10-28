'use client';

import { useEffect, useState } from 'react';
import { ImageUploadField } from '@/app/admin/components/image-upload';
import { ScrubLabel } from '@/app/admin/components/workspace/ScrubLabel';
import { EffectFields, Group, Num } from '@/app/admin/components/workspace/CharacterPanel';
import { ShapeFields } from '@/app/admin/components/workspace/ShapeFields';
import { IMAGE_FITS, MAX_CUSTOM_TEXT, isSafeImageUrl, type CustomLayer, type CustomText } from '@/lib/overlay-custom';
import type { TextStyle } from '@/lib/text-style';
import { inkFor, parseHex } from '@/lib/contrast';
import { Icon } from '@/app/components/Icon';
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
  const set = (patch: Record<string, unknown>, label = `Custom layer "${layer.name}"`) =>
    setLayoutVals(l => ({ ...l, [view]: { ...l[view], custom: (l[view].custom ?? []).map(x => (x.id === layerId ? ({ ...x, ...patch } as CustomLayer) : x)) } }), label);
  const num = (label: string, key: 'x' | 'y' | 'w' | 'h' | 'rotate', unit = 'px') => (
    <label className="text-xs text-gray-500 space-y-1">
      <ScrubLabel value={layer[key]} onChange={v => set({ [key]: v })}>{label}</ScrubLabel>
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
      <Segmented label="Layer sits" value={layer.band} onChange={v => set({ band: v })} options={[{ id: 'back', label: 'Behind the card' }, { id: 'front', label: 'In front' }]} wrap />
      {view === 'pack' && <Segmented label="Show" value={layer.show} onChange={v => set({ show: v })} options={[{ id: 'always', label: 'Always' }, { id: 'reveal', label: 'During the reveal' }, { id: 'after', label: 'After the reveal' }]} wrap />}
      <div className="grid grid-cols-2 gap-2">
        <Num label="Fade in (ms)" value={layer.fadeIn} min={0} max={5000} step={50} onChange={v => set({ fadeIn: v })} />
        <Num label="Fade out (ms)" value={layer.fadeOut} min={0} max={5000} step={50} onChange={v => set({ fadeOut: v })} />
      </div>
      {layer.kind === 'text' && <TextFields layer={layer} view={view} set={set} />}
      {layer.kind === 'image' && (
        <>
          <ImageUploadField key={layer.id} name={`custom-${layer.id}`} defaultValue={layer.url} label="Image (upload, or a Blob file or path on this site)" onUrlChange={v => { const u = v.trim(); if (u === '' || isSafeImageUrl(u)) { setBad(false); if (u !== layer.url) set({ url: u }); } else setBad(true); }} />
          {bad && <p className="text-xs text-red-400">Only uploaded files and paths on this site can be used.</p>}
          <label className="text-xs text-gray-500 space-y-1 block">
            Fit
            <select value={layer.fit} onChange={e => set({ fit: e.target.value })} className="select select-sm block">{IMAGE_FITS.map(f => <option key={f} value={f}>{f}</option>)}</select>
          </label>
          <Num label="Corner radius" value={layer.radius} min={0} max={1000} onChange={v => set({ radius: v })} />
          <Group title="Effects">
            <EffectFields value={{ fx: layer.fx } as TextStyle} text={false} stroke onChange={p => set({ fx: p.fx })} />
          </Group>
        </>
      )}
      {layer.kind === 'shape' && <ShapeFields spec={layer} fx={layer.fx} set={set} />}
      {layer.kind === 'goal' && (
        <>
          <p className="text-xs text-gray-500">Shows the community pack goal (Mix It Up, Paid pulls). Nothing is drawn while no goal is set. It updates about every 10 seconds, and shows with the pack and collection views like any layer. The editor shows a sample.</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {([['color', 'Bar'], ['track', 'Track'], ['textColor', 'Words']] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5">{label}
                <input type="color" aria-label={`${label} colour`} value={layer[k]} onChange={e => set({ [k]: e.target.value })} className="h-8 w-10 rounded-sm bg-transparent border border-gray-700 cursor-pointer" />
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={layer.showText} onChange={e => set({ showText: e.target.checked })} className="toggle toggle-sm" /> Show the words
          </label>
          <Num label="Words size" value={layer.size} min={6} max={200} onChange={v => set({ size: v })} />
        </>
      )}
    </section>
  );
}

/** A text layer's fields: the wording (token chips, markup buttons, live result), font, size, colour, vertical align and the shared Character panel. */
function TextFields({ layer, view, set }: { layer: CustomText; view: Mode; set: (patch: Record<string, unknown>, label?: string) => void }) {
  const { valueOf, focusText, setFocusText, lowContrast } = useOverlayEditor();
  const low = lowContrast[`custom:${layer.id}`];
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
      {low !== undefined && (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-xs text-orange-300">
          <Icon name="warning" />Low contrast ({low.toFixed(1)}:1)
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => set({ style: { ...layer.style, fx: { ...layer.style.fx, stroke: { color: inkFor(parseHex(layer.color) ?? [255, 255, 255]), width: 2, pos: 'outside' } } } }, `Add outline to "${layer.name}"`)}>Add outline</button>
        </p>
      )}
      <TextPatchPanel
        own={layer.style}
        inherited={{}}
        fontId={layer.font === 'inherit' ? String(valueOf('text.font')) : layer.font}
        wording
        moved
        stopLabel="Clear every style field of this layer"
        onChange={v => set({ style: v })}
      />
    </>
  );
}

