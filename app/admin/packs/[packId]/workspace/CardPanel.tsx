'use client';
import { Icon } from '@/app/components/Icon';
import { FramePicker } from '../../../components/FramePicker';
import { OPTIONAL_VARIANTS } from '../../../components/VariantSwitches';
import { VARIANT_LABELS } from '@/lib/variants';
import type { PackInput } from '@/lib/pack-clean';
import { cardProblems } from '@/lib/pack-clean';
import type { CardFields, WorkCard } from '@/lib/pack-editor-core';
import { ArtDrop, Field, NumberInput, Section, SoundField, Stars, inputCls } from './fields';
import { cardMarks } from './CardList';

/** The right panel with one card selected: its basics, art, sound, versions and problems. */
export function CardPanel({ card, cards, pack, locked, changed, onChange, onRemove }: {
  card: WorkCard;
  cards: WorkCard[];
  pack: PackInput;
  /** Viewers hold this card, so its number is fixed. */
  locked: boolean;
  changed: Set<keyof CardFields>;
  onChange: (patch: Partial<CardFields>, key?: string) => void;
  onRemove: () => void;
}) {
  const total = cards.reduce((s, c) => s + (c.probability > 0 ? c.probability : 0), 0);
  const chance = card.probability > 0 && total > 0 ? card.probability / total : 0;
  const messages = cardProblems({ name: card.name, stars: card.stars, probability: card.probability, number: card.number || 1 }, cards.filter(c => c.id !== card.id && c.number).map(c => c.number));
  const marks = cardMarks(card, pack).filter(m => m.id !== 'sound' && m.id !== 'versions');
  const dot = (...k: (keyof CardFields)[]) => (k.some(x => changed.has(x)) ? 'changed' as const : null);
  const jump = (id: string) => { const el = document.getElementById(id); el?.scrollIntoView({ block: 'center' }); (el?.querySelector('input,button') as HTMLElement | null)?.focus?.(); (el as HTMLElement | null)?.focus?.(); };

  return (
    <div>
      <Section title="Basics" dot={messages.length > 0 ? 'problem' : dot('name', 'number', 'stars', 'probability')}>
        <Field label="Name" htmlFor="cw-name"><input id="cw-name" className={inputCls} value={card.name} maxLength={80} onChange={e => onChange({ name: e.target.value }, 'name')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Number" htmlFor="cw-number" help={locked ? "Fixed: viewers hold this card and their collections point at its number." : card.number ? undefined : 'Assigned when you save.'}>
            <NumberInput id="cw-number" value={card.number} min={1} step={1} disabled={locked || !card.number} onChange={n => onChange({ number: n }, 'number')} />
          </Field>
          <Field label="Stars"><div id="cw-stars"><Stars value={card.stars} onChange={n => onChange({ stars: n })} /></div></Field>
        </div>
        <Field label="Chance (weight)" htmlFor="cw-odds" help={chance > 0 ? <>1 in <strong className="text-gray-300">{Math.round(1 / chance).toLocaleString('en-GB')}</strong> pulls, {(chance * 100).toFixed(chance >= 0.1 ? 1 : 2)}% of the pack</> : 'With 0 this card can never be pulled.'}>
          <NumberInput id="cw-odds" value={card.probability} min={0} onChange={n => onChange({ probability: n }, 'odds')} />
        </Field>
      </Section>

      <Section title="Art" dot={dot('imageUrl', 'fullArtImageUrl', 'stillUrl', 'fullArtStillUrl')}>
        <div id="cw-art" tabIndex={-1}>
          <ArtDrop label="Card image" value={card.imageUrl} onChange={u => onChange({ imageUrl: u, ...(u !== card.imageUrl ? { stillUrl: '' } : {}) })} />
          <div className="mt-2"><FramePicker artUrl={card.imageUrl} value={card.stillUrl} onChange={u => onChange({ stillUrl: u })} /></div>
        </div>
        <div id="cw-fullart" tabIndex={-1}>
          <ArtDrop label="Full art image (Full Art and Shiny)" value={card.fullArtImageUrl} onChange={u => onChange({ fullArtImageUrl: u, ...(u !== card.fullArtImageUrl ? { fullArtStillUrl: '' } : {}) })} />
          <div className="mt-2"><FramePicker artUrl={card.fullArtImageUrl} value={card.fullArtStillUrl} onChange={u => onChange({ fullArtStillUrl: u })} label="Choose full-art still frame" /></div>
        </div>
      </Section>

      <Section title="Sound" dot={dot('soundUrl')}>
        <div id="cw-sound" tabIndex={-1}><SoundField value={card.soundUrl} onChange={u => onChange({ soundUrl: u })} defaultUrl={card.number >= 1 && card.number <= 25 ? `/assets/sounds/${card.number}.mp3` : undefined} /></div>
      </Section>

      <Section title="Versions" dot={dot('disabledVariants', 'upgradesEnabled')}>
        <label className="flex items-center gap-2 text-sm text-gray-200">
          <input type="checkbox" checked={card.upgradesEnabled} onChange={e => onChange({ upgradesEnabled: e.target.checked })} className="accent-yellow-400" />
          Allow versions and upgrades for this card
          {!pack.upgradesEnabled && <span className="text-xs text-gray-600">(the pack has them off)</span>}
        </label>
        <div role="group" aria-label="Versions this card can be" className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-sm text-gray-500" title="Regular is always on"><input type="checkbox" checked disabled aria-label="Regular (always on)" className="accent-yellow-400" /> Regular</span>
          {OPTIONAL_VARIANTS.map(v => {
            const packOff = (pack.disabledVariants ?? []).includes(v);
            return (
              <label key={v} title={packOff ? 'Switched off for the whole pack' : undefined} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm border-gray-700 text-gray-200 ${packOff ? 'opacity-50' : 'cursor-pointer hover:border-gray-500'}`}>
                <input type="checkbox" disabled={packOff} checked={!packOff && !card.disabledVariants.includes(v)} onChange={e => onChange({ disabledVariants: e.target.checked ? card.disabledVariants.filter(x => x !== v) : [...card.disabledVariants, v] })} className="accent-yellow-400" />
                {VARIANT_LABELS[v]}
              </label>
            );
          })}
        </div>
      </Section>

      <Section title="Problems" dot={messages.length > 0 ? 'problem' : null}>
        {messages.length === 0 && marks.length === 0 ? <p className="text-sm text-gray-500 flex items-center gap-2"><Icon name="checkCircle" className="text-emerald-400" />Nothing to fix.</p> : (
          <ul className="space-y-2">
            {messages.map(m => <li key={m} className="flex items-start gap-2 text-sm text-red-200"><Icon name="warning" className="mt-0.5 shrink-0 text-red-400" />{m}</li>)}
            {marks.map(m => (
              <li key={m.id} className="flex items-start gap-2 text-sm text-gray-300">
                <Icon name="warning" className="mt-0.5 shrink-0 text-amber-400" /><span className="flex-1">{m.label}</span>
                <button type="button" onClick={() => jump(m.id === 'art' ? 'cw-art' : m.id === 'full' ? 'cw-fullart' : 'cw-odds')} className="text-xs font-bold text-yellow-400 hover:text-yellow-300">Fix</button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={onRemove} className="text-xs font-bold text-red-300 hover:text-red-200">Remove this card</button>
      </Section>
    </div>
  );
}
