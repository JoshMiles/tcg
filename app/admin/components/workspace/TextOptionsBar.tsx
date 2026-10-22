'use client';
// The text formatting row of the options bar (ROADMAP 38.31): font, size, colour, B / I / U, align, and (vertical align, Highlight tokens) in a "More"
// popover below `xl`. Generic like CharacterPanel: it gets the value (a control shows when its key is present, MIXED where several layers differ) and
// reports the changed fields; it imports nothing from the overlay or the card back.
import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/app/components/Icon';
import { MIXED, type TextFormat, type TextFormatValue } from '@/lib/text-format';
import { FontPicker, type PickerFont } from './FontPicker';

const tog = (on: boolean, mixed: boolean) => `p-1.5 rounded-md border ${on ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300' : mixed ? 'border-dashed border-gray-600 text-gray-400' : 'border-transparent text-gray-200 hover:bg-white/10'}`;
const HEX = /^#[0-9a-f]{6}$/i;

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const mixed = value === MIXED;
  return <input type="color" aria-label={label} title={mixed ? `${label} (mixed)` : label} value={HEX.test(value) ? value : '#808080'} onChange={e => onChange(e.target.value)} className={`w-8 h-7 rounded-sm bg-transparent border p-0.5 ${mixed || !HEX.test(value) ? 'border-dashed border-gray-500 opacity-60' : 'border-gray-700'}`} />;
}

export function TextOptionsBar({ value: v, onChange, fonts, categories, fontExtra, onNeedFont, onPreviewFont, sample, sizeMin = 6, sizeMax = 400 }: {
  value: TextFormatValue;
  onChange: (patch: TextFormat) => void;
  fonts: PickerFont[];
  categories: readonly string[];
  fontExtra?: PickerFont[];
  onNeedFont?: (id: string) => void;
  onPreviewFont?: (id: string | null) => void;
  sample?: string;
  sizeMin?: number;
  sizeMax?: number;
}) {
  const [more, setMore] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!more) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setMore(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [more]);

  const flag = (key: 'bold' | 'italic' | 'underline', icon: IconName, label: string) => v[key] !== undefined && (
    <button key={key} type="button" aria-label={label} aria-pressed={v[key] === MIXED ? 'mixed' : v[key] === true} title={label} onClick={() => onChange({ [key]: v[key] !== true })} className={tog(v[key] === true, v[key] === MIXED)}><Icon name={icon} /></button>
  );
  const pick = <K extends 'align' | 'valign'>(key: K, opts: readonly [NonNullable<TextFormat[K]>, IconName, string][], label: string) => v[key] !== undefined && (
    <div className="flex items-center gap-0.5" role="group" aria-label={label}>
      {opts.map(([id, icon, name]) => <button key={id} type="button" aria-label={name} aria-pressed={v[key] === id} title={name} onClick={() => onChange({ [key]: id })} className={tog(v[key] === id, false)}><Icon name={icon} /></button>)}
    </div>
  );
  const align = pick('align', [['left', 'textLeft', 'Align left'], ['center', 'textCenter', 'Align centre'], ['right', 'textRight', 'Align right']], 'Text align');
  const valign = pick('valign', [['top', 'alignTop', 'Align to the top'], ['middle', 'alignMiddle', 'Align to the middle'], ['bottom', 'alignBottom', 'Align to the bottom']], 'Vertical align');
  const hl = v.highlight;
  const hasMore = valign || hl !== undefined;
  const size = v.size;

  return (
    <div className="flex flex-wrap xl:flex-nowrap items-center gap-2" role="group" aria-label="Text formatting">
      {v.font !== undefined && <div className="w-40 shrink-0"><FontPicker label="Font" fonts={fonts} categories={categories} extra={fontExtra} value={v.font === MIXED ? '' : v.font} onChange={id => onChange({ font: id })} onNeedFont={onNeedFont} onPreview={onPreviewFont} sample={sample} /></div>}
      {size !== undefined && <input type="number" aria-label="Size" title="Size (px)" min={sizeMin} max={sizeMax} placeholder="-" value={size === MIXED ? '' : size} onChange={e => { const n = Number(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange({ size: n }); }} className="input input-sm w-16 shrink-0" />}
      {v.color !== undefined && <Swatch label="Colour" value={v.color} onChange={c => onChange({ color: c })} />}
      <div className="flex items-center gap-0.5">{flag('bold', 'bold', 'Bold')}{flag('italic', 'italic', 'Italic')}{flag('underline', 'underline', 'Underline')}</div>
      {align}
      {hasMore && (
        <div ref={root} className="relative xl:contents">
          <button type="button" aria-label="More text options" aria-expanded={more} title="More" onClick={() => setMore(o => !o)} className={`xl:hidden ${tog(more, false)}`}><Icon name="more" /></button>
          <div className={`${more ? 'flex' : 'hidden'} absolute left-0 top-full z-50 mt-1 flex-col gap-2 rounded-lg border border-gray-700 bg-gray-950 p-2 shadow-xl xl:static xl:mt-0 xl:flex xl:flex-row xl:items-center xl:gap-2 xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none`}>
            {valign}
            {hl !== undefined && (
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <label className="inline-flex items-center gap-1.5 text-xs text-gray-200"><input type="checkbox" role="switch" checked={hl === true} ref={el => { if (el) el.indeterminate = hl === MIXED; }} onChange={e => onChange({ highlight: e.target.checked })} className="toggle toggle-xs toggle-primary" />Highlight tokens</label>
                {hl === true && v.highlightColor !== undefined && (
                  <>
                    <Swatch label="Highlight colour" value={v.highlightColor} onChange={c => onChange({ highlightColor: c })} />
                    <button type="button" aria-pressed={v.highlightColor === 'accent'} onClick={() => onChange({ highlightColor: 'accent' })} title="The pack's accent colour" className={`px-2 py-1 text-xs font-bold rounded-lg border ${v.highlightColor === 'accent' ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300' : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'}`}>accent</button>
                  </>
                )}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
