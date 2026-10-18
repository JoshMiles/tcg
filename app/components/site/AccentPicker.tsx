'use client';
import { useState } from 'react';
import { ACCENTS, accentHex } from '@/lib/user-settings';
import { HEX_RE, clampAccent } from '@/lib/accent';

/** Profile accent: twelve named swatches plus a custom colour (colour picker and hex field). `value` is '' (default), an ACCENTS id or a '#rrggbb'. */
export function AccentPicker({ value, onChange, id = 'accent' }: { value: string; onChange: (v: string) => void; id?: string }) {
  const custom = !!value && !ACCENTS.some(a => a.id === value);
  const [text, setText] = useState(custom ? value : '');
  const typed = text.startsWith('#') ? text : `#${text}`;
  const clamped = HEX_RE.test(typed) ? clampAccent(typed) : null;
  const shown = accentHex(value);
  const adjusted = clamped && clamped !== typed.toLowerCase();

  const commit = (hex: string) => {
    setText(hex);
    const c = HEX_RE.test(hex) ? clampAccent(hex) : null;
    if (c) onChange(c);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Profile accent colour">
        {ACCENTS.map(a => (
          <button key={a.id} type="button" role="radio" aria-checked={value === a.id} onClick={() => { setText(''); onChange(value === a.id ? '' : a.id); }}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${value === a.id ? 'border-white text-white' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
            <span className="h-3 w-3 rounded-full" style={{ background: a.hex }} />{a.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <label htmlFor={`${id}-picker`} className="font-semibold text-gray-300">Custom</label>
        <input id={`${id}-picker`} type="color" value={shown ?? '#facc15'} onChange={e => commit(e.target.value)} className="h-8 w-10 cursor-pointer rounded-lg border border-gray-700 bg-gray-950 p-0.5" aria-label="Pick a custom accent colour" />
        <input type="text" value={text} onChange={e => commit(e.target.value.trim())} placeholder="#rrggbb" maxLength={7} spellCheck={false} aria-label="Custom accent colour as a hex code"
          className="w-24 rounded-xl bg-gray-950 border border-gray-700 focus:border-yellow-500 px-2.5 py-1.5 text-sm text-white placeholder-gray-600 outline-hidden tabular-nums" />
        {value && <button type="button" onClick={() => { setText(''); onChange(''); }} className="rounded-full border border-gray-700 px-2.5 py-1 font-bold text-gray-400 hover:text-white">Default</button>}
        {adjusted && <span className="inline-flex items-center gap-1.5" aria-live="polite"><span className="h-3 w-3 rounded-full" style={{ background: clamped }} />Adjusted to {clamped} so it stays readable.</span>}
      </div>
    </div>
  );
}
