'use client';
import { PROPS, VARIANT_IDS, type PropValue, type PropValues, type VariantId } from '@/lib/overlay-props';
import { PERF_LABEL, variantPerf } from '@/lib/overlay-perf';
import { PERF_STYLE, VARIANT_LABELS } from './editor-types';

// The Variants category's picker: one card per variant, with a one-line summary and the load guide.
export function VariantPicker({ valueOf, current, version, onPick }: { valueOf: (key: string) => PropValue; current: PropValues; version: VariantId; onPick: (v: VariantId) => void }) {
  const variantSummary = (v: VariantId) => {
    const g = (n: string) => valueOf(`variant.${v}.${n}`);
    const bits: string[] = [];
    if (g('holoMode') === 'on') bits.push('Holo'); else if (g('holoMode') === 'auto') bits.push('Holo by stars');
    if (g('glow') === true) bits.push('Glow');
    if (g('pop') === true) bits.push('Pop');
    if (g('tilt') === true) bits.push('3D tilt');
    if (g('rock') === true) bits.push('Rock');
    if (g('sparkles') === true) bits.push('Sparkles');
    return bits.join(' · ') || 'Plain';
  };
  return (
    <div className="p-3 space-y-2">
      <p className="text-xs text-gray-500 leading-relaxed">Choose a card variant to edit. Clicking the card in the preview opens the variant you are previewing.</p>
      {VARIANT_IDS.map(v => {
        const colors = valueOf(`variant.${v}.labelColors`) as string[];
        const changed = PROPS.filter(d => d.variant === v && current[d.key] !== undefined).length;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            className={`w-full text-left rounded-xl border p-3 flex items-center gap-3 transition-colors ${version === v ? 'border-yellow-500/60 bg-yellow-500/5' : 'border-gray-700 hover:border-gray-500 hover:bg-white/5'}`}
          >
            <span
              className="px-2.5 py-1 rounded-full text-[11px] font-bold text-white shrink-0 max-w-32 truncate"
              style={{ background: colors.length > 1 ? `linear-gradient(90deg, ${colors.join(', ')})` : colors[0] }}
            >
              {String(valueOf(`variant.${v}.labelText`))}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-white">{VARIANT_LABELS[v]}</span>
              <span className="block text-xs text-gray-500 truncate">{variantSummary(v)}</span>
            </span>
            {(() => { const r = variantPerf(valueOf, v); return <span title={r.reasons.join(', ') || 'A rough guide to how hard this version works the overlay'} className={`text-[10px] font-bold rounded-full border px-1.5 shrink-0 ${PERF_STYLE[r.level]}`}>{PERF_LABEL[r.level]}</span>; })()}
            {version === v && <span className="text-[10px] uppercase tracking-wide text-yellow-400 font-bold shrink-0">Previewing</span>}
            {changed > 0 && <span className="text-[10px] font-bold text-yellow-400 bg-yellow-500/10 rounded-full px-1.5 shrink-0">{changed}</span>}
            <span aria-hidden className="text-gray-500">›</span>
          </button>
        );
      })}
    </div>
  );
}
