'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { ImageUploadField } from '../image-upload';
import { PRINT_W } from './Canvas';
import { FontPicker } from '../workspace/FontPicker';
import { loadBackFont } from '@/lib/card-back-fonts';
import type { Shadow } from '@/lib/text-style';
import { BACK_FONTS, FONT_CATEGORIES, KIND_LABELS, MAX_TEXT, WEIGHT_NAMES, nearestWeight, type BackEl, type CardBackStyle, type Effects } from '@/lib/card-back';
import { DEFAULT_MIN_SIZE, SIZE_PRESETS, caseOf, pctToPt, ptToPct, type TextCase, type TextStyle } from '@/lib/text-style';
import { BLENDS, PATTERN_IDS, PATTERN_LABELS } from '@/lib/card-back-patterns';
import { plateBackground } from '@/lib/card-back-v1';
import { BUILTIN_TEXT_PRESETS, presetPatch, styleOf, type TextPreset } from '@/lib/text-presets';
import { deleteTextPresetAction, listTextPresetsAction, saveTextPresetAction } from '@/app/admin/text-preset-actions';
import { makeFree, patchBackground, patchElements, resetElement, returnToStack, type Box } from '@/lib/card-back-edit';

const field = 'input input-sm w-full';
const chip = (on: boolean) => `px-2 py-1 text-xs font-bold rounded-lg border ${on ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300' : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'}`;

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-2 border-b border-gray-800 pb-3 mb-3 last:border-0"><h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">{title}</h4>{children}</section>;
}
function Row({ label, children, reset }: { label: string; children: ReactNode; reset?: () => void }) {
  return <label className="flex items-center gap-2 text-xs text-gray-400"><span className="w-20 shrink-0 flex items-center gap-1">{label}{reset && <button type="button" aria-label={`Reset ${label}`} title="Reset to the default" onClick={reset} className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />}</span><span className="flex-1 min-w-0">{children}</span></label>;
}
function Num({ label, value, min, max, step = 1, onChange, reset }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; reset?: () => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Row label={label} reset={reset}>
      <input type="number" aria-label={label} className={field} min={min} max={max} step={step} value={text !== null && Number(text) === value ? text : String(Math.round(value * 100) / 100)}
        onChange={e => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n); }} onBlur={() => setText(null)} />
    </Row>
  );
}
/** Size in pt as if printed on a 2.5 in card (stored as % of the card width): a number (arrows 0.5, Shift 5), a slider and presets. */
function SizeField({ value, onChange }: { value: number; onChange: (pct: number) => void }) {
  const pt = pctToPt(value);
  const setPt = (n: number) => onChange(ptToPct(Math.min(54, Math.max(3.6, n))));
  return (
    <>
      <Row label="Size (pt)">
        <span className="flex items-center gap-2">
          <input type="number" aria-label="Size (pt)" className={`${field} w-20!`} min={4} max={54} step={0.5} value={pt}
            onKeyDown={ev => { if (ev.shiftKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) { ev.preventDefault(); setPt(pt + (ev.key === 'ArrowUp' ? 5 : -5)); } }}
            onChange={ev => { const n = Number(ev.target.value); if (ev.target.value.trim() !== '' && Number.isFinite(n)) setPt(n); }} />
          <input type="range" aria-label="Size slider" className="range range-xs flex-1" min={4} max={54} step={0.5} value={pt} onChange={ev => setPt(Number(ev.target.value))} />
        </span>
      </Row>
      <div className="flex flex-wrap gap-1 pl-[5.5rem]">
        {SIZE_PRESETS.map(([l, n]) => <button key={l} type="button" aria-pressed={pt === n} title={`${n} pt`} onClick={() => setPt(n)} className={chip(pt === n)}>{l}</button>)}
      </div>
    </>
  );
}
function Check({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return <label className="inline-flex items-center gap-1.5 text-xs text-gray-200"><input type="checkbox" role="switch" checked={on} onChange={e => onChange(e.target.checked)} className="toggle toggle-xs toggle-primary" />{label}</label>;
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


/** One effect: a switch (off keeps the settings, on starts from `make` the first time) and its fields while it is on. */
function EffectSwitch<T extends { on?: false }>({ label, fx, make, onChange, children }: { label: string; fx: T | undefined; make: T; onChange: (v: T | undefined) => void; children: (v: T) => ReactNode }) {
  const on = !!fx && fx.on !== false;
  return (
    <div className="space-y-1.5">
      <span className="flex items-center gap-2">
        <Check label={label} on={on} onChange={v => onChange(v ? (fx ? { ...fx, on: undefined } as T : make) : fx ? { ...fx, on: false } : undefined)} />
        {on && <button type="button" aria-label={`Remove ${label}`} className="text-xs text-gray-400 hover:text-white px-1" onClick={() => onChange(undefined)}>x</button>}
      </span>
      {on && fx && children(fx)}
    </div>
  );
}
/** A shadow as colour, angle (0 = right, 90 = down), distance, blur and opacity; stored as an offset. */
function ShadowFields({ sh, onChange }: { sh: Shadow; onChange: (v: Shadow, key?: string) => void }) {
  const dist = Math.hypot(sh.x, sh.y), angle = dist ? ((Math.atan2(sh.y, sh.x) * 180) / Math.PI + 360) % 360 : 90;
  const polar = (a: number, d: number): Shadow => ({ ...sh, x: Math.round(Math.cos((a * Math.PI) / 180) * d * 100) / 100, y: Math.round(Math.sin((a * Math.PI) / 180) * d * 100) / 100 });
  return (
    <>
      <Colour label="Colour" value={sh.color} onChange={v => onChange({ ...sh, color: v })} />
      <Num label="Angle" value={Math.round(angle)} min={0} max={360} step={15} onChange={v => onChange(polar(v, dist), 'sa')} />
      <Num label="Distance" value={Math.round(dist * 10) / 10} min={0} max={20} step={0.5} onChange={v => onChange(polar(angle, v), 'sd')} />
      <Num label="Blur" value={sh.blur} min={0} max={30} step={1} onChange={v => onChange({ ...sh, blur: v }, 'sb')} />
      <Num label="Opacity (%)" value={Math.round((sh.opacity ?? 1) * 100)} min={0} max={100} step={5} onChange={v => onChange({ ...sh, opacity: v >= 100 ? undefined : v / 100 }, 'so')} />
    </>
  );
}

/** The Style row: apply a built-in or saved preset to the selection, save the current look under a name, delete a saved one. */
function PresetRow({ current, onApply }: { current: () => TextStyle; onApply: (s: TextStyle) => void }) {
  const [saved, setSaved] = useState<TextPreset[]>([]);
  const [pick, setPick] = useState('');
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { listTextPresetsAction().then(setSaved).catch(() => {}); }, []);
  const chosen = [...BUILTIN_TEXT_PRESETS, ...saved].find(p => p.id === pick);
  const run = (f: () => Promise<TextPreset[]>, after?: (l: TextPreset[]) => void) => { setErr(''); f().then(l => { setSaved(l); after?.(l); }).catch(x => setErr(x instanceof Error ? x.message : 'Could not save')); };
  return (
    <div className="space-y-1.5">
      <Row label="Style">
        <span className="flex gap-1 w-full">
          <select aria-label="Style preset" className="select select-sm flex-1 min-w-0" value={pick} onChange={ev => setPick(ev.target.value)}>
            <option value="">Choose...</option>
            <optgroup label="Built in">{BUILTIN_TEXT_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
            {saved.length > 0 && <optgroup label="Saved">{saved.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
          </select>
          <button type="button" className={chip(false)} disabled={!chosen} onClick={() => chosen && onApply(chosen.style)}>Apply</button>
          {chosen && !chosen.id.startsWith('builtin:') && <button type="button" className={chip(false)} onClick={() => run(() => deleteTextPresetAction(chosen.id), () => setPick(''))}>Delete</button>}
        </span>
      </Row>
      {naming ? (
        <form className="flex gap-1" onSubmit={ev => { ev.preventDefault(); run(() => saveTextPresetAction(name, current()), l => { setNaming(false); setName(''); setPick(l.find(p => p.name.toLowerCase() === name.trim().toLowerCase())?.id ?? ''); }); }}>
          <input aria-label="Preset name" className={field} maxLength={40} placeholder="Preset name" value={name} onChange={ev => setName(ev.target.value)} autoFocus />
          <button type="submit" className={chip(true)} disabled={!name.trim()}>Save</button>
          <button type="button" className={chip(false)} onClick={() => { setNaming(false); setErr(''); }}>Cancel</button>
        </form>
      ) : <button type="button" className={chip(false)} onClick={() => setNaming(true)}>Save as preset...</button>}
      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  );
}

/** The properties of the selection: the element's placement, type, content and effects, or the background when nothing (or the background) is selected. */
export function Properties({ style, selection, boxes, cardW, onChange, onPreview }: {
  style: CardBackStyle;
  selection: Set<string>;
  boxes: Record<string, Box & { fontPx: number }>;
  cardW: number;
  onChange: (next: CardBackStyle, key?: string) => void;
  /** Shows a style on the canvas without changing the design (the font picker's hover); null restores. */
  onPreview?: (next: CardBackStyle | null) => void;
}) {
  const ids = style.elements.filter(e => selection.has(e.id)).map(e => e.id);
  if (selection.has('bg') || ids.length === 0) return <BackgroundPanel style={style} onChange={onChange} />;
  const els = style.elements.filter(e => ids.includes(e.id));
  const e = els[0];
  const many = els.length > 1;
  const set = (patch: Partial<BackEl>, key?: string) => onChange(patchElements(style, ids, patch), key ? `${ids.join()}:${key}` : undefined);
  const fx = (patch: Partial<Effects>, key?: string) => set({ fx: { ...e.fx, ...patch } }, key);
  const text = e.kind !== 'qr' && e.kind !== 'logo';
  const fd = BACK_FONTS.find(f => f.id === e.font) ?? BACK_FONTS[0];
  const kase = caseOf(e) ?? 'none';
  const trk = e.tracking ?? Math.round(e.letterSpacing * 100);
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
            {text && <Row label="Height">
              <span className="flex items-center gap-2">
                <Check label="Fixed" on={e.h !== undefined} onChange={v => set({ h: v ? Math.round((boxes[e.id]?.h ?? 10) * 2) / 2 : undefined })} />
                {e.h !== undefined && <input type="number" aria-label="Height (%)" className={`${field} w-20!`} min={2} max={100} step={0.5} value={Math.round(e.h * 100) / 100} onChange={ev => { const n = Number(ev.target.value); if (ev.target.value.trim() !== '' && Number.isFinite(n)) set({ h: n }, 'h'); }} />}
              </span>
            </Row>}
            <Num label="Rotate" value={e.rotate} min={-45} max={45} step={1} onChange={v => set({ rotate: v }, 'rot')} />
          </>
        ) : <p className="text-xs text-gray-500">In the stack the element sits in the classic centred column, in list order. Its face stays the classic one until you pick a font. Place it freely to move it, rotate it and set the rest of its type.</p>}
        <Check label="Locked (the canvas can't drag it)" on={e.locked} onChange={v => set({ locked: v })} />
      </Group>

      {text && (
        <Group title="Text">
          <Row label="Font">
            <FontPicker
              fonts={BACK_FONTS}
              categories={FONT_CATEGORIES}
              value={e.font}
              sample={e.kind === 'text' ? e.text : ''}
              onChange={id => set({ font: id })}
              onNeedFont={id => { void loadBackFont(id, 400); }}
              onPreview={id => onPreview?.(id ? patchElements(style, ids, { font: id }) : null)}
            />
          </Row>
          {free ? (
            <>
              <SizeField value={e.size} onChange={v => set({ size: v }, 'size')} />
              <Row label="Auto-fit">
                <span className="flex gap-1">
                  {([[undefined, 'Off'], ['shrink', 'Shrink to fit the box'], ['width', 'Fit width']] as const).map(([m, l]) => (
                    <button key={l} type="button" aria-pressed={e.fit === m} onClick={() => set(m ? { fit: m, minSize: e.minSize ?? DEFAULT_MIN_SIZE } : { fit: undefined, minSize: undefined })} className={chip(e.fit === m)}>{l}</button>
                  ))}
                </span>
              </Row>
              {e.fit && <Num label="Min size (pt)" value={pctToPt(e.minSize ?? DEFAULT_MIN_SIZE)} min={1.8} max={54} step={0.5} onChange={v => set({ minSize: ptToPct(v) }, 'min')} />}
              <details open className="space-y-1.5">
                <summary className="text-xs font-bold text-gray-300 cursor-pointer select-none">Character</summary>
                <div className="space-y-1.5 mt-1.5">
                  <PresetRow current={() => styleOf(e as unknown as Record<string, unknown>)} onApply={st => set(presetPatch(st))} />
                  <Row label="Weight" reset={e.weight !== 400 ? () => set({ weight: 400 }) : undefined}><select aria-label="Weight" className="select select-sm w-full" value={nearestWeight(fd, e.weight)} onChange={ev => set({ weight: Number(ev.target.value) })}>{fd.weights.map(w => <option key={w} value={w}>{WEIGHT_NAMES[w]} ({w})</option>)}</select></Row>
                  <div className="flex flex-wrap gap-3">
                    <Check label={fd.italicFile ? 'Italic' : 'Slanted'} on={e.italic} onChange={v => set({ italic: v })} />
                    <Check label="Underline" on={e.underline} onChange={v => set({ underline: v })} />
                    <Check label="Strikethrough" on={!!e.strike} onChange={v => set({ strike: v || undefined })} />
                    <Check label="Overline" on={!!e.overline} onChange={v => set({ overline: v || undefined })} />
                  </div>
                  <Row label="Case" reset={kase !== 'none' ? () => set({ textCase: undefined, uppercase: false }) : undefined}>
                    <select aria-label="Case" className="select select-sm w-full" value={kase} onChange={ev => set({ textCase: ev.target.value === 'none' ? undefined : (ev.target.value as TextCase), uppercase: false })}>
                      {([['none', 'As typed'], ['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Title Case'], ['smallcaps', 'Small caps']] as const).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </Row>
                  <Num label="Tracking" value={trk} min={-100} max={800} step={10} reset={trk !== 0 ? () => set({ tracking: undefined, letterSpacing: 0 }) : undefined} onChange={v => set({ tracking: v, letterSpacing: 0 }, 'ls')} />
                  <Num label="Word spacing" value={e.wordSpacing ?? 0} min={-100} max={800} step={10} reset={e.wordSpacing ? () => set({ wordSpacing: undefined }) : undefined} onChange={v => set({ wordSpacing: v || undefined }, 'ws')} />
                  <Check label="Auto line height" on={!!e.autoLeading} onChange={v => set({ autoLeading: v || undefined })} />
                  {!e.autoLeading && <Num label="Line height" value={e.lineHeight} min={0.8} max={2.5} step={0.05} reset={e.lineHeight !== 1.25 ? () => set({ lineHeight: 1.25 }) : undefined} onChange={v => set({ lineHeight: v }, 'lh')} />}
                  <Num label="Baseline (%)" value={e.baseline ?? 0} min={-100} max={100} step={5} reset={e.baseline ? () => set({ baseline: undefined }) : undefined} onChange={v => set({ baseline: v || undefined }, 'bl')} />
                  <Row label="Script" reset={e.script ? () => set({ script: undefined }) : undefined}>
                    <span className="flex gap-1">{([[undefined, 'Normal'], ['sup', 'Superscript'], ['sub', 'Subscript']] as const).map(([v, l]) => <button key={l} type="button" aria-pressed={e.script === v} onClick={() => set({ script: v })} className={chip(e.script === v)}>{l}</button>)}</span>
                  </Row>
                  <Check label="Kerning" on={e.kerning !== false} onChange={v => set({ kerning: v ? undefined : false })} />
                  <p className="text-[11px] text-gray-500">Baseline and script move the whole box: use them on one-line tokens.</p>
                </div>
              </details>
              <Row label="Align"><span className="flex gap-1">{(['left', 'center', 'right', 'justify'] as const).map(a => <button key={a} type="button" aria-pressed={e.align === a} onClick={() => set({ align: a })} className={chip(e.align === a)}>{a}</button>)}</span></Row>
              <Num label="Indent (em)" value={e.indent ?? 0} min={0} max={5} step={0.25} onChange={v => set({ indent: v || undefined }, 'ind')} />
              <Num label="Paragraph gap" value={e.paraGap ?? 0} min={0} max={3} step={0.1} onChange={v => set({ paraGap: v || undefined }, 'pg')} />
              <Row label="Box">
                <span className="flex flex-wrap items-center gap-2">
                  <Check label="Wrap" on={e.wrap !== false} onChange={v => set({ wrap: v ? undefined : false })} />
                  {e.h !== undefined && (['top', 'middle', 'bottom'] as const).map(a => <button key={a} type="button" aria-pressed={(e.valign ?? 'top') === a} onClick={() => set({ valign: a === 'top' ? undefined : a })} className={chip((e.valign ?? 'top') === a)}>{a}</button>)}
                </span>
              </Row>
              <Num label="Max lines (0 = any)" value={e.maxLines ?? 0} min={0} max={20} step={1} onChange={v => set({ maxLines: v >= 1 ? Math.round(v) : undefined }, 'ml')} />
              <Num label="Padding (%)" value={e.pad ?? 0} min={0} max={15} step={0.5} onChange={v => set({ pad: v || undefined }, 'pad')} />
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
              <textarea aria-label="Text" className="textarea w-full mt-1" rows={3} maxLength={MAX_TEXT} value={e.text} onChange={ev => set({ text: ev.target.value }, 'text')} />
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
        {text && <EffectSwitch label="Stroke" fx={e.fx.stroke} make={{ color: '#000000', width: 2, pos: 'outside' }} onChange={v => fx({ stroke: v })}>
          {st => <>
            <Colour label="Colour" value={st.color} onChange={v => fx({ stroke: { ...st, color: v } })} />
            <Num label="Width" value={st.width} min={0} max={10} step={0.5} onChange={v => fx({ stroke: { ...st, width: v } }, 'ow')} />
            <Row label="Position"><span className="flex gap-1">{(['outside', 'center'] as const).map(m => <button key={m} type="button" aria-pressed={st.pos === m} onClick={() => fx({ stroke: { ...st, pos: m } })} className={chip(st.pos === m)}>{m === 'outside' ? 'Outside' : 'Centre'}</button>)}</span></Row>
          </>}
        </EffectSwitch>}
        <EffectSwitch label="Outer glow" fx={e.fx.glow} make={{ color: '#fbbf24', blur: 10, strength: 1 }} onChange={v => fx({ glow: v })}>
          {g => <>
            <Colour label="Colour" value={g.color} onChange={v => fx({ glow: { ...g, color: v } })} />
            <Num label="Blur" value={g.blur} min={0} max={40} step={1} onChange={v => fx({ glow: { ...g, blur: v } }, 'gb')} />
            <Num label="Strength" value={g.strength} min={0} max={3} step={1} onChange={v => fx({ glow: { ...g, strength: v } }, 'gs')} />
          </>}
        </EffectSwitch>
        {[0, 1].map(i => {
          const list = e.fx.shadows ?? [];
          if (i > list.length) return null;
          const setAt = (v: Shadow | undefined, key?: string) => { const next = list.slice(); if (v) next[i] = v; else next.splice(i, 1); fx({ shadows: next.length ? next : undefined }, key); };
          return <EffectSwitch key={i} label={i ? 'Drop shadow 2' : 'Drop shadow'} fx={list[i]} make={{ color: '#000000', x: 0, y: 2, blur: 4 }} onChange={v => setAt(v)}>{sh => <ShadowFields sh={sh} onChange={(v, k) => setAt(v, k)} />}</EffectSwitch>;
        })}
        {text && <EffectSwitch label="Inner shadow" fx={e.fx.inner} make={{ color: '#000000', x: 0, y: 2, blur: 3, opacity: 0.6 }} onChange={v => fx({ inner: v })}>{sh => <ShadowFields sh={sh} onChange={(v, k) => fx({ inner: v }, k)} />}</EffectSwitch>}
        {text && <EffectSwitch label="Bevel / emboss" fx={e.fx.bevel} make={{ style: 'pressed', depth: 1 }} onChange={v => fx({ bevel: v })}>
          {b => <>
            <Row label="Style"><span className="flex gap-1">{(['pressed', 'raised'] as const).map(m => <button key={m} type="button" aria-pressed={b.style === m} onClick={() => fx({ bevel: { ...b, style: m } })} className={chip(b.style === m)}>{m === 'pressed' ? 'Pressed' : 'Raised'}</button>)}</span></Row>
            <Num label="Depth" value={b.depth} min={0.5} max={3} step={0.5} onChange={v => fx({ bevel: { ...b, depth: v } }, 'bd')} />
          </>}
        </EffectSwitch>}
        {text && free && <EffectSwitch label="Background plate" fx={e.fx.plate} make={{ color: '#14121f', pad: 2, radius: 2 }} onChange={v => fx({ plate: v })}>
          {pl => <>
            <Colour label="Colour" value={pl.color} onChange={v => fx({ plate: { ...pl, color: v } })} />
            <Num label="Padding" value={pl.pad} min={0} max={20} step={0.5} onChange={v => fx({ plate: { ...pl, pad: v } }, 'pp')} />
            <Num label="Corner radius" value={pl.radius} min={0} max={50} step={0.5} onChange={v => fx({ plate: { ...pl, radius: v } }, 'pr')} />
            <Check label="Outline" on={!!pl.outline} onChange={v => fx({ plate: { ...pl, outline: v ? { color: '#ffffff', width: 1 } : undefined } })} />
            {pl.outline && <><Colour label="Outline colour" value={pl.outline.color} onChange={v => fx({ plate: { ...pl, outline: { ...pl.outline!, color: v } } })} /><Num label="Outline width" value={pl.outline.width} min={0} max={10} step={0.5} onChange={v => fx({ plate: { ...pl, outline: { ...pl.outline!, width: v } } }, 'pw')} /></>}
          </>}
        </EffectSwitch>}
        {text && <div className="space-y-1.5"><Check label="Gradient text" on={!!e.fx.gradientText} onChange={v => fx({ gradientText: v ? { from: '#fde68a', to: '#f59e0b', angle: 180 } : undefined })} />
          {e.fx.gradientText && (() => {
            const g = e.fx.gradientText!;
            const stops = g.stops ?? [{ color: g.from, at: 0 }, { color: g.to, at: 100 }];
            const setStops = (next: { color: string; at: number }[], key?: string) => fx({ gradientText: { ...g, stops: next } }, key);
            return (
              <>
                {stops.map((st, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <div className="flex-1 min-w-0"><Colour label={`Stop ${i + 1}`} value={st.color} onChange={v => setStops(stops.map((x, k) => (k === i ? { ...x, color: v } : x)))} /></div>
                    <input type="number" aria-label={`Stop ${i + 1} position (%)`} className={`${field} w-16!`} min={0} max={100} step={5} value={st.at} onChange={ev => { const n = Number(ev.target.value); if (ev.target.value.trim() !== '' && Number.isFinite(n)) setStops(stops.map((x, k) => (k === i ? { ...x, at: n } : x)), `gs${i}`); }} />
                    {stops.length > 2 && <button type="button" aria-label={`Remove stop ${i + 1}`} className="text-xs text-gray-400 hover:text-white px-1" onClick={() => setStops(stops.filter((_, k) => k !== i))}>x</button>}
                  </div>
                ))}
                {stops.length < 4 && <button type="button" className={chip(false)} onClick={() => setStops([...stops, { color: '#ffffff', at: 50 }])}>Add stop</button>}
                <Num label="Angle" value={g.angle} min={0} max={360} step={5} onChange={v => fx({ gradientText: { ...g, angle: v } }, 'ga')} />
              </>
            );
          })()}</div>}
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
