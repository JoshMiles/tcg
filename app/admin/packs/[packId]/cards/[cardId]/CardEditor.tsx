'use client';
import { useMemo, useState } from 'react';
import { Icon } from '@/app/components/Icon';
import { PendingButton } from '../../../../components/PendingButton';
import { ImageUploadField } from '../../../../components/image-upload';
import { AudioUploadField } from '../../../../components/audio-upload';
import { cardThumbUrl } from '@/lib/card-art';
import { getRarity } from '@/lib/rarity';
import { holoClass, holoVars, type HoloSpecs } from '@/lib/holo-core';
import { VARIANTS, VARIANT_LABELS, allowedVariants } from '@/lib/variants';
import { OPTIONAL_VARIANTS } from '../../../../components/VariantSwitches';
import type { OptionalVariant, Variant } from '@/lib/types';

export interface EditorCard {
  number: number; name: string; imageUrl: string; fullArtImageUrl: string; soundUrl: string;
  stars: number; probability: number; upgradesEnabled: boolean; disabledVariants: OptionalVariant[];
}
export interface OtherCard { id: string; number: number; name: string; stars: number; probability: number }

const input = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors';

interface Check { id: string; level: 'warn' | 'info' | 'ok'; text: string; /** The server refuses to save while this is true. */ block?: boolean }

/**
 * The card form with a live preview and real-time checks beside it. The preview shows the card as a viewer sees it (the
 * Overlay Editor's holo and the variant look, per version) and updates as you type or upload; the checks catch the usual
 * mistakes (duplicate number or name, no art, no full art for a card that can be Full Art, odds that look off) before you save.
 * It is still a plain form: Save posts to the same server action.
 */
export function CardEditor({
  action, packName, packUpgrades, packDisabled, holoByStars, initial, others, cardId, numberLocked = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  packName: string;
  packUpgrades: boolean;
  packDisabled: OptionalVariant[];
  holoByStars: Record<number, HoloSpecs>;
  initial: EditorCard;
  others: OtherCard[];
  cardId: string;
  /** Some viewer holds this card, so its number is fixed. */
  numberLocked?: boolean;
}) {
  const [name, setName] = useState(initial.name);
  const [number, setNumber] = useState(String(initial.number));
  const [stars, setStars] = useState(String(initial.stars));
  const [probability, setProbability] = useState(String(initial.probability));
  const [image, setImage] = useState(initial.imageUrl);
  const [fullArt, setFullArt] = useState(initial.fullArtImageUrl);
  const [upgrades, setUpgrades] = useState(initial.upgradesEnabled);
  const [disabled, setDisabled] = useState<OptionalVariant[]>(initial.disabledVariants);
  const [shown, setShown] = useState<Variant>('regular');

  const starsN = Math.min(5, Math.max(1, Math.round(Number(stars)) || 1));
  const allowed = useMemo(() => (packUpgrades && upgrades ? allowedVariants({ disabledVariants: packDisabled }, { disabledVariants: disabled }) : (['regular'] as Variant[])), [packUpgrades, upgrades, packDisabled, disabled]);
  const variant: Variant = allowed.includes(shown) ? shown : 'regular';
  const art = (variant === 'full' || variant === 'shiny') && fullArt ? fullArt : image;
  const thumb = art ? cardThumbUrl(art) : '';
  const spec = holoByStars[starsN]?.[variant];
  const rarity = getRarity(starsN);

  const probN = Number(probability);
  const otherTotal = others.reduce((s, c) => s + c.probability, 0);
  const total = otherTotal + (Number.isFinite(probN) && probN > 0 ? probN : 0);
  const chance = total > 0 && probN > 0 ? probN / total : 0;
  const avg = others.length > 0 ? otherTotal / others.length : 0;

  const checks = useMemo<Check[]>(() => {
    const out: Check[] = [];
    const num = Number(number);
    if (!name.trim()) out.push({ id: 'name', level: 'warn', block: true, text: 'The card needs a name.' });
    else if (others.some(c => c.name.trim().toLowerCase() === name.trim().toLowerCase())) out.push({ id: 'dup-name', level: 'info', text: 'Another card in this pack has the same name.' });
    if (!Number.isInteger(num) || num < 1 || num > 999_999) out.push({ id: 'num', level: 'warn', block: true, text: 'The card number must be a whole number from 1 to 999,999.' });
    else if (others.some(c => c.number === num)) out.push({ id: 'dup-num', level: 'warn', block: true, text: `Card #${num} is already used in this pack. Viewer collections point at numbers, so they must be unique.` });
    const starsRaw = Number(stars);
    if (!Number.isInteger(starsRaw) || starsRaw < 1 || starsRaw > 5) out.push({ id: 'stars', level: 'warn', block: true, text: 'Stars must be a whole number from 1 to 5.' });
    if (!image) out.push({ id: 'img', level: 'warn', text: 'No image yet.' });
    else if (/\.gif($|\?)/i.test(image)) out.push({ id: 'gif', level: 'info', text: 'This is an unoptimised GIF. Re-upload it to get a smaller WebP and a thumbnail.' });
    if (packUpgrades && upgrades && !fullArt && allowed.includes('full')) out.push({ id: 'fullart', level: 'warn', text: 'This card can be pulled as Full Art / Shiny but has no full-art image, so those versions reuse the normal art.' });
    if (packUpgrades && upgrades && allowed.length === 1) out.push({ id: 'novariants', level: 'info', text: 'Every optional variant is switched off for this card, so it is always Regular.' });
    if (!Number.isFinite(probN) || probN < 0) out.push({ id: 'oddsBad', level: 'warn', block: true, text: 'Odds must be a number, 0 or more.' });
    else if (!(probN > 0)) out.push({ id: 'odds0', level: 'warn', text: 'With 0 odds this card can never be pulled.' });
    else if (avg > 0 && probN > avg * 4) out.push({ id: 'oddsHigh', level: 'info', text: `These odds are ${(probN / avg).toFixed(1)}× the average card's, so it will come up a lot.` });
    else if (avg > 0 && probN < avg / 8) out.push({ id: 'oddsLow', level: 'info', text: `These odds are ${(avg / probN).toFixed(0)}× lower than the average card's.` });
    const sameTier = others.filter(c => c.stars === starsN);
    const lowerTier = others.filter(c => c.stars < starsN);
    if (probN > 0 && lowerTier.length > 0) {
      const lowerAvg = lowerTier.reduce((s, c) => s + c.probability, 0) / lowerTier.length;
      if (probN > lowerAvg) out.push({ id: 'rarity', level: 'info', text: `A ${starsN}★ card usually has lower odds than the cards below it (this one is higher than the average ${[...new Set(lowerTier.map(c => c.stars))].sort().join('/')}★ card).` });
    }
    if (sameTier.length > 0 && probN > 0) {
      const tierAvg = sameTier.reduce((s, c) => s + c.probability, 0) / sameTier.length;
      if (probN > tierAvg * 3) out.push({ id: 'tier', level: 'info', text: `More than 3× the average ${starsN}★ card in this pack.` });
    }
    return out;
  }, [name, number, stars, image, fullArt, upgrades, allowed, probN, avg, others, starsN, packUpgrades]);
  const problems = checks.filter(c => c.level === 'warn').length;
  const blocking = checks.filter(c => c.block).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] items-start">
      <form action={action} className="tcg-panel rounded-xl p-6 grid gap-4 xl:grid-cols-2 items-start">
        <Field label="Card Number" name="number" type="number" value={number} onChange={setNumber} required min={1} max={999999} step="1" readOnly={numberLocked} help={numberLocked ? 'Fixed: viewers hold this card, and their collections point at its number.' : undefined} />
        <Field label="Name" name="name" value={name} onChange={setName} required />
        <ImageUploadField name="imageUrl" defaultValue={initial.imageUrl} onUrlChange={setImage} />
        <AudioUploadField name="soundUrl" defaultValue={initial.soundUrl} />
        <ImageUploadField name="fullArtImageUrl" defaultValue={initial.fullArtImageUrl} onUrlChange={setFullArt} label="Full Art Image URL (Full Art &amp; Shiny variants)" />
        <div className="flex items-center gap-3 self-center">
          <input type="checkbox" id="card-upgrades" name="upgradesEnabled" checked={upgrades} onChange={e => setUpgrades(e.target.checked)} className="w-4 h-4 accent-yellow-400" />
          <label htmlFor="card-upgrades" className="text-sm text-gray-300">
            Allow variants &amp; upgrades for this card
            {!packUpgrades && <span className="text-gray-600"> (pack has upgrades off)</span>}
          </label>
        </div>
        <div className="space-y-1.5 xl:col-span-2">
          <p className="text-sm text-gray-300">Variants this card can be</p>
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Variants that are on</legend>
            <input type="hidden" name="variant_switches" value="1" />
            <span className="inline-flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/60 px-3 py-1.5 text-sm text-gray-500" title="Regular is always on">
              <input type="checkbox" checked disabled className="accent-yellow-400" aria-label="Regular (always on)" /> Regular
            </span>
            {OPTIONAL_VARIANTS.map(v => (
              <label key={v} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm cursor-pointer transition-colors border-gray-700 hover:border-gray-500 text-gray-200 ${packDisabled.includes(v) ? 'opacity-50' : ''}`} title={packDisabled.includes(v) ? 'Already switched off for the whole pack' : undefined}>
                <input type="checkbox" name={`variant_on_${v}`} checked={!disabled.includes(v)} onChange={e => setDisabled(d => (e.target.checked ? d.filter(x => x !== v) : [...d, v]))} className="accent-yellow-400" />
                {VARIANT_LABELS[v]}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-gray-600">E.g. switch off Full Art and Shiny for a card with no full-art image. Variants already off for the whole pack are dimmed.</p>
        </div>
        <Field label="Stars (1–5)" name="stars" type="number" value={stars} onChange={setStars} required min={1} max={5} step="1" />
        <Field label="Probability" name="probability" type="number" value={probability} onChange={setProbability} required step="any" min={0} />
        <div className="pt-2 xl:col-span-2 flex items-center gap-3">
          <PendingButton type="submit" pendingLabel="Saving…" className="px-5 py-2 tcg-btn rounded-lg text-sm transition-colors">Save Card</PendingButton>
          {blocking > 0 ? <span className="text-xs text-red-300">{blocking} thing{blocking === 1 ? '' : 's'} to fix before this will save</span>
            : problems > 0 && <span className="text-xs text-amber-300">{problems} thing{problems === 1 ? '' : 's'} to look at (you can still save)</span>}
        </div>
        <input type="hidden" name="cardId" value={cardId} />
      </form>

      {/* Live preview + checks */}
      <aside className="space-y-4 xl:sticky xl:top-4">
        <div className="tcg-panel rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2"><Icon name="cards" className="text-yellow-500/90" />Preview</h2>
            <span className="text-[11px] text-gray-500">{packName}</span>
          </div>
          <div className="flex justify-center">
            <div className="relative w-[13.5rem]">
              <div
                className={`tr-art ${variant === 'regular' ? '' : `vfx-${variant}`} ${holoClass(spec, true)}`.trim()}
                style={{ aspectRatio: '600 / 891', ['--art-mask' as string]: thumb && thumb !== art ? `url("${thumb}")` : 'none', borderRadius: 12, ...holoVars(spec) }}
              >
                {art ? <img src={art} alt="" /> : <div className="w-full h-full bg-gray-800 flex items-center justify-center text-gray-600"><Icon name="image" className="w-10 h-10" /></div>}
              </div>
            </div>
          </div>
          <div className="text-center">
            <p className="font-display text-xl font-bold text-white truncate">{name.trim() || 'Untitled card'}</p>
            <p className="text-sm font-semibold" style={{ color: rarity?.hex }}>{'★'.repeat(starsN)} {rarity?.label}</p>
          </div>
          {packUpgrades && upgrades && (
            <div role="group" aria-label="Preview version" className="flex flex-wrap justify-center gap-1.5">
              {VARIANTS.filter(v => allowed.includes(v)).map(v => (
                <button key={v} type="button" onClick={() => setShown(v)} aria-pressed={variant === v} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${variant === v ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:text-white'}`}>{VARIANT_LABELS[v]}</button>
              ))}
            </div>
          )}
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2"><dt className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Pull chance</dt><dd className="text-white font-semibold tabular-nums">{chance > 0 ? `${(chance * 100).toFixed(chance >= 0.1 ? 1 : 2)}%` : '-'}</dd></div>
            <div className="rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-2"><dt className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">One in</dt><dd className="text-white font-semibold tabular-nums">{chance > 0 ? Math.round(1 / chance).toLocaleString() : '-'}</dd></div>
          </dl>
        </div>

        <div className="tcg-panel rounded-xl p-5 space-y-2.5">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            {problems === 0 ? <Icon name="checkCircle" className="text-emerald-400" /> : <Icon name="warning" className="text-amber-400" />}Checks
          </h2>
          {checks.length === 0 ? <p className="text-sm text-gray-500">Everything looks fine.</p> : (
            <ul className="space-y-2">
              {checks.map(c => (
                <li key={c.id} className="flex items-start gap-2.5 text-sm">
                  <Icon name={c.level === 'warn' ? 'warning' : 'info'} className={`w-4 h-4 mt-0.5 shrink-0 ${c.level === 'warn' ? 'text-amber-400' : 'text-sky-300'}`} />
                  <span className="text-gray-300 leading-snug">{c.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function Field({ label, name, type = 'text', required, value, onChange, step, min, max, readOnly, help }: {
  label: string; name: string; type?: string; required?: boolean; value: string; onChange: (v: string) => void; step?: string; min?: number; max?: number; readOnly?: boolean; help?: string;
}) {
  return (
    <div>
      <label htmlFor={`card-${name}`} className="block text-sm text-gray-400 mb-1">{label}{required && <span className="text-red-400 ml-1">*</span>}</label>
      <input id={`card-${name}`} type={type} name={name} required={required} step={step} min={min} max={max} readOnly={readOnly} aria-describedby={help ? `card-${name}-help` : undefined} value={value} onChange={e => onChange(e.target.value)} className={input + (readOnly ? ' opacity-60 cursor-not-allowed' : '')} />
      {help && <p id={`card-${name}-help`} className="text-xs text-gray-500 mt-1">{help}</p>}
    </div>
  );
}
