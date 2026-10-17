'use client';
import { useState, useTransition } from 'react';
import { FlipCard } from '@/app/components/FlipCard';
import { ImageUploadField } from './image-upload';
import { saveCardBackAction, resetCardBackAction, loadCardBackAction } from '../card-back-actions';
import {
  ALIGNS, BACKGROUNDS, DEFAULT_V1, ELEMENTS, ELEMENT_LABELS, FONTS, LOGOS, MAX_LINE, PATTERNS, PRESETS_V1, SIZES,
  sanitizeV1, type BackElement, type CardBackV1,
} from '@/lib/card-back-v1';
import { resolveCardBack, toV1, upgradeCardBack, type CardBackStyle } from '@/lib/card-back';

/**
 * The "Card back" section of a pack: controls on the left, a live flipped print of the pack on the right. Self-contained (its own
 * props and server actions, no assumption about the page around it) so the pack workspace can host it unchanged.
 */
export interface CardBackEditorProps {
  packId: string;
  packName: string;
  /** Season name for the `{season}` token in the preview (any season the pack is in). */
  seasonName?: string;
  coverImageUrl?: string;
  /** The stored design; null = the classic look. */
  initial: CardBackStyle | null;
  /** A card of this pack for the sample print. */
  sample: { name: string; imageUrl: string; hex?: string };
  /** Other packs to copy a design from. */
  others: { id: string; name: string }[];
  /** `stacked` puts the preview above the controls (for a narrow panel); `wide` puts it beside them. */
  layout?: 'wide' | 'stacked';
}

const LABELS = { steel: 'Brushed steel', solid: 'One colour', gradient: 'Gradient', none: 'None', lines: 'Brushed lines', holes: 'Cheese holes', cover: 'Pack cover, faded', display: 'Display', body: 'Body', mono: 'Monospace', top: 'Top', middle: 'Middle', bottom: 'Bottom', url: 'Uploaded image' } as const;
const field = 'bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:border-yellow-500';
const lbl = 'block text-xs text-gray-400 mb-1';

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1">
      {options.map(o => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)}
          className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors ${value === o ? 'bg-yellow-500/15 border-yellow-500/50 text-yellow-300' : 'bg-gray-800 border-gray-700 text-gray-300 hover:text-white'}`}>
          {(LABELS as Record<string, string>)[o] ?? o}
        </button>
      ))}
    </div>
  );
}

function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-gray-300">
      <input type="color" aria-label={label} value={value} onChange={e => onChange(e.target.value)} className="w-8 h-8 rounded bg-transparent border border-gray-700 p-0.5" />
      {label}
    </label>
  );
}

export function CardBackEditor({ packId, packName, seasonName, coverImageUrl, initial, sample, others, layout = 'wide' }: CardBackEditorProps) {
  // The controls edit the 20.1 view of the design (until the visual editor of 20.3b); it is upgraded to elements to preview and to save.
  const start1 = initial ? toV1(initial) : sanitizeV1(DEFAULT_V1);
  const [style, setStyle] = useState<CardBackV1>(start1);
  const [saved, setSaved] = useState<string>(JSON.stringify(start1));
  const [note, setNote] = useState('');
  const [from, setFrom] = useState('');
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(style) !== saved;
  const set = (patch: Partial<CardBackV1>) => { setStyle(s => sanitizeV1({ ...s, ...patch })); setNote(''); };
  const setEl = (e: BackElement, patch: { show?: boolean; size?: (typeof SIZES)[number] }) =>
    set({ show: { ...style.show, ...(patch.show !== undefined ? { [e]: patch.show } : {}) }, size: { ...style.size, ...(patch.size ? { [e]: patch.size } : {}) } });

  const run = (fn: () => Promise<CardBackStyle>, done: string) => start(async () => {
    try {
      const next = toV1(await fn());
      setStyle(next); setSaved(JSON.stringify(next));
      setNote(done);
    } catch (err) { setNote(err instanceof Error ? err.message : 'That did not work'); }
  });

  const live = resolveCardBack(upgradeCardBack(sanitizeV1(style)), { packName, seasonName, cover: coverImageUrl });
  const hex = sample.hex ?? '#facc15';

  return (
    <div id="card-back" className="tcg-panel rounded-2xl overflow-hidden scroll-mt-20">
      <div className="px-5 py-4 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-white">Card back</h3>
        <p className="text-xs text-gray-500 mt-0.5">How the back of a print looks for cards from this pack. Until you save a design, it keeps the classic engraved plate.</p>
      </div>
      <div className={`p-5 grid gap-6 items-start ${layout === 'wide' ? 'lg:grid-cols-[1fr_240px]' : ''}`}>
        <div className={`space-y-5 min-w-0 order-2 ${layout === 'wide' ? 'lg:order-1' : ''}`}>
          <div role="group" aria-label="Presets" className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-400 mr-1">Start from</span>
            {PRESETS_V1.map(p => <button key={p.id} type="button" onClick={() => set(p.style)} className="px-2.5 py-1 text-xs font-bold rounded-lg border bg-gray-800 border-gray-700 text-gray-300 hover:text-white">{p.label}</button>)}
          </div>

          <fieldset className="space-y-2"><legend className={lbl}>Background</legend>
            <Seg label="Background" value={style.background} options={BACKGROUNDS} onChange={background => set({ background })} />
            {style.background !== 'steel' && (
              <div className="flex flex-wrap items-center gap-4">
                <Swatch label={style.background === 'gradient' ? 'From' : 'Colour'} value={style.bg1} onChange={bg1 => set({ bg1 })} />
                {style.background === 'gradient' && <>
                  <Swatch label="To" value={style.bg2} onChange={bg2 => set({ bg2 })} />
                  <label className="text-xs text-gray-300 flex items-center gap-2">Angle
                    <input type="range" min={0} max={360} step={5} value={style.angle} onChange={e => set({ angle: Number(e.target.value) })} aria-label="Gradient angle" />
                    <span className="tabular-nums w-9">{style.angle}°</span>
                  </label>
                </>}
              </div>
            )}
          </fieldset>
          <fieldset className="space-y-2"><legend className={lbl}>Pattern</legend>
            <Seg label="Pattern" value={style.pattern} options={PATTERNS} onChange={pattern => set({ pattern })} />
            {style.pattern === 'cover' && !coverImageUrl && <p className="text-xs text-amber-300">This pack has no cover image yet, so there is nothing to show.</p>}
          </fieldset>

          <fieldset className="space-y-2"><legend className={lbl}>Colours</legend>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="inline-flex items-center gap-2 text-xs text-gray-300">Edge
                <Seg label="Edge" value={style.edge === 'rarity' ? 'rarity' : 'fixed'} options={['rarity', 'fixed'] as const} onChange={v => set({ edge: v === 'rarity' ? 'rarity' : '#facc15' })} />
                {style.edge !== 'rarity' && <input type="color" aria-label="Edge colour" value={style.edge} onChange={e => set({ edge: e.target.value })} className="w-8 h-8 rounded bg-transparent border border-gray-700 p-0.5" />}
              </span>
              <span className="inline-flex items-center gap-2 text-xs text-gray-300">Text
                <Seg label="Text" value={style.text === 'auto' ? 'auto' : 'fixed'} options={['auto', 'fixed'] as const} onChange={v => set({ text: v === 'auto' ? 'auto' : '#f3f4f6' })} />
                {style.text !== 'auto' && <input type="color" aria-label="Text colour" value={style.text} onChange={e => set({ text: e.target.value })} className="w-8 h-8 rounded bg-transparent border border-gray-700 p-0.5" />}
              </span>
              <span className="inline-flex items-center gap-2 text-xs text-gray-300">Accent
                <Seg label="Accent" value={style.accent === 'auto' ? 'auto' : 'fixed'} options={['auto', 'fixed'] as const} onChange={v => set({ accent: v === 'auto' ? 'auto' : '#fbbf24' })} />
                {style.accent !== 'auto' && <input type="color" aria-label="Accent colour" value={style.accent} onChange={e => set({ accent: e.target.value })} className="w-8 h-8 rounded bg-transparent border border-gray-700 p-0.5" />}
              </span>
            </div>
          </fieldset>

          <div className="grid sm:grid-cols-2 gap-4">
            <fieldset><legend className={lbl}>Number font</legend><Seg label="Number font" value={style.font} options={FONTS} onChange={font => set({ font })} /></fieldset>
            <fieldset><legend className={lbl}>Position</legend><Seg label="Position" value={style.align} options={ALIGNS} onChange={align => set({ align })} /></fieldset>
          </div>

          <fieldset className="space-y-2"><legend className={lbl}>Logo</legend>
            <div className="flex flex-wrap items-center gap-3">
              <Seg label="Logo" value={style.logo} options={LOGOS} onChange={logo => set({ logo })} />
              {style.logo !== 'none' && <Seg label="Logo size" value={style.logoSize} options={SIZES} onChange={logoSize => set({ logoSize })} />}
            </div>
            {style.logo === 'cover' && !coverImageUrl && <p className="text-xs text-amber-300">This pack has no cover image yet.</p>}
            {style.logo === 'url' && <ImageUploadField name="cardBackLogo" label="Logo image" defaultValue={style.logoUrl} onUrlChange={logoUrl => set({ logoUrl, logo: 'url' })} />}
          </fieldset>

          <div>
            <label className={lbl} htmlFor={`cb-line-${packId}`}>Custom line <span className="text-gray-600">use {'{pack}'} and {'{season}'}; {style.line.length}/{MAX_LINE}</span></label>
            <input id={`cb-line-${packId}`} className={`${field} w-full`} maxLength={MAX_LINE} value={style.line} onChange={e => setStyle(s => ({ ...s, line: e.target.value.slice(0, MAX_LINE) }))} onBlur={() => set({})} placeholder="From the {pack} pack" />
          </div>

          <fieldset className="space-y-1.5"><legend className={lbl}>What is printed</legend>
            {ELEMENTS.map(e => (
              <div key={e} className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-200">
                  <input type="checkbox" checked={style.show[e]} onChange={ev => setEl(e, { show: ev.target.checked })} className="accent-yellow-500" />{ELEMENT_LABELS[e]}
                </label>
                <Seg label={`${ELEMENT_LABELS[e]} size`} value={style.size[e]} options={SIZES} onChange={size => setEl(e, { size })} />
              </div>
            ))}
          </fieldset>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="button" disabled={pending || !dirty} onClick={() => run(() => saveCardBackAction(packId, style), 'Saved')} className="px-4 py-2 tcg-btn rounded-xl text-sm disabled:opacity-50">{pending ? 'Working…' : 'Save card back'}</button>
            <button type="button" disabled={pending} onClick={() => run(() => resetCardBackAction(packId), 'Back to the classic look')} className="px-3 py-2 text-sm font-bold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-xl">Reset to default</button>
            {others.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <select aria-label="Copy from another pack" value={from} onChange={e => setFrom(e.target.value)} className={field}>
                  <option value="">Copy from another pack…</option>
                  {others.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <button type="button" disabled={pending || !from} onClick={() => start(async () => { try { setStyle(toV1(await loadCardBackAction(from))); setNote('Copied. Press Save to keep it.'); } catch { setNote('That did not work'); } })} className="px-3 py-2 text-sm font-bold text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-xl disabled:opacity-50">Copy</button>
              </span>
            )}
            <span role="status" className="text-xs text-gray-400">{note || (dirty ? 'Unsaved changes' : '')}</span>
          </div>
        </div>

        <div className={`order-1 mx-auto w-full max-w-[220px] ${layout === 'wide' ? 'lg:order-2 lg:sticky lg:top-20' : ''}`}>
          <FlipCard
            key={`${style.pattern}-${style.logo}`}
            defaultFlipped
            back={{
              n: 7, uid: 1023381, total: 12, variantLabel: 'Regular', name: sample.name, date: '12 OCT 2026', origin: 'Pulled live on stream', holder: '@viewer', hex,
              history: [{ text: 'Pulled by @viewer', date: '12 OCT 2026' }, { text: 'Traded to @friend', date: '14 OCT 2026' }],
              qrUrl: 'https://example.com/', style: live,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sample.imageUrl} alt={sample.name} className="w-full h-full object-cover rounded-xl border-2" style={{ borderColor: hex }} />
          </FlipCard>
        </div>
      </div>
    </div>
  );
}
