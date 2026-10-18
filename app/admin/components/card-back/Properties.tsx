'use client';
import { useState, type ReactNode } from 'react';
import { ImageUploadField } from '../image-upload';
import { PRINT_W } from './Canvas';
import { BACK_FONTS, KIND_LABELS, MAX_TEXT, WEIGHTS, type BackEl, type CardBackStyle, type Effects } from '@/lib/card-back';
import { BLENDS, PATTERN_IDS, PATTERN_LABELS } from '@/lib/card-back-patterns';
import { plateBackground } from '@/lib/card-back-v1';
import { makeFree, patchBackground, patchElements, resetElement, returnToStack, type Box } from '@/lib/card-back-edit';

const field = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-hidden focus:border-yellow-500';
const chip = (on: boolean) => `px-2 py-1 text-xs font-bold rounded-lg border ${on ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300' : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'}`;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-2 border-b border-gray-800 pb-3 mb-3 last:border-0"><h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">{title}</h4>{children}</section>;
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex items-center gap-2 text-xs text-gray-400"><span className="w-20 shrink-0">{label}</span><span className="flex-1 min-w-0">{children}</span></label>;
}
function Num({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Row label={label}>
      <input type="number" aria-label={label} className={field} min={min} max={max} step={step} value={text !== null && Number(text) === value ? text : String(Math.round(value * 100) / 100)}
        onChange={e => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n); }} onBlur={() => setText(null)} />
    </Row>
  );
}
function Check({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return <label className="inline-flex items-center gap-1.5 text-xs text-gray-200"><input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)} className="accent-yellow-400" />{label}</label>;
}
/** A colour: the picker and a hex box, plus optional named values (`auto`, `rarity`). */
function Colour({ label, value, onChange, named = [] }: { label: string; value: string; onChange: (v: string) => void; named?: string[] }) {
  const isHex = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <Row label={label}>
      <span className="flex flex-wrap items-center gap-1.5">
        <input type="color" aria-label={`${label} colour`} value={isHex ? value : '#808080'} onChange={e => onChange(e.target.value)} className="w-8 h-7 rounded-sm bg-transparent border border-gray-700 p-0.5" />
        <input aria-label={`${label} hex`} className={`${field} w-24!`} value={isHex ? value : ''} placeholder={value} onChange={e => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase()); }} />
        {named.map(n => <button key={n} type="button" onClick={() => onChange(n)} aria-pressed={value === n} className={chip(value === n)}>{n}</button>)}
      </span>
    </Row>
  );
}

/** The properties of the selection: the element's placement, type, content and effects, or the background when nothing (or the background) is selected. */
export function Properties({ style, selection, boxes, cardW, onChange }: {
  style: CardBackStyle;
  selection: Set<string>;
  boxes: Record<string, Box & { fontPx: number }>;
  cardW: number;
  onChange: (next: CardBackStyle, key?: string) => void;
}) {
  const ids = style.elements.filter(e => selection.has(e.id)).map(e => e.id);
  if (selection.has('bg') || ids.length === 0) return <BackgroundPanel style={style} onChange={onChange} />;
  const els = style.elements.filter(e => ids.includes(e.id));
  const e = els[0];
  const many = els.length > 1;
  const set = (patch: Partial<BackEl>, key?: string) => onChange(patchElements(style, ids, patch), key ? `${ids.join()}:${key}` : undefined);
  const fx = (patch: Partial<Effects>, key?: string) => set({ fx: { ...e.fx, ...patch } }, key);
  const text = e.kind !== 'qr' && e.kind !== 'logo';
  const free = els.every(x => x.place === 'free');
  const toFree = () => { let s = style; for (const x of els) { const b = boxes[x.id]; if (b && x.place === 'stack') s = makeFree(s, x.id, b, b.fontPx, PRINT_W); } onChange(s); };

  return (
    <div>
      <p className="text-sm font-semibold text-white mb-2">{many ? `${els.length} elements` : e.kind === 'text' ? 'Text box' : KIND_LABELS[e.kind]}</p>

      <Group title="Placement">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={chip(!free)} onClick={() => onChange(els.reduce((s, x) => returnToStack(s, x.id), style))}>In the stack</button>
          <button type="button" className={chip(free)} onClick={toFree}>Placed freely</button>
        </div>
        {free ? (
          <>
            <Num label="x (%)" value={e.x} min={0} max={100} step={0.5} onChange={v => set({ x: v }, 'x')} />
            <Num label="y (%)" value={e.y} min={0} max={100} step={0.5} onChange={v => set({ y: v }, 'y')} />
            <Num label="Width (%)" value={e.w} min={10} max={100} step={1} onChange={v => set({ w: v }, 'w')} />
            <Num label="Rotate" value={e.rotate} min={-45} max={45} step={1} onChange={v => set({ rotate: v }, 'rot')} />
          </>
        ) : <p className="text-xs text-gray-500">In the stack the element sits in the classic centred column, in list order. Place it freely to move it, rotate it and style its type.</p>}
        <Check label="Locked (the canvas can't drag it)" on={e.locked} onChange={v => set({ locked: v })} />
      </Group>

      {text && (
        <Group title="Text">
          {free ? (
            <>
              <Row label="Font">
                <select aria-label="Font" className={field} value={e.font} style={{ fontFamily: BACK_FONTS.find(f => f.id === e.font)?.css }} onChange={ev => set({ font: ev.target.value })}>
                  {BACK_FONTS.map(f => <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>{f.label}</option>)}
                </select>
              </Row>
              <Num label="Size (%)" value={e.size} min={2} max={30} step={0.5} onChange={v => set({ size: v }, 'size')} />
              <Row label="Weight"><select aria-label="Weight" className={field} value={e.weight} onChange={ev => set({ weight: Number(ev.target.value) })}>{WEIGHTS.map(w => <option key={w} value={w}>{w}</option>)}</select></Row>
              <div className="flex flex-wrap gap-3"><Check label="Italic" on={e.italic} onChange={v => set({ italic: v })} /><Check label="Underline" on={e.underline} onChange={v => set({ underline: v })} /><Check label="Uppercase" on={e.uppercase} onChange={v => set({ uppercase: v })} /></div>
              <Num label="Spacing" value={e.letterSpacing} min={-2} max={20} step={0.5} onChange={v => set({ letterSpacing: v }, 'ls')} />
              <Num label="Line height" value={e.lineHeight} min={0.8} max={2.5} step={0.05} onChange={v => set({ lineHeight: v }, 'lh')} />
              <Row label="Align"><span className="flex gap-1">{(['left', 'center', 'right'] as const).map(a => <button key={a} type="button" aria-pressed={e.align === a} onClick={() => set({ align: a })} className={chip(e.align === a)}>{a}</button>)}</span></Row>
              <Num label="Opacity" value={e.opacity} min={0} max={1} step={0.05} onChange={v => set({ opacity: v }, 'op')} />
            </>
          ) : (
            <Row label="Size"><span className="flex gap-1">{([['S', 0.8], ['M', 1], ['L', 1.25]] as const).map(([k, v]) => <button key={k} type="button" aria-pressed={e.scale === v} onClick={() => set({ scale: v })} className={chip(e.scale === v)}>{k}</button>)}</span></Row>
          )}
          <Colour label="Colour" value={e.color} named={['auto', 'rarity']} onChange={v => set({ color: v }, 'color')} />
        </Group>
      )}

      {!many && (e.kind === 'text' || e.kind === 'logo' || e.kind === 'qr') && (
        <Group title="Content">
          {e.kind === 'text' && (
            <label className="block text-xs text-gray-400">Text <span className="text-gray-600">({e.text.length}/{MAX_TEXT}) {'{pack} {season} {card} {version} {edition} {printNumber} {holder} {date}'}</span>
              <textarea aria-label="Text" className={`${field} mt-1`} rows={2} maxLength={MAX_TEXT} value={e.text} onChange={ev => set({ text: ev.target.value }, 'text')} />
            </label>
          )}
          {e.kind === 'logo' && (
            <>
              <Row label="Image"><span className="flex gap-1">{(['cover', 'url'] as const).map(s => <button key={s} type="button" aria-pressed={e.src === s} onClick={() => set({ src: s })} className={chip(e.src === s)}>{s === 'cover' ? 'Pack cover' : 'Uploaded'}</button>)}</span></Row>
              {e.src === 'url' && <ImageUploadField name="cardBackLogo" label="Logo image" defaultValue={e.url} onUrlChange={u => set({ url: u, src: 'url' })} />}
              <Num label="Size (px)" value={e.px} min={10} max={120} step={2} onChange={v => set({ px: v }, 'px')} />
            </>
          )}
          {e.kind === 'qr' && (<><Colour label="Dark" value={e.dark} named={['auto']} onChange={v => set({ dark: v })} /><Colour label="Light" value={e.light} named={['auto']} onChange={v => set({ light: v })} /></>)}
        </Group>
      )}

      <Group title="Effects">
        {text && <Check label="Engrave (pressed into the metal)" on={!!e.fx.engrave} onChange={v => fx({ engrave: v || undefined })} />}
        <div className="space-y-1.5"><Check label="Outline" on={!!e.fx.outline} onChange={v => fx({ outline: v ? { color: '#000000', width: 2 } : undefined })} />
          {e.fx.outline && <><Colour label="Colour" value={e.fx.outline.color} onChange={v => fx({ outline: { ...e.fx.outline!, color: v } })} /><Num label="Width" value={e.fx.outline.width} min={0} max={10} step={0.5} onChange={v => fx({ outline: { ...e.fx.outline!, width: v } }, 'ow')} /></>}</div>
        <div className="space-y-1.5"><Check label="Glow" on={!!e.fx.glow} onChange={v => fx({ glow: v ? { color: '#fbbf24', blur: 10, strength: 1 } : undefined })} />
          {e.fx.glow && <><Colour label="Colour" value={e.fx.glow.color} onChange={v => fx({ glow: { ...e.fx.glow!, color: v } })} /><Num label="Blur" value={e.fx.glow.blur} min={0} max={40} step={1} onChange={v => fx({ glow: { ...e.fx.glow!, blur: v } }, 'gb')} /><Num label="Strength" value={e.fx.glow.strength} min={0} max={3} step={1} onChange={v => fx({ glow: { ...e.fx.glow!, strength: v } }, 'gs')} /></>}</div>
        <div className="space-y-1.5"><Check label="Shadow" on={!!e.fx.shadow} onChange={v => fx({ shadow: v ? { color: '#000000', x: 0, y: 2, blur: 4 } : undefined })} />
          {e.fx.shadow && <><Colour label="Colour" value={e.fx.shadow.color} onChange={v => fx({ shadow: { ...e.fx.shadow!, color: v } })} /><Num label="x" value={e.fx.shadow.x} min={-20} max={20} step={1} onChange={v => fx({ shadow: { ...e.fx.shadow!, x: v } }, 'sx')} /><Num label="y" value={e.fx.shadow.y} min={-20} max={20} step={1} onChange={v => fx({ shadow: { ...e.fx.shadow!, y: v } }, 'sy')} /><Num label="Blur" value={e.fx.shadow.blur} min={0} max={30} step={1} onChange={v => fx({ shadow: { ...e.fx.shadow!, blur: v } }, 'sb')} /></>}</div>
        {text && <div className="space-y-1.5"><Check label="Gradient text" on={!!e.fx.gradientText} onChange={v => fx({ gradientText: v ? { from: '#fde68a', to: '#f59e0b', angle: 180 } : undefined })} />
          {e.fx.gradientText && <><Colour label="From" value={e.fx.gradientText.from} onChange={v => fx({ gradientText: { ...e.fx.gradientText!, from: v } })} /><Colour label="To" value={e.fx.gradientText.to} onChange={v => fx({ gradientText: { ...e.fx.gradientText!, to: v } })} /><Num label="Angle" value={e.fx.gradientText.angle} min={0} max={360} step={5} onChange={v => fx({ gradientText: { ...e.fx.gradientText!, angle: v } }, 'ga')} /></>}</div>}
      </Group>

      <button type="button" onClick={() => onChange(els.reduce((s, x) => resetElement(s, x.id), style))} className="text-xs font-bold text-gray-400 hover:text-white">Reset {many ? 'elements' : 'element'}</button>
    </div>
  );
}

function BackgroundPanel({ style, onChange }: { style: CardBackStyle; onChange: (next: CardBackStyle, key?: string) => void }) {
  const set = (patch: Parameters<typeof patchBackground>[1], key?: string) => onChange(patchBackground(style, patch), key);
  return (
    <div>
      <p className="text-sm font-semibold text-white mb-2">Background</p>
      <Group title="Plate">
        <div className="flex flex-wrap gap-1.5">{(['steel', 'solid', 'gradient'] as const).map(b => <button key={b} type="button" aria-pressed={style.background === b} onClick={() => set({ background: b })} className={chip(style.background === b)}>{b === 'steel' ? 'Brushed steel' : b === 'solid' ? 'One colour' : 'Gradient'}</button>)}</div>
        {style.background !== 'steel' && <Colour label={style.background === 'gradient' ? 'From' : 'Colour'} value={style.bg1} onChange={v => set({ bg1: v }, 'bg1')} />}
        {style.background === 'gradient' && <><Colour label="To" value={style.bg2} onChange={v => set({ bg2: v }, 'bg2')} /><Num label="Angle" value={style.angle} min={0} max={359} step={5} onChange={v => set({ angle: v }, 'ang')} /></>}
        <Colour label="Edge" value={style.edge} named={['rarity']} onChange={v => set({ edge: v }, 'edge')} />
        <Row label="Stack at"><span className="flex gap-1">{(['top', 'middle', 'bottom'] as const).map(a => <button key={a} type="button" aria-pressed={style.align === a} onClick={() => set({ align: a })} className={chip(style.align === a)}>{a}</button>)}</span></Row>
      </Group>
      <Group title="Pattern">
        <div role="group" aria-label="Pattern" className="grid grid-cols-5 gap-1.5">
          {PATTERN_IDS.map(id => (
            <button key={id} type="button" aria-pressed={style.pattern === id} aria-label={PATTERN_LABELS[id]} title={PATTERN_LABELS[id]} onClick={() => set({ pattern: id })}
              className={`h-14 rounded-md border overflow-hidden text-[9px] font-bold ${style.pattern === id ? 'border-yellow-400 ring-1 ring-yellow-400' : 'border-gray-700'}`}
              style={{ background: plateBackground({ background: 'steel', bg1: '#a9a9b3', bg2: '#dcdce3', angle: 135, pattern: id, cover: style.cover, patternColor: 'auto', patternOpacity: 1, patternScale: 1.4, patternAngle: 0 }) }}>
              <span className="bg-black/50 text-white px-0.5 rounded-sm">{id === 'none' ? 'none' : ''}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">{PATTERN_LABELS[style.pattern]}</p>
        {style.pattern !== 'none' && style.pattern !== 'cover' && (
          <>
            <Colour label="Colour" value={style.patternColor} named={['auto']} onChange={v => set({ patternColor: v }, 'pc')} />
            <Num label="Opacity" value={style.patternOpacity} min={0} max={1} step={0.05} onChange={v => set({ patternOpacity: v }, 'po')} />
            <Num label="Scale" value={style.patternScale} min={0.5} max={3} step={0.1} onChange={v => set({ patternScale: v }, 'ps')} />
            <Num label="Angle" value={style.patternAngle} min={0} max={359} step={5} onChange={v => set({ patternAngle: v }, 'pa')} />
          </>
        )}
        {style.pattern !== 'none' && <Row label="Blend"><span className="flex flex-wrap gap-1">{BLENDS.map(b => <button key={b} type="button" aria-pressed={style.patternBlend === b} onClick={() => set({ patternBlend: b })} className={chip(style.patternBlend === b)}>{b}</button>)}</span></Row>}
      </Group>
    </div>
  );
}
