'use client';
import { Icon } from '@/app/components/Icon';
import { useState } from 'react';
import type { Variant } from '@/lib/types';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import { UpgradeCeremony } from '@/app/components/UpgradeCeremony';
import type { HoloSpecs } from '@/lib/holo-core';

interface PreviewCard { number: number; name: string; imageUrl: string; fullArtImageUrl?: string; holo: HoloSpecs }

/** Plays the viewer-facing upgrade animation for any card and variant step, without needing to set up a real upgrade. */
export function UpgradePreview({ cards, costs }: { cards: PreviewCard[]; costs: { reverse: number; full: number; shiny: number } }) {
  const [number, setNumber] = useState(cards[0]?.number ?? 0);
  const [to, setTo] = useState<Variant>('reverse');
  const [playing, setPlaying] = useState(false);
  const card = cards.find(c => c.number === number) ?? cards[0];
  if (!card) return null;
  const from = VARIANTS[Math.max(0, VARIANTS.indexOf(to) - 1)];
  const cost = costs[to as 'reverse' | 'full' | 'shiny'] ?? 5;
  const sel = 'select w-full';

  return (
    <div className="tcg-panel rounded-2xl p-5 space-y-3">
      <h2 className="font-semibold text-white">Preview the upgrade animation</h2>
      <p className="text-xs text-gray-500">What a viewer sees when they upgrade on the website. Nothing is saved.</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-gray-500 space-y-1">Card
          <select value={number} onChange={e => setNumber(Number(e.target.value))} className={sel}>
            {cards.map(c => <option key={c.number} value={c.number}>#{c.number} {c.name}</option>)}
          </select>
        </label>
        <label className="block text-xs text-gray-500 space-y-1">Upgrade to
          <select value={to} onChange={e => setTo(e.target.value as Variant)} className={sel}>
            {(['reverse', 'full', 'shiny'] as Variant[]).map(v => <option key={v} value={v}>{VARIANT_LABELS[v]}</option>)}
          </select>
        </label>
      </div>
      <button type="button" onClick={() => setPlaying(true)} className="tcg-btn px-4 py-2 text-sm rounded-xl"><Icon name="play" className="mr-1" />Play</button>
      {playing && <UpgradeCeremony card={card} holo={card.holo} from={from} to={to} cost={cost} gain={Math.round(40 + Math.random() * 400)} onClose={() => setPlaying(false)} />}
    </div>
  );
}
