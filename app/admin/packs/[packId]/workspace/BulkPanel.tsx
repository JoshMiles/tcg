'use client';
import { useState } from 'react';
import { OPTIONAL_VARIANTS } from '../../../components/VariantSwitches';
import { VARIANT_LABELS } from '@/lib/variants';
import type { BulkOp, WorkCard } from '@/lib/pack-editor-core';
import { NumberInput, Section, Stars } from './fields';

const btn = 'px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-700 text-gray-200 hover:border-gray-500 disabled:opacity-40';

/** The right panel with several cards selected (ROADMAP 20.2c): one change applied to all of them, into the same working state. */
export function BulkPanel({ selected, held, onApply, onRemove }: {
  selected: WorkCard[];
  held: Set<number>;
  onApply: (op: BulkOp) => void;
  onRemove: (ids: string[]) => void;
}) {
  const [stars, setStars] = useState(3);
  const [weight, setWeight] = useState(10);
  const [factor, setFactor] = useState(0.5);
  const heldOnes = selected.filter(c => c.number && held.has(c.number));
  const free = selected.filter(c => !heldOnes.includes(c));
  return (
    <div>
      <div className="p-4 border-b border-gray-800">
        <p className="text-sm font-semibold text-white">{selected.length} cards selected</p>
        <p className="text-xs text-gray-500 mt-0.5">Every change below goes into the same unsaved changes, so you can undo it and review it before saving.</p>
      </div>
      <Section title="Stars and odds">
        <div className="flex items-center gap-3"><Stars value={stars} onChange={setStars} label="Stars to set" /><button type="button" className={btn} onClick={() => onApply({ kind: 'stars', value: stars })}>Set stars</button></div>
        <div className="flex items-end gap-2"><div className="w-28"><NumberInput ariaLabel="Weight to set" value={weight} min={0} onChange={setWeight} /></div><button type="button" className={btn} onClick={() => onApply({ kind: 'weight', value: weight })}>Set weight</button></div>
        <div className="flex items-end gap-2"><div className="w-28"><NumberInput ariaLabel="Factor to multiply the weights by" value={factor} min={0} onChange={setFactor} /></div><button type="button" className={btn} onClick={() => onApply({ kind: 'multiply', factor })}>Multiply weights</button></div>
      </Section>
      <Section title="Versions">
        {OPTIONAL_VARIANTS.map(v => (
          <div key={v} className="flex items-center justify-between gap-2 text-sm text-gray-200">
            <span>{VARIANT_LABELS[v]}</span>
            <span className="flex gap-1.5"><button type="button" className={btn} onClick={() => onApply({ kind: 'version', variant: v, on: true })}>On</button><button type="button" className={btn} onClick={() => onApply({ kind: 'version', variant: v, on: false })}>Off</button></span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2 text-sm text-gray-200"><span>Upgrades opt-out</span>
          <span className="flex gap-1.5"><button type="button" className={btn} onClick={() => onApply({ kind: 'upgrades', on: true })}>Allow</button><button type="button" className={btn} onClick={() => onApply({ kind: 'upgrades', on: false })}>Opt out</button></span>
        </div>
      </Section>
      <Section title="Sound">
        <div className="flex gap-2"><button type="button" className={btn} onClick={() => onApply({ kind: 'sound', mode: 'default' })}>Use the default sound</button><button type="button" className={btn} onClick={() => onApply({ kind: 'sound', mode: 'clear' })}>Clear sound</button></div>
        <p className="text-xs text-gray-600">The default sound exists for cards 1 to 25; other cards are left alone.</p>
      </Section>
      <Section title="Delete">
        <p className="text-xs text-gray-400">{heldOnes.length > 0 ? <>{heldOnes.length} held by viewers will be skipped: {heldOnes.map(c => `#${c.number}`).join(', ')}.</> : 'Cards nobody holds are removed when you save.'}</p>
        <button type="button" disabled={free.length === 0} onClick={() => onRemove(free.map(c => c.id))} className="px-3 py-1.5 text-xs font-bold text-red-300 border border-red-500/30 rounded-lg disabled:opacity-40">Delete {free.length} {free.length === 1 ? 'card' : 'cards'}</button>
      </Section>
    </div>
  );
}
