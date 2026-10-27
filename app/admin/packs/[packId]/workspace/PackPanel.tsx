'use client';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { ConfirmButton } from '../../../components/ConfirmButton';
import { VariantChips } from '../../../components/VariantSwitches';
import { deletePackAction } from '../../../actions/packs';
import type { PackInput } from '@/lib/pack-clean';
import { VARIANT_LABELS } from '@/lib/variants';
import { ArtDrop, Field, NumberInput, Section, inputCls } from './fields';

export interface SeasonUse { id: string; name: string; active: boolean; /** Share of draws this pack gets in that season, when it is drawn there. */ share: number | null }

/** The Pack settings view: the pack's settings, the overlay look, seasons and the danger zone. */
export function PackPanel({ packId, pack, base, onChange, seasons, overrideCount, readOnlyStatus }: {
  packId: string;
  pack: PackInput;
  base: PackInput;
  onChange: (patch: Partial<PackInput>, key?: string) => void;
  seasons: SeasonUse[];
  overrideCount: number;
  readOnlyStatus: 'draft' | 'published';
}) {
  const changed = (...k: (keyof PackInput)[]) => (k.some(x => JSON.stringify(pack[x]) !== JSON.stringify(base[x])) ? 'changed' as const : null);
  const w = pack.variantWeights;
  const wTotal = w.regular + w.reverse + w.full + w.shiny + w.golden;
  const pct = (n: number) => (wTotal > 0 ? `${((n / wTotal) * 100).toFixed(n / wTotal >= 0.1 ? 0 : 1)}%` : '-');

  return (
    <div>
      <Section title="Details" dot={!pack.name.trim() ? 'problem' : changed('name', 'coverImageUrl', 'accentColor', 'tearBorderColor', 'weight', 'price', 'active')}>
        <Field label="Pack name" htmlFor="pw-name"><input id="pw-name" className={inputCls} value={pack.name} maxLength={80} onChange={e => onChange({ name: e.target.value }, 'name')} /></Field>
        <ArtDrop label="Cover image" value={pack.coverImageUrl} onChange={u => onChange({ coverImageUrl: u })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Accent colour" htmlFor="pw-accent"><input id="pw-accent" className={inputCls} value={pack.accentColor} onChange={e => onChange({ accentColor: e.target.value }, 'accent')} /></Field>
          <Field label="Tear colour" htmlFor="pw-tear"><input id="pw-tear" className={inputCls} value={pack.tearBorderColor} onChange={e => onChange({ tearBorderColor: e.target.value }, 'tear')} /></Field>
        </div>
        <Field label="Draw weight" htmlFor="pw-weight" help="Relative chance this pack is the one drawn.">
          <NumberInput id="pw-weight" value={pack.weight} min={0.01} onChange={n => onChange({ weight: n }, 'weight')} />
        </Field>
        <Field label="Price per paid pull" htmlFor="pw-price" help="A whole number from 1, in the Mix It Up currency. Empty = no price of its own (a role price or the base price applies). Used when a viewer asks for this pack by name with !pack.">
          <input id="pw-price" className={inputCls} type="number" min={1} step={1} placeholder="Base price" value={pack.price ? String(pack.price) : ''}
            onChange={e => { const n = Math.floor(Number(e.target.value)); onChange({ price: e.target.value.trim() !== '' && Number.isFinite(n) && n >= 1 ? n : 0 }, 'price'); }} />
        </Field>
        {seasons.some(s => s.share !== null) && (
          <ul className="text-xs text-gray-400 space-y-0.5">{seasons.filter(s => s.share !== null).map(s => <li key={s.id}>{s.name}: <strong className="text-gray-200">{Math.round((s.share ?? 0) * 100)}%</strong> of draws</li>)}</ul>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-200">
          <input type="checkbox" role="switch" checked={pack.active} onChange={e => onChange({ active: e.target.checked })} className="toggle toggle-sm toggle-primary" />
          {readOnlyStatus === 'draft' ? "Include in draws as soon as it's published" : 'Pack is active (included in draws)'}
        </label>
      </Section>

      <Section title="Versions and odds" dot={changed('upgradesEnabled', 'disabledVariants', 'variantWeights', 'upgradeCosts', 'holoMinStars')}>
        <label className="flex items-center gap-2 text-sm text-gray-200"><input type="checkbox" role="switch" checked={pack.upgradesEnabled} onChange={e => onChange({ upgradesEnabled: e.target.checked })} className="toggle toggle-sm toggle-primary" />Enable versions and upgrades</label>
        <div><p className="text-xs text-gray-400 mb-1">Versions in this pack</p>
          <VariantChips disabled={pack.disabledVariants ?? []} onChange={d => onChange({ disabledVariants: d })} compact />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(['regular', 'reverse', 'full', 'shiny', 'golden'] as const).map(v => (
            <Field key={v} label={`${VARIANT_LABELS[v]} weight`} htmlFor={`pw-w-${v}`} help={`${pct(w[v])} of pulls`}>
              <NumberInput id={`pw-w-${v}`} value={w[v]} min={0} onChange={n => onChange({ variantWeights: { ...w, [v]: n } }, `w-${v}`)} />
            </Field>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {([['reverse', 'To Reverse'], ['full', 'To Full Art'], ['shiny', 'To Full Art Holo'], ['golden', 'To Golden']] as const).map(([k, label]) => (
            <Field key={k} label={`${label} (copies)`} htmlFor={`pw-c-${k}`}>
              <NumberInput id={`pw-c-${k}`} value={pack.upgradeCosts[k]} min={1} step={1} onChange={n => onChange({ upgradeCosts: { ...pack.upgradeCosts, [k]: n } }, `c-${k}`)} />
            </Field>
          ))}
        </div>
        <Field label="Holo from (stars)" htmlFor="pw-holo"><NumberInput id="pw-holo" value={pack.holoMinStars} min={1} max={5} step={1} onChange={n => onChange({ holoMinStars: n })} /></Field>
      </Section>

      <Section title="Timing and sound" dot={changed('cardTime', 'cooldownTime', 'soundVolume')}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Card time (s)" htmlFor="pw-ct"><NumberInput id="pw-ct" value={pack.cardTime} min={1} onChange={n => onChange({ cardTime: n }, 'ct')} /></Field>
          <Field label="Cooldown (s)" htmlFor="pw-cd"><NumberInput id="pw-cd" value={pack.cooldownTime} min={0} onChange={n => onChange({ cooldownTime: n }, 'cd')} /></Field>
          <Field label="Volume (0-1)" htmlFor="pw-vol"><NumberInput id="pw-vol" value={pack.soundVolume} min={0} max={1} onChange={n => onChange({ soundVolume: n }, 'vol')} /></Field>
        </div>
      </Section>

      <Section title="Overlay look" defaultOpen={false}>
        <p className="text-sm text-gray-300">{overrideCount > 0 ? `${overrideCount} overlay setting${overrideCount === 1 ? '' : 's'} differ for this pack.` : 'This pack uses the overlay\'s shared look.'}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/overlay?scope=${packId}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-gray-700 text-gray-200 hover:border-yellow-500/60 hover:text-yellow-300"><Icon name="palette" />Open the Overlay Editor</Link>
          <Link href={`/admin/overlay?pack=${packId}&group=variants`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-gray-700 text-gray-200 hover:border-yellow-500/60 hover:text-yellow-300"><Icon name="sparkles" />Variant styles</Link>
        </div>
      </Section>

      <Section title="Seasons" defaultOpen={false}>
        {seasons.length > 0 ? (
          <ul className="space-y-1.5">{seasons.map(s => (
            <li key={s.id}><Link href={`/admin/seasons/${s.id}`} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-white/3 hover:bg-white/[0.07] text-sm text-gray-200"><span className="truncate">{s.name}</span>{s.active && <span className="text-[10px] font-extrabold uppercase tracking-wider text-yellow-300">Active season</span>}</Link></li>
          ))}</ul>
        ) : <p className="text-sm text-amber-300">Not in a season yet. <Link href="/admin/seasons" className="underline hover:text-amber-100">Add it to a season</Link></p>}
      </Section>

      <Section title="Danger zone" defaultOpen={false}>
        <p className="text-xs text-gray-500">Deleting removes the pack and its cards and takes it out of every season. Viewers keep any entries they already pulled in their data.</p>
        <form action={deletePackAction.bind(null, packId)}>
          <ConfirmButton title="Delete pack?" confirmLabel="Delete pack"
            message={<>Delete <strong className="text-white">{pack.name || 'this pack'}</strong>? Its cards are deleted and it is removed from every season.{seasons.length > 0 && <> It is used in <strong className="text-white">{seasons.map(s => s.name).join(', ')}</strong>: viewers who pulled its cards keep them in their data, but they stop showing anywhere and scores change.</>} This can&apos;t be undone.</>}
            className="px-3.5 py-2 text-sm font-bold text-red-400 hover:text-red-200 hover:bg-red-950/50 border border-red-500/30 rounded-xl transition-colors">
            Delete this pack
          </ConfirmButton>
        </form>
      </Section>
    </div>
  );
}
