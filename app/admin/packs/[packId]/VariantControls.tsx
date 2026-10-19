'use client';
import { Icon } from '@/app/components/Icon';
import { useState, useTransition } from 'react';
import type { OptionalVariant, VariantWeights } from '@/lib/types';
import { VARIANT_LABELS } from '@/lib/variants';
import { setPackVariant } from '../../actions/packs';
import { setCardUpgrades, setCardVariant, bulkCards } from '../../actions/cards';
import type { BulkCardOp } from '../../actions/form-helpers';
import { VariantChips, OPTIONAL_VARIANTS } from '../../components/VariantSwitches';

/** "Variants & odds": switch a variant on or off for the whole pack and see the resulting pull odds. */
export function PackVariantsPanel({
  packId, upgradesEnabled, disabled: initialDisabled, weights,
}: {
  packId: string; upgradesEnabled: boolean; disabled: OptionalVariant[]; weights: VariantWeights;
}) {
  const [disabled, setDisabled] = useState<OptionalVariant[]>(initialDisabled);
  const [pending, start] = useTransition();

  const toggle = (next: OptionalVariant[]) => {
    const changed = OPTIONAL_VARIANTS.find(v => next.includes(v) !== disabled.includes(v));
    setDisabled(next);
    if (changed) start(async () => { await setPackVariant(packId, changed, !next.includes(changed)); });
  };

  const eff = {
    regular: Math.max(0, weights.regular),
    reverse: disabled.includes('reverse') ? 0 : Math.max(0, weights.reverse),
    full: disabled.includes('full') ? 0 : Math.max(0, weights.full),
    shiny: disabled.includes('shiny') ? 0 : Math.max(0, weights.shiny),
  };
  const total = eff.regular + eff.reverse + eff.full + eff.shiny || 1;
  const rows = (['regular', 'reverse', 'full', 'shiny'] as const).map(v => ({ v, pct: (eff[v] / total) * 100 }));

  return (
    <div className="card tcg-panel rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Variants &amp; odds</h3>
        {pending && <span className="text-[11px] text-gray-500">Saving…</span>}
      </div>
      {!upgradesEnabled ? (
        <p className="text-xs text-gray-500">Variants and upgrades are off for this pack, so every pull is a Regular. Turn them on in Pack Settings.</p>
      ) : (
        <>
          <VariantChips disabled={disabled} onChange={toggle} />
          <div className="space-y-1.5">
            {rows.map(({ v, pct }) => (
              <div key={v} className={`space-y-0.5 ${pct === 0 ? 'opacity-40' : ''}`}>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{VARIANT_LABELS[v]}</span>
                  <span className="tabular-nums">{pct === 0 ? (v === 'regular' ? '0%' : 'off') : `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`}</span>
                </div>
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-yellow-500/80 rounded-full" style={{ width: `${pct}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Odds of each variant per pull, from the weights in Pack Settings. A switched-off variant is never rolled and upgrades skip it at the combined cost.
          </p>
        </>
      )}
    </div>
  );
}

/** A card's own upgrades switch and variant chips, saved straight away. */
export function CardToggles({
  packId, cardId, packUpgrades, upgrades: initialUpgrades, disabled: initialDisabled, packDisabled, hasFullArt,
}: {
  packId: string; cardId: string; packUpgrades: boolean; upgrades: boolean; disabled: OptionalVariant[]; packDisabled: OptionalVariant[]; hasFullArt: boolean;
}) {
  const [upgrades, setUpgrades] = useState(initialUpgrades);
  const [disabled, setDisabled] = useState<OptionalVariant[]>(initialDisabled);
  const [, start] = useTransition();

  if (!packUpgrades) return <span className="text-xs text-gray-700">-</span>;

  const fullArtOn = !packDisabled.includes('full') && !disabled.includes('full') || !packDisabled.includes('shiny') && !disabled.includes('shiny');
  return (
    <div className="flex flex-nowrap items-center justify-end gap-2 whitespace-nowrap">
      <input
        type="checkbox"
        role="switch"
        className="toggle toggle-xs toggle-primary"
        checked={upgrades}
        aria-label={upgrades ? 'Variants and upgrades on for this card' : 'Variants and upgrades off for this card'}
        title={upgrades ? 'Variants & upgrades on for this card: click to turn off' : 'Variants & upgrades off for this card: click to turn on'}
        onChange={() => { const next = !upgrades; setUpgrades(next); start(async () => { await setCardUpgrades(packId, cardId, next); }); }}
      />
      {upgrades ? (
        <>
          <VariantChips
            compact
            disabled={disabled}
            locked={packDisabled}
            onChange={next => {
              const changed = OPTIONAL_VARIANTS.find(v => next.includes(v) !== disabled.includes(v));
              setDisabled(next);
              if (changed) start(async () => { await setCardVariant(packId, cardId, changed, !next.includes(changed)); });
            }}
          />
          {!hasFullArt && fullArtOn && <span className="text-xs text-amber-500" title="No full-art image: Full Art and Shiny reuse the normal art. Use Variant tools to switch them off for cards like this." aria-label="No full-art image"><Icon name="warning" className="w-3.5 h-3.5" /></span>}
        </>
      ) : (
        <span className="text-[11px] text-gray-600">off</span>
      )}
    </div>
  );
}

const OPS: { op: BulkCardOp; label: string; hint: string }[] = [
  { op: 'fullart-off-without-art', label: 'Switch off Full Art & Shiny where there is no full-art image', hint: 'Those cards would just reuse their normal art.' },
  { op: 'upgrades-on', label: 'Turn upgrades on for every card', hint: '' },
  { op: 'upgrades-off', label: 'Turn upgrades off for every card', hint: '' },
  { op: 'all-variants-on', label: 'Switch every card\'s variants back on', hint: 'Clears the per-card switches.' },
];

/** Bulk actions across the pack's cards. */
export function BulkBar({ packId }: { packId: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, start] = useTransition();

  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="px-3 py-2 text-sm font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl transition-colors"
      >
        Variant tools {open ? '▴' : '▾'}
      </button>
      {open && (
        <div className="rounded-xl border border-gray-800 bg-gray-950/60 p-3 space-y-2">
          {OPS.map(o => (
            <div key={o.op} className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-300">{o.label}{o.hint && <span className="block text-xs text-gray-600">{o.hint}</span>}</div>
              <button
                type="button"
                disabled={pending}
                onClick={() => start(async () => {
                  const { changed } = await bulkCards(packId, o.op);
                  setMessage(changed === 0 ? 'Nothing to change.' : `Updated ${changed} card${changed === 1 ? '' : 's'}.`);
                })}
                className="shrink-0 px-3 py-1.5 text-xs font-bold border border-gray-700 hover:border-yellow-500/60 text-gray-200 rounded-lg disabled:opacity-40"
              >
                Apply
              </button>
            </div>
          ))}
          {message && <p role="status" className="text-xs text-green-300">{message}</p>}
        </div>
      )}
    </div>
  );
}
