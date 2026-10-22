'use client';

/** B / I / Colour buttons for a field that takes light markup (lib/text-markup.ts): `wrap(open, close)` puts the marks around the selection. */
export function MarkupButtons({ wrap }: { wrap: (open: string, close: string) => void }) {
  const btn = 'px-1.5 py-0.5 rounded-sm border border-gray-700 text-xs text-gray-300 hover:border-yellow-500';
  return (
    <div className="flex flex-wrap items-center gap-1" aria-label="Format the selection">
      <button type="button" title="Bold: wraps the selection in **" aria-label="Bold" onClick={() => wrap('**', '**')} className={`${btn} font-bold`}>B</button>
      <button type="button" title="Italic: wraps the selection in *" aria-label="Italic" onClick={() => wrap('*', '*')} className={`${btn} italic`}>I</button>
      <label title="Colour: wraps the selection in {color:#rrggbb} (applies when the picker closes)" className="inline-flex items-center gap-1 text-xs text-gray-400">Colour
        <input type="color" aria-label="Colour the selection" defaultValue="#ffcc00" ref={el => { if (el) el.onchange = () => wrap(`{color:${el.value}}`, '{/color}'); }} className="w-6 h-5 rounded-sm bg-transparent border border-gray-700 p-0" />
      </label>
    </div>
  );
}
