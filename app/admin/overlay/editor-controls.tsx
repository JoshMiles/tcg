'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/app/components/Icon';
import { FontPicker } from '@/app/admin/components/workspace/FontPicker';
import { BACK_FONTS, FONT_CATEGORIES } from '@/lib/card-back';
import { loadBackFont } from '@/lib/card-back-fonts';
import { REVEAL_STYLES, type PropDef, type PropValue } from '@/lib/overlay-props';
import { useOverlayEditor } from './OverlayEditorContext';

// Small building blocks of the Overlay Editor: the popover, the segmented control, one property row and the value controls.

export const btn = 'px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors';
export const ghost = `${btn} border border-gray-700 text-gray-200 hover:border-gray-500`;
export const inputCls = 'input input-sm';

/** A button that opens a floating panel; closes on an outside click or Escape. */
export function Popover({ label, badge, children, align = 'left', up = false, icon, disabled = false, openSignal = 0 }: { label: string; badge?: number; children: React.ReactNode; align?: 'left' | 'right'; up?: boolean; icon?: IconName; disabled?: boolean; openSignal?: number }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-40 ${open ? 'border-yellow-500 text-yellow-300' : 'border-gray-700 text-gray-200 hover:border-gray-500'}`}
      >
        {icon && <Icon name={icon} className="mr-1.5" />}{label}{badge ? <span className="ml-1.5 text-xs text-gray-500">{badge}</span> : null} <span aria-hidden className="text-[10px] text-gray-500">▾</span>
      </button>
      {open && (
        <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} ${up ? 'bottom-full mb-2' : 'top-full mt-2'} z-40 rounded-xl border border-gray-700 bg-gray-900 shadow-2xl p-3`}>
          {children}
        </div>
      )}
    </div>
  );
}

/** A row of mutually exclusive choices. */
export function Segmented({
  label, value, onChange, options, disabled = [], wrap = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string; dot?: boolean }[];
  disabled?: string[];
  wrap?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className={`flex items-center gap-1 ${wrap ? 'flex-wrap' : ''}`}>
      <span className="text-xs text-gray-500 mr-1">{label}</span>
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          disabled={disabled.includes(o.id)}
          onClick={() => onChange(o.id)}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold border disabled:opacity-35 ${value === o.id ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:border-gray-500'}`}
        >
          {o.label}{o.dot && <span className="ml-1 text-yellow-400">●</span>}
        </button>
      ))}
    </div>
  );
}

// ── One property row ──────────────────────────────────────

export function PropRow({
  def, value, modified, inherited, isPack, off, onChange, onReset,
}: {
  def: PropDef;
  value: PropValue;
  modified: boolean;
  inherited: boolean;
  isPack: boolean;
  off: boolean;
  onChange: (v: unknown) => void;
  onReset: () => void;
}) {
  const id = `prop-${def.key}`;
  const styleHelp = def.key === 'reveal.style' || /^variant.[a-z]+.style$/.test(def.key) ? REVEAL_STYLES.find(s => s.value === value)?.description : undefined;
  const inline = def.type === 'boolean';
  const label = (
    <label htmlFor={id} className="text-sm text-gray-200 font-medium">
      {def.label}
      {modified && <span className="ml-1.5 text-yellow-400" title={isPack ? 'Overridden for this pack' : 'Changed from the default'}>●</span>}
      {inherited && <span className="ml-1.5 text-xs text-gray-600 font-normal">(from global)</span>}
      {def.experimental && <span className="ml-1.5 text-[10px] uppercase tracking-wide rounded-sm bg-purple-500/20 text-purple-300 px-1.5 py-0.5 font-semibold">experimental</span>}
    </label>
  );
  const reset = (
    <button
      type="button"
      onClick={onReset}
      disabled={!modified}
      className="text-xs text-gray-500 hover:text-white disabled:opacity-0 shrink-0"
      title={isPack ? 'Stop overriding (use the global value)' : `Reset to ${formatValue(def, def.default)}`}
    >
      {isPack ? 'inherit' : 'reset'}
    </button>
  );
  return (
    <div className={`space-y-1 ${off ? 'opacity-45' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        {label}
        <span className="flex items-center gap-2">
          {reset}
          {inline && <Control def={def} id={id} value={value} onChange={onChange} />}
        </span>
      </div>
      {!inline && <Control def={def} id={id} value={value} onChange={onChange} />}
      {(styleHelp || def.help) && <p className="text-xs text-gray-500 leading-relaxed">{styleHelp ?? def.help}</p>}
    </div>
  );
}

export function formatValue(def: PropDef, v: PropValue): string {
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (def.type === 'select') return def.options?.find(o => o.value === v)?.label ?? String(v);
  return `${v}${def.unit ?? ''}`;
}

/** The font picker for a font-typed setting; hovering a font previews it in the overlay without an edit. */
function FontControl({ def, value, onChange }: { def: PropDef; value: PropValue; onChange: (v: unknown) => void }) {
  const { previewProp } = useOverlayEditor();
  const inherit = def.options?.find(o => o.value === 'inherit');
  return (
    <FontPicker
      label={def.label}
      fonts={BACK_FONTS}
      categories={FONT_CATEGORIES}
      extra={inherit ? [{ id: 'inherit', label: inherit.label, css: 'inherit', category: 'Site' }] : undefined}
      value={String(value)}
      onChange={onChange}
      onNeedFont={id => { void loadBackFont(id, 700); }}
      onPreview={v => previewProp(def.key, v)}
    />
  );
}

export function Control({ def, id, value, onChange }: { def: PropDef; id: string; value: PropValue; onChange: (v: unknown) => void }) {
  switch (def.type) {
    case 'number': {
      const n = typeof value === 'number' ? value : Number(def.default);
      return (
        <div className="flex items-center gap-3">
          <input
            id={id}
            type="range"
            min={def.min}
            max={def.max}
            step={def.step ?? 1}
            value={n}
            onChange={e => onChange(Number(e.target.value))}
            className="flex-1 accent-yellow-500 min-w-0"
          />
          <span className="flex items-center gap-1 shrink-0">
            <input
              type="number"
              aria-label={`${def.label} value`}
              min={def.min}
              max={def.max}
              step={def.step ?? 1}
              value={n}
              onChange={e => { if (e.target.value !== '') onChange(Number(e.target.value)); }}
              className={`${inputCls} w-20`}
            />
            {def.unit && <span className="text-xs text-gray-500 w-4">{def.unit}</span>}
          </span>
        </div>
      );
    }
    case 'boolean': {
      const on = value === true;
      return (
        <input
          id={id}
          type="checkbox"
          role="switch"
          className="toggle toggle-sm toggle-primary"
          checked={on}
          onChange={() => onChange(!on)}
        />
      );
    }
    case 'select':
      if (def.font) return <FontControl def={def} value={value} onChange={onChange} />;
      return (
        <select id={id} value={String(value)} onChange={e => onChange(e.target.value)} className="select select-sm w-full">
          {def.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'color': {
      const c = typeof value === 'string' ? value : '#ffffff';
      return (
        <div className="flex items-center gap-2">
          <input id={id} type="color" value={c} onChange={e => onChange(e.target.value)} className="h-8 w-12 rounded-sm bg-transparent border border-gray-700 cursor-pointer" />
          <input
            type="text"
            aria-label={`${def.label} hex`}
            defaultValue={c}
            key={c}
            maxLength={7}
            onBlur={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onChange((e.target as HTMLInputElement).value); } }}
            className={`${inputCls} w-24 font-mono`}
          />
        </div>
      );
    }
    case 'colors': {
      const list = Array.isArray(value) ? value : [];
      const min = def.minItems ?? 1, max = def.maxItems ?? 8;
      const set = (i: number, c: string) => onChange(list.map((x, j) => (j === i ? c : x)));
      return (
        <div className="space-y-2">
          <div
            aria-hidden
            className="h-3 rounded-full border border-gray-700"
            style={{ background: list.length > 1 ? `linear-gradient(90deg, ${list.join(', ')})` : list[0] ?? '#000' }}
          />
          <div id={id} className="flex flex-wrap items-center gap-2">
            {list.map((c, i) => (
              <span key={i} className="relative inline-flex">
                <input type="color" aria-label={`${def.label} ${i + 1}`} value={c} onChange={e => set(i, e.target.value)} className="h-8 w-10 rounded-sm bg-transparent border border-gray-700 cursor-pointer" />
                {list.length > min && (
                  <button
                    type="button"
                    aria-label={`Remove colour ${i + 1}`}
                    onClick={() => onChange(list.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-800 border border-gray-600 text-[10px] leading-none text-gray-300 hover:text-red-300"
                  >×</button>
                )}
              </span>
            ))}
            {list.length < max && (
              <button
                type="button"
                onClick={() => onChange([...list, list[list.length - 1] ?? '#ffffff'])}
                className="h-8 px-2 rounded-sm border border-dashed border-gray-600 text-xs text-gray-400 hover:text-white hover:border-gray-400"
              >+ add</button>
            )}
          </div>
        </div>
      );
    }
    case 'text':
      return (
        <input
          id={id}
          type="text"
          value={String(value)}
          maxLength={def.maxLength}
          onChange={e => onChange(e.target.value)}
          className={`${inputCls} w-full`}
        />
      );
  }
}
