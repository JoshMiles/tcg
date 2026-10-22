'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { BACK_FONTS, WEIGHT_NAMES, nearestWeight } from '@/lib/card-back';
import { WEIGHTS, caseOf, type Shadow, type TextCase, type TextStyle } from '@/lib/text-style';
import { BUILTIN_TEXT_PRESETS, presetPatch, styleOf, type TextPreset } from '@/lib/text-presets';
import { deleteTextPresetAction, listTextPresetsAction, saveTextPresetAction } from '@/app/admin/text-preset-actions';
import type { TextAccent } from '@/lib/overlay-text-style';

// The Character and Effects controls, shared by the card back editor (a whole TextStyle on a BackEl) and the Overlay Editor (a partial patch per
// text layer, ROADMAP 38.8 c). Lifted from the card back Properties panel. `patch` switches to the overlay's mode: the value shown is what the layer
// ends up with (inherited plus its own), `patch.own` is only what this layer sets, a reset dot appears on those fields and calls `patch.clear(path)`
// (path like `weight` or `fx.stroke.color`), and the controls that need a box (arc, wrap, plate, inner shadow...) are not offered.

export interface PatchMode { own: Record<string, unknown>; clear: (path: string) => void }
type Change = (patch: Partial<TextStyle>, key?: string) => void;
type FontShape = { weights: readonly number[]; italicFile?: string };

export const field = 'input input-sm w-full';
export const chip = (on: boolean) => `px-2 py-1 text-xs font-bold rounded-lg border ${on ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300' : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'}`;

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-2 border-b border-gray-800 pb-3 mb-3 last:border-0"><h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">{title}</h4>{children}</section>;
}
const Dot = ({ label, reset }: { label: string; reset: () => void }) => <button type="button" aria-label={`Reset ${label}`} title="Reset to the default" onClick={reset} className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />;
export function Row({ label, children, reset }: { label: string; children: ReactNode; reset?: () => void }) {
  return <label className="flex items-center gap-2 text-xs text-gray-400"><span className="w-20 shrink-0 flex items-center gap-1">{label}{reset && <Dot label={label} reset={reset} />}</span><span className="flex-1 min-w-0">{children}</span></label>;
}
export function Num({ label, value, min, max, step = 1, onChange, reset }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; reset?: () => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Row label={label} reset={reset}>
      <input type="number" aria-label={label} className={field} min={min} max={max} step={step} value={text !== null && Number(text) === value ? text : String(Math.round(value * 100) / 100)}
        onChange={e => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n); }} onBlur={() => setText(null)} />
    </Row>
  );
}
export function Check({ label, on, onChange, reset }: { label: string; on: boolean; onChange: (v: boolean) => void; reset?: () => void }) {
  return <label className="inline-flex items-center gap-1.5 text-xs text-gray-200"><input type="checkbox" role="switch" checked={on} onChange={e => onChange(e.target.checked)} className="toggle toggle-xs toggle-primary" />{label}{reset && <Dot label={label} reset={reset} />}</label>;
}
/** A colour: the picker and a hex box, plus optional named values (`auto`, `rarity`). */
export function Colour({ label, value, onChange, named = [], reset }: { label: string; value: string; onChange: (v: string) => void; named?: string[]; reset?: () => void }) {
  const isHex = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <Row label={label} reset={reset}>
      <span className="flex flex-wrap items-center gap-1.5">
        <input type="color" aria-label={`${label} colour`} value={isHex ? value : '#808080'} onChange={e => onChange(e.target.value)} className="w-8 h-7 rounded-sm bg-transparent border border-gray-700 p-0.5" />
        <input aria-label={`${label} hex`} className={`${field} w-24!`} value={isHex ? value : ''} placeholder={value} onChange={e => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value.toLowerCase()); }} />
        {named.map(n => <button key={n} type="button" onClick={() => onChange(n)} aria-pressed={value === n} className={chip(value === n)}>{n}</button>)}
      </span>
    </Row>
  );
}

/** One effect: a switch (off keeps the settings, on starts from `make` the first time) and its fields while it is on. */
export function EffectSwitch<T extends { on?: false }>({ label, fx, make, onChange, children }: { label: string; fx: T | undefined; make: T; onChange: (v: T | undefined) => void; children: (v: T) => ReactNode }) {
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
export function ShadowFields({ sh, onChange }: { sh: Shadow; onChange: (v: Shadow, key?: string) => void }) {
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
export function PresetRow({ current, onApply }: { current: () => TextStyle; onApply: (s: TextStyle) => void }) {
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

const hasPath = (o: Record<string, unknown>, path: string) => {
  let v: unknown = o;
  for (const k of path.split('.')) { if (!v || typeof v !== 'object' || (v as Record<string, unknown>)[k] === undefined) return false; v = (v as Record<string, unknown>)[k]; }
  return true;
};
/** The reset dot of one field: in the overlay it clears this layer's own value, on the card back it is the caller's own reset (only set when the value differs). */
const resetOf = (patch: PatchMode | undefined, path: string, card?: () => void) => (patch ? (hasPath(patch.own, path) ? () => patch.clear(path) : undefined) : card);

/** The Character details: weight, italic and lines, case, spacing, line height, kerning (plus baseline, script and auto leading on the card back). */
export function CharacterFields({ value: e, onChange: set, patch, onPreset, fontId }: { value: TextStyle; onChange: Change; patch?: PatchMode; onPreset?: (s: TextStyle) => void; fontId?: string }) {
  const known = BACK_FONTS.find(f => f.id === (fontId ?? e.font));
  const fd: FontShape = known ?? (patch ? { weights: WEIGHTS } : BACK_FONTS[0]);
  const kase = caseOf(e) ?? 'none';
  const trk = e.tracking ?? Math.round(e.letterSpacing * 100);
  const r = (path: string, card?: () => void) => resetOf(patch, path, card);
  const wsel = known ? nearestWeight(known, e.weight) : e.weight;
  // Overlay: a false is a real value (it overrides an inherited true); card back: false is "unset".
  const flag = (k: 'underline' | 'strike' | 'overline' | 'italic', v: boolean) => set((patch || k === 'italic' || k === 'underline' ? { [k]: v } : { [k]: v || undefined }) as Partial<TextStyle>);
  return (
    <details open className="space-y-1.5">
      <summary className="text-xs font-bold text-gray-300 cursor-pointer select-none">Character</summary>
      <div className="space-y-1.5 mt-1.5">
        <PresetRow current={() => styleOf(e as unknown as Record<string, unknown>)} onApply={st => (onPreset ? onPreset(st) : set(presetPatch(st)))} />
        <Row label="Weight" reset={r('weight', e.weight !== 400 ? () => set({ weight: 400 }) : undefined)}><select aria-label="Weight" className="select select-sm w-full" value={wsel} onChange={ev => set({ weight: Number(ev.target.value) })}>{fd.weights.map(w => <option key={w} value={w}>{WEIGHT_NAMES[w]} ({w})</option>)}</select></Row>
        <div className="flex flex-wrap gap-3">
          <Check label={fd.italicFile ? 'Italic' : 'Slanted'} on={e.italic} onChange={v => flag('italic', v)} reset={r('italic')} />
          <Check label="Underline" on={e.underline} onChange={v => flag('underline', v)} reset={r('underline')} />
          <Check label="Strikethrough" on={!!e.strike} onChange={v => flag('strike', v)} reset={r('strike')} />
          <Check label="Overline" on={!!e.overline} onChange={v => flag('overline', v)} reset={r('overline')} />
        </div>
        <Row label="Case" reset={r('textCase', kase !== 'none' ? () => set({ textCase: undefined, uppercase: false }) : undefined)}>
          <select aria-label="Case" className="select select-sm w-full" value={kase} onChange={ev => set(patch ? { textCase: ev.target.value as TextCase } : { textCase: ev.target.value === 'none' ? undefined : (ev.target.value as TextCase), uppercase: false })}>
            {([['none', 'As typed'], ['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Title Case'], ['smallcaps', 'Small caps']] as const).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Row>
        <Num label="Tracking" value={trk} min={-100} max={800} step={10} reset={r('tracking', trk !== 0 ? () => set({ tracking: undefined, letterSpacing: 0 }) : undefined)} onChange={v => set({ tracking: v, letterSpacing: 0 }, 'ls')} />
        <Num label="Word spacing" value={e.wordSpacing ?? 0} min={-100} max={800} step={10} reset={r('wordSpacing', e.wordSpacing ? () => set({ wordSpacing: undefined }) : undefined)} onChange={v => set({ wordSpacing: patch ? v : v || undefined }, 'ws')} />
        {!patch && <Check label="Auto line height" on={!!e.autoLeading} onChange={v => set({ autoLeading: v || undefined })} />}
        {(patch || !e.autoLeading) && <Num label="Line height" value={e.lineHeight} min={0.8} max={2.5} step={0.05} reset={r('lineHeight', e.lineHeight !== 1.25 ? () => set({ lineHeight: 1.25 }) : undefined)} onChange={v => set({ lineHeight: v }, 'lh')} />}
        {!patch && <>
          <Num label="Baseline (%)" value={e.baseline ?? 0} min={-100} max={100} step={5} reset={e.baseline ? () => set({ baseline: undefined }) : undefined} onChange={v => set({ baseline: v || undefined }, 'bl')} />
          <Row label="Script" reset={e.script ? () => set({ script: undefined }) : undefined}>
            <span className="flex gap-1">{([[undefined, 'Normal'], ['sup', 'Superscript'], ['sub', 'Subscript']] as const).map(([v, l]) => <button key={l} type="button" aria-pressed={e.script === v} onClick={() => set({ script: v })} className={chip(e.script === v)}>{l}</button>)}</span>
          </Row>
        </>}
        <Check label="Kerning" on={e.kerning !== false} onChange={v => set({ kerning: (patch ? v : v ? undefined : false) as false | undefined })} reset={r('kerning')} />
        {!patch && <p className="text-[11px] text-gray-500">Baseline and script move the whole box: use them on one-line tokens.</p>}
      </div>
    </details>
  );
}

/** Alignment (the overlay has no justify: it has no box to justify in). */
export function AlignRow({ value: e, onChange: set, patch }: { value: TextStyle; onChange: Change; patch?: PatchMode }) {
  return <Row label="Align" reset={resetOf(patch, 'align')}><span className="flex gap-1">{(patch ? ['left', 'center', 'right'] as const : ['left', 'center', 'right', 'justify'] as const).map(a => <button key={a} type="button" aria-pressed={e.align === a} onClick={() => set({ align: a })} className={chip(e.align === a)}>{a}</button>)}</span></Row>;
}
export function OpacityRow({ value: e, onChange: set, patch }: { value: TextStyle; onChange: Change; patch?: PatchMode }) {
  return <Num label="Opacity" value={e.opacity} min={0} max={1} step={0.05} reset={resetOf(patch, 'opacity')} onChange={v => set({ opacity: v }, 'op')} />;
}

/** The effects: stroke, glow, two drop shadows, gradient text, and (not in the overlay) inner shadow, bevel's box siblings and the background plate. */
export function EffectFields({ value: e, onChange: set, patch, text = true, free = true }: { value: TextStyle; onChange: Change; patch?: PatchMode; text?: boolean; free?: boolean }) {
  const fx = (p: Partial<TextStyle['fx']>, key?: string) => set({ fx: { ...e.fx, ...p } }, key);
  const r = (path: string) => resetOf(patch, path);
  return (
    <>
      {text && <EffectSwitch label="Stroke" fx={e.fx.stroke} make={{ color: '#000000', width: 2, pos: 'outside' }} onChange={v => fx({ stroke: v })}>
        {st => <>
          <Colour label="Colour" value={st.color} reset={r('fx.stroke.color')} onChange={v => fx({ stroke: { ...st, color: v } })} />
          <Num label="Width" value={st.width} min={0} max={10} step={0.5} reset={r('fx.stroke.width')} onChange={v => fx({ stroke: { ...st, width: v } }, 'ow')} />
          <Row label="Position" reset={r('fx.stroke.pos')}><span className="flex gap-1">{(['outside', 'center'] as const).map(m => <button key={m} type="button" aria-pressed={st.pos === m} onClick={() => fx({ stroke: { ...st, pos: m } })} className={chip(st.pos === m)}>{m === 'outside' ? 'Outside' : 'Centre'}</button>)}</span></Row>
        </>}
      </EffectSwitch>}
      <EffectSwitch label="Outer glow" fx={e.fx.glow} make={{ color: '#fbbf24', blur: 10, strength: 1 }} onChange={v => fx({ glow: v })}>
        {g => <>
          <Colour label="Colour" value={g.color} reset={r('fx.glow.color')} onChange={v => fx({ glow: { ...g, color: v } })} />
          <Num label="Blur" value={g.blur} min={0} max={40} step={1} reset={r('fx.glow.blur')} onChange={v => fx({ glow: { ...g, blur: v } }, 'gb')} />
          <Num label="Strength" value={g.strength} min={0} max={3} step={1} reset={r('fx.glow.strength')} onChange={v => fx({ glow: { ...g, strength: v } }, 'gs')} />
        </>}
      </EffectSwitch>
      {[0, 1].map(i => {
        const list = e.fx.shadows ?? [];
        if (i > list.length) return null;
        const setAt = (v: Shadow | undefined, key?: string) => { const next = list.slice(); if (v) next[i] = v; else next.splice(i, 1); fx({ shadows: next.length ? next : undefined }, key); };
        return <EffectSwitch key={i} label={i ? 'Drop shadow 2' : 'Drop shadow'} fx={list[i]} make={{ color: '#000000', x: 0, y: 2, blur: 4 }} onChange={v => setAt(v)}>{sh => <ShadowFields sh={sh} onChange={(v, k) => setAt(v, k)} />}</EffectSwitch>;
      })}
      {text && !patch && <EffectSwitch label="Inner shadow" fx={e.fx.inner} make={{ color: '#000000', x: 0, y: 2, blur: 3, opacity: 0.6 }} onChange={v => fx({ inner: v })}>{sh => <ShadowFields sh={sh} onChange={(v, k) => fx({ inner: v }, k)} />}</EffectSwitch>}
      {text && <EffectSwitch label="Bevel / emboss" fx={e.fx.bevel} make={{ style: 'pressed', depth: 1 }} onChange={v => fx({ bevel: v })}>
        {b => <>
          <Row label="Style" reset={r('fx.bevel.style')}><span className="flex gap-1">{(['pressed', 'raised'] as const).map(m => <button key={m} type="button" aria-pressed={b.style === m} onClick={() => fx({ bevel: { ...b, style: m } })} className={chip(b.style === m)}>{m === 'pressed' ? 'Pressed' : 'Raised'}</button>)}</span></Row>
          <Num label="Depth" value={b.depth} min={0.5} max={3} step={0.5} reset={r('fx.bevel.depth')} onChange={v => fx({ bevel: { ...b, depth: v } }, 'bd')} />
        </>}
      </EffectSwitch>}
      {text && free && !patch && <EffectSwitch label="Background plate" fx={e.fx.plate} make={{ color: '#14121f', pad: 2, radius: 2 }} onChange={v => fx({ plate: v })}>
        {pl => <>
          <Colour label="Colour" value={pl.color} onChange={v => fx({ plate: { ...pl, color: v } })} />
          <Num label="Padding" value={pl.pad} min={0} max={20} step={0.5} onChange={v => fx({ plate: { ...pl, pad: v } }, 'pp')} />
          <Num label="Corner radius" value={pl.radius} min={0} max={50} step={0.5} onChange={v => fx({ plate: { ...pl, radius: v } }, 'pr')} />
          <Check label="Outline" on={!!pl.outline} onChange={v => fx({ plate: { ...pl, outline: v ? { color: '#ffffff', width: 1 } : undefined } })} />
          {pl.outline && <><Colour label="Outline colour" value={pl.outline.color} onChange={v => fx({ plate: { ...pl, outline: { ...pl.outline!, color: v } } })} /><Num label="Outline width" value={pl.outline.width} min={0} max={10} step={0.5} onChange={v => fx({ plate: { ...pl, outline: { ...pl.outline!, width: v } } }, 'pw')} /></>}
        </>}
      </EffectSwitch>}
      {text && <div className="space-y-1.5"><Check label="Gradient text" on={patch ? !!e.fx.gradientText && e.fx.gradientText.on !== false : !!e.fx.gradientText} reset={r('fx.gradientText')}
        onChange={v => {
          const g0 = e.fx.gradientText;
          // Overlay: switching off keeps the settings with on:false (so it also turns off an inherited gradient).
          if (patch && g0) fx({ gradientText: { ...g0, on: v ? undefined : false } });
          else fx({ gradientText: v ? { from: '#fde68a', to: '#f59e0b', angle: 180 } : undefined });
        }} />
        {e.fx.gradientText && (!patch || e.fx.gradientText.on !== false) && (() => {
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
    </>
  );
}

/** What the overlay editor shows for one text layer: presets, the Character details, align, opacity and the effects. */
/** "Highlight tokens" for a wording layer: the filled tokens (the viewer's name...) get their own colour and optionally bold. */
export function AccentFields({ value: a, onChange }: { value: TextAccent | undefined; onChange: (a: TextAccent | undefined) => void }) {
  const on = !!a && a.on !== false;
  return (
    <Group title="Highlight tokens">
      <Check label="Highlight the filled tokens" on={on} onChange={v => onChange(v ? { ...a, on: undefined } : a ? { ...a, on: false } : undefined)} reset={a ? () => onChange(undefined) : undefined} />
      {on && (
        <>
          <Colour label="Colour" value={a?.color ?? 'accent'} named={['accent']} onChange={v => onChange({ ...a, color: v })} />
          <p className="text-xs text-gray-500">accent is the pack's accent colour.</p>
          <Check label="Bold" on={!!a?.bold} onChange={v => onChange({ ...a, bold: v })} />
        </>
      )}
    </Group>
  );
}

export function CharacterPanel({ value, onChange, patch, onPreset, fontId, accent }: { value: TextStyle; onChange: Change; patch: PatchMode; onPreset: (s: TextStyle) => void; fontId?: string; accent?: { value: TextAccent | undefined; onChange: (a: TextAccent | undefined) => void } }) {
  return (
    <div className="space-y-1.5">
      <CharacterFields value={value} onChange={onChange} patch={patch} onPreset={onPreset} fontId={fontId} />
      <AlignRow value={value} onChange={onChange} patch={patch} />
      <OpacityRow value={value} onChange={onChange} patch={patch} />
      <p className="text-xs font-bold text-gray-300 pt-1">Effects</p>
      <EffectFields value={value} onChange={onChange} patch={patch} />
      {accent && <AccentFields value={accent.value} onChange={accent.onChange} />}
    </div>
  );
}
