'use client';

import type { OptionalVariant } from '@/lib/types';
import { VARIANT_LABELS } from '@/lib/variants';

/** The variants that can be switched off. Regular always exists. */
export const OPTIONAL_VARIANTS: OptionalVariant[] = ['reverse', 'full', 'shiny'];

/**
 * Plain form checkboxes (`variant_on_reverse` ...) for server-rendered forms. A hidden `variant_switches` marker tells the
 * server these switches were on the form, so a form that doesn't carry them never switches anything off by accident.
 * Checked = the variant is on.
 */
export function VariantChecks({ disabled = [], dimmed = [] }: { disabled?: OptionalVariant[]; dimmed?: OptionalVariant[] }) {
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">Variants that are on</legend>
      <input type="hidden" name="variant_switches" value="1" />
      <span className="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-sm text-gray-500" title="Regular is always on">
        <input type="checkbox" checked disabled className="accent-yellow-400" aria-label="Regular (always on)" /> Regular
      </span>
      {OPTIONAL_VARIANTS.map(v => (
        <label
          key={v}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm cursor-pointer transition-colors border-gray-700 hover:border-gray-500 text-gray-200 ${dimmed.includes(v) ? 'opacity-50' : ''}`}
          title={dimmed.includes(v) ? 'Already switched off for the whole pack' : undefined}
        >
          <input type="checkbox" name={`variant_on_${v}`} defaultChecked={!disabled.includes(v)} className="accent-yellow-400" />
          {VARIANT_LABELS[v]}
        </label>
      ))}
    </fieldset>
  );
}

/** Controlled chips for client editors. `onChange` receives the new list of switched-off variants. */
export function VariantChips({
  disabled, onChange, locked = [], compact = false,
}: {
  disabled: OptionalVariant[];
  onChange: (next: OptionalVariant[]) => void;
  /** Variants already off for the whole pack: shown struck through and not toggleable here. */
  locked?: OptionalVariant[];
  compact?: boolean;
}) {
  return (
    <div role="group" aria-label="Variants this can be" className="flex flex-wrap items-center gap-1.5">
      {!compact && <span className="text-xs text-gray-500 mr-1">Variants</span>}
      {OPTIONAL_VARIANTS.map(v => {
        const isLocked = locked.includes(v);
        const on = !isLocked && !disabled.includes(v);
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            disabled={isLocked}
            title={isLocked ? `${VARIANT_LABELS[v]} is switched off for the whole pack` : `${on ? 'Switch off' : 'Switch on'} ${VARIANT_LABELS[v]}`}
            onClick={() => onChange(on ? [...disabled, v] : disabled.filter(d => d !== v))}
            className={`px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors ${
              isLocked ? 'border-gray-800 text-gray-700 line-through cursor-not-allowed'
              : on ? 'border-yellow-500/60 bg-yellow-500/10 text-yellow-300'
              : 'border-gray-700 text-gray-500 line-through hover:text-gray-300'
            }`}
          >
            {compact ? ({ reverse: 'RH', full: 'FA', shiny: '✨' } as const)[v] : VARIANT_LABELS[v]}
          </button>
        );
      })}
    </div>
  );
}
