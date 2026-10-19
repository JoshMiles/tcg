'use client';
import { Icon } from '@/app/components/Icon';
import { useId, useMemo, useState } from 'react';
import { ArmedButton } from '../../components/ArmedButton';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ImageUploadField } from '../../components/image-upload';
import { CardBackEditor } from '../../components/CardBackEditor';
import type { CardBackStyle } from '@/lib/card-back';
import { CardsEditor, cardsSignature, type CardRow } from '../../components/CardsEditor';
import { VariantChips } from '../../components/VariantSwitches';
import { PackPreview } from '../../components/PackPreview';
import { Toggle } from '../../components/Toggle';
import { SaveIndicator, Stepper, worstState } from '../../components/Stepper';
import { useAutosave } from '../../components/use-autosave';
import {
  createDraftPack, saveDraftPack, saveCards, publishPack, discardDraftPack, type PackInput,
} from '../../draft-actions';
import { validatePack, type Issue } from '@/lib/draft-validation';
import { rarityStats } from '@/lib/rarity';
import { DEFAULT_UPGRADE_COSTS, DEFAULT_VARIANT_WEIGHTS } from '@/lib/variants';
import type { Card } from '@/lib/types';

const STEPS = [
  { id: 'details',  label: 'Details' },
  { id: 'look',     label: 'Look & feel' },
  { id: 'upgrades', label: 'Upgrades' },
  { id: 'timing',   label: 'Timing' },
  { id: 'cards',    label: 'Cards' },
  { id: 'back',     label: 'Card back' },
  { id: 'review',   label: 'Review' },
];

const PRESETS = [
  { label: 'Gold',   accent: 'rgb(241,187,6)',  tear: 'rgb(218,163,18)' },
  { label: 'Purple', accent: 'rgb(147,51,234)', tear: 'rgb(109,40,217)' },
  { label: 'Blue',   accent: 'rgb(59,130,246)', tear: 'rgb(37,99,235)'  },
  { label: 'Green',  accent: 'rgb(34,197,94)',  tear: 'rgb(22,163,74)'  },
  { label: 'Red',    accent: 'rgb(239,68,68)',  tear: 'rgb(220,38,38)'  },
  { label: 'Pink',   accent: 'rgb(236,72,153)', tear: 'rgb(219,39,119)' },
];

const NEW_PACK: PackInput = {
  name: '',
  coverImageUrl: '',
  active: true,
  weight: 1,
  accentColor: PRESETS[0].accent,
  tearBorderColor: PRESETS[0].tear,
  holoMinStars: 5,
  cardTime: 3,
  cooldownTime: 1,
  soundVolume: 1,
  upgradesEnabled: false,
  variantWeights: DEFAULT_VARIANT_WEIGHTS,
  upgradeCosts: DEFAULT_UPGRADE_COSTS,
  disabledVariants: [],
};

const inputCls = 'input w-full';

export function PackFlow({ initial, cardBack }: { initial?: { id: string; pack: PackInput; cards: CardRow[] }; /** The draft's saved card back and the other packs to copy one from (only known when resuming a draft). */ cardBack?: { initial: CardBackStyle | null; others: { id: string; name: string }[] } }) {
  const router = useRouter();
  const [draftId, setDraftId] = useState<string | null>(initial?.id ?? null);
  const [pack, setPack] = useState<PackInput>(initial?.pack ?? NEW_PACK);
  const [cards, setCards] = useState<CardRow[]>(initial?.cards ?? []);
  const [step, setStep] = useState('details');
  const [busy, setBusy] = useState<'create' | 'publish' | 'exit' | 'discard' | null>(null);
  const [nameError, setNameError] = useState('');
  const [publishIssues, setPublishIssues] = useState<Issue[]>([]);
  const [goLive, setGoLive] = useState(true); // include in draws as soon as it's published

  const set = <K extends keyof PackInput>(key: K, value: PackInput[K]) => setPack(p => ({ ...p, [key]: value }));

  // ── Autosave (starts once the draft exists) ────────────
  const packSave = useAutosave(pack, async v => { await saveDraftPack(draftId!, v); }, { enabled: !!draftId });
  const cardSave = useAutosave(
    cards,
    async rows => {
      const saved = await saveCards(draftId!, rows.map(({ number: _n, busy: _b, error: _e, ...r }) => r));
      // Adopt the numbers the server assigned (signature ignores them, so this doesn't trigger another save).
      setCards(prev => prev.map(r => {
        const s = saved.find(x => x.id === r.id);
        return s && s.number !== r.number ? { ...r, number: s.number } : r;
      }));
    },
    { enabled: !!draftId, signature: cardsSignature },
  );
  const saveState = worstState(packSave.state, cardSave.state);
  const flushAll = () => Promise.all([packSave.flush(), cardSave.flush()]);

  // ── Validation ─────────────────────────────────────────
  const issues = useMemo(() => validatePack(pack, cards), [pack, cards]);
  const issuesByStep = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of issues) m[i.step] = (m[i.step] ?? 0) + 1;
    return m;
  }, [issues]);

  // ── Navigation ─────────────────────────────────────────
  const stepIdx = STEPS.findIndex(s => s.id === step);

  async function goNext() {
    if (step === 'details' && !pack.name.trim()) { setNameError('Give the pack a name to continue.'); return; }
    if (!draftId) {
      // First step done: this is the moment the draft is created, so nothing typed before is lost from here on.
      setBusy('create');
      try {
        const { id } = await createDraftPack(pack);
        setDraftId(id);
        window.history.replaceState(null, '', `/admin/packs/new?draft=${id}`);
      } catch (e) {
        setNameError(e instanceof Error ? e.message : 'Couldn\'t create the draft.');
        setBusy(null);
        return;
      }
      setBusy(null);
    }
    setStep(STEPS[Math.min(stepIdx + 1, STEPS.length - 1)].id);
  }
  const goBack = () => setStep(STEPS[Math.max(stepIdx - 1, 0)].id);

  async function saveAndExit() {
    setBusy('exit');
    await flushAll();
    router.push('/admin/packs');
  }

  async function publish() {
    if (!draftId) return;
    setBusy('publish');
    setPublishIssues([]);
    await flushAll();
    const res = await publishPack(draftId, goLive);
    if (res.ok) { router.push(`/admin/packs/${draftId}`); return; }
    setPublishIssues(res.issues);
    setBusy(null);
  }

  async function discard() {
    if (!draftId) { router.push('/admin/packs'); return; }
    setBusy('discard');
    await flushAll(); // let a pending autosave land first, or it would fire at the deleted draft and fail
    await discardDraftPack(draftId);
    router.push('/admin/packs');
  }

  const wide = step === 'cards' || step === 'review';

  // The form steps are centred and kept readable; the Cards and Review steps hold a wide editor, so they get more room.
  return (
    <div className={`space-y-6 mx-auto w-full ${wide ? 'max-w-7xl' : 'max-w-5xl'}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">{pack.name.trim() || 'New pack'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pack setup · saved as a draft until you publish</p>
        </div>
        <div className="flex items-center gap-4">
          <SaveIndicator state={saveState} error={packSave.error || cardSave.error} hasDraft={!!draftId} />
          <Link href="/admin/packs" className="text-sm text-gray-500 hover:text-white transition-colors">← Packs</Link>
        </div>
      </div>

      <Stepper
        steps={STEPS}
        current={step}
        onSelect={id => { setStep(id); setPublishIssues([]); }}
        locked={!draftId}
        issuesByStep={issuesByStep}
      />

      <div className={wide ? '' : 'grid lg:grid-cols-[1fr_280px] gap-6 items-start'}>
        <div className="card rounded-2xl p-6 space-y-5">

          {/* ── Details ── */}
          {step === 'details' && (
            <>
              <StepTitle title="Name your pack" hint="You can change all of this later." />
              <fieldset className="fieldset">
                <legend className="fieldset-legend"><label htmlFor="pack-name">Pack name <span className="text-red-400">*</span></label></legend>
                <input
                  id="pack-name"
                  value={pack.name}
                  onChange={e => { set('name', e.target.value); setNameError(''); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void goNext(); } }}
                  placeholder="e.g. Horror Games"
                  autoFocus
                  className={inputCls}
                />
                {nameError && <p className="fieldset-label text-red-400">{nameError}</p>}
              </fieldset>
              <ImageUploadField name="coverImageUrl" defaultValue={pack.coverImageUrl} label="Cover image" onUrlChange={u => set('coverImageUrl', u)} />
            </>
          )}

          {/* ── Look & feel ── */}
          {step === 'look' && (
            <>
              <StepTitle title="Look & feel" hint="Colours used for the pack tear and the glow around cards." />
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setPack(v => ({ ...v, accentColor: p.accent, tearBorderColor: p.tear }))}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all ${
                      pack.accentColor === p.accent ? 'bg-gray-700 text-white ring-1 ring-yellow-500/40' : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full ring-1 ring-white/10" style={{ background: p.accent }} />
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <TextField label="Accent colour" value={pack.accentColor} onChange={v => set('accentColor', v)} hint="Any CSS colour, glow and holo overlay" />
                <TextField label="Tear border colour" value={pack.tearBorderColor} onChange={v => set('tearBorderColor', v)} />
              </div>
              <NumberField label="Holo min stars" value={pack.holoMinStars} min={1} max={5} onChange={v => set('holoMinStars', v)} hint="Cards with at least this many stars get the holographic effect" narrow />
            </>
          )}

          {/* ── Upgrades ── */}
          {step === 'upgrades' && <UpgradesStep pack={pack} set={set} />}

          {/* ── Timing ── */}
          {step === 'timing' && (
            <>
              <StepTitle title="Timing & sound" hint="How the pack opening behaves on stream." />
              <div className="grid grid-cols-2 gap-4">
                <NumberField label="Card display time (s)" value={pack.cardTime} min={1} onChange={v => set('cardTime', v)} hint="How long the card stays on screen" />
                <NumberField label="Cooldown (s)" value={pack.cooldownTime} min={0} onChange={v => set('cooldownTime', v)} hint="Delay between queued draws" />
                <NumberField label="Sound volume" value={pack.soundVolume} min={0} max={1} step={0.1} onChange={v => set('soundVolume', v)} hint="0 = mute, 1 = full" />
                <NumberField label="Draw weight" value={pack.weight} min={0.01} onChange={v => set('weight', v)} hint="Chance relative to other packs in the same season" />
              </div>
            </>
          )}

          {/* ── Cards ── */}
          {step === 'cards' && (
            <>
              <StepTitle title="Add cards" hint="Drop all your card art at once, then fix names, rarity and odds below. Everything saves as you go." />
              <CardsEditor cards={cards} setCards={setCards} upgradesEnabled={pack.upgradesEnabled} packDisabled={pack.disabledVariants ?? []} />
            </>
          )}

          {/* ── Card back (optional) ── */}
          {step === 'back' && (
            <>
              <StepTitle title="Card back" hint="Optional. How the back of an edition looks for this pack. Skip it to keep the classic engraved plate." />
              {draftId
                ? <CardBackEditor key={draftId} packId={draftId} packName={pack.name || 'This pack'} coverImageUrl={pack.coverImageUrl} initial={cardBack?.initial ?? null} sample={{ name: cards[0]?.name || 'Sample card', imageUrl: cards[0]?.imageUrl || pack.coverImageUrl }} others={cardBack?.others ?? []} />
                : <p className="text-sm text-gray-500">Finish the first step so the draft exists, then come back here.</p>}
            </>
          )}

          {/* ── Review ── */}
          {step === 'review' && (
            <ReviewStep
              pack={pack}
              cards={cards}
              issues={issues}
              publishIssues={publishIssues}
              goLive={goLive}
              setGoLive={setGoLive}
              onFix={id => { setStep(id); setPublishIssues([]); }}
            />
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-800">
            <div className="flex items-center gap-1">
              {stepIdx > 0 ? (
                <button type="button" onClick={goBack} className="px-4 py-2 text-sm text-gray-500 hover:text-white transition-colors">← Back</button>
              ) : !draftId && (
                <button type="button" onClick={discard} disabled={!!busy} className="px-4 py-2 text-sm text-gray-500 hover:text-white transition-colors">Cancel</button>
              )}
              {draftId && (
                <ArmedButton onConfirm={discard} disabled={!!busy} armedLabel="Sure? Delete the draft" title="Delete this draft pack and its cards" className="px-3 py-2 text-xs text-red-500/80 hover:text-red-300 transition-colors" armedClassName="px-3 py-2 text-xs font-bold text-red-300 bg-red-500/10 rounded-lg">Discard draft</ArmedButton>
              )}
            </div>
            <div className="flex items-center gap-2">
              {draftId && step !== 'review' && (
                <button type="button" onClick={saveAndExit} disabled={!!busy} className="px-4 py-2.5 text-sm font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors">
                  {busy === 'exit' ? 'Saving…' : 'Save draft & exit'}
                </button>
              )}
              {step !== 'review' ? (
                <button type="button" onClick={goNext} disabled={!!busy} className="px-5 py-2.5 btn btn-primary rounded-xl text-sm transition-colors">
                  {busy === 'create' ? 'Saving…' : step === 'cards' ? 'Review →' : 'Next →'}
                </button>
              ) : (
                <>
                  <button type="button" onClick={saveAndExit} disabled={!!busy} className="px-4 py-2.5 text-sm font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors">
                    {busy === 'exit' ? 'Saving…' : 'Save draft & exit'}
                  </button>
                  <button type="button" onClick={publish} disabled={!!busy || issues.length > 0} className="px-5 py-2.5 btn btn-primary rounded-xl text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    {busy === 'publish' ? 'Publishing…' : 'Publish pack →'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {!wide && <div className="lg:sticky lg:top-6"><PackPreview pack={pack} cardCount={cards.length} /></div>}
      </div>
    </div>
  );
}

// ── Upgrades step ─────────────────────────────────────────

function UpgradesStep({ pack, set }: { pack: PackInput; set: <K extends keyof PackInput>(k: K, v: PackInput[K]) => void }) {
  const w = pack.variantWeights;
  const c = pack.upgradeCosts;
  const off = pack.disabledVariants ?? [];
  const eff = { regular: w.regular, reverse: off.includes('reverse') ? 0 : w.reverse, full: off.includes('full') ? 0 : w.full, shiny: off.includes('shiny') ? 0 : w.shiny, golden: off.includes('golden') ? 0 : w.golden };
  const total = eff.regular + eff.reverse + eff.full + eff.shiny + eff.golden;
  const pct = (n: number) => (total > 0 ? ((n / total) * 100).toFixed(n / total < 0.1 ? 1 : 0) : '0');
  const setW = (k: keyof typeof w, v: number) => set('variantWeights', { ...w, [k]: v });
  const setC = (k: keyof typeof c, v: number) => set('upgradeCosts', { ...c, [k]: v });
  const reverseCost = c.reverse;
  const fullCost = c.reverse * c.full;
  const shinyCost = c.reverse * c.full * c.shiny;
  const goldenCost = shinyCost * c.golden;

  return (
    <>
      <StepTitle title="Variants & upgrades" hint="Let cards roll as rarer variants, and let viewers upgrade their duplicates." />
      <Toggle
        checked={pack.upgradesEnabled}
        onChange={v => set('upgradesEnabled', v)}
        label="Enable variants & upgrades for this pack"
        hint="Off keeps this pack single-version, like Season 1."
      />

      <div className={pack.upgradesEnabled ? 'space-y-6' : 'space-y-6 opacity-40 pointer-events-none select-none'} aria-disabled={!pack.upgradesEnabled}>
        <div>
          <p className="text-sm font-medium text-gray-300 mb-2">Variants in this pack</p>
          <p className="text-xs text-gray-500 mb-3">Switch a variant off to leave it out entirely: it is never rolled and upgrades skip it. You can also switch variants off per card in the Cards step.</p>
          <VariantChips disabled={off} onChange={v => set('disabledVariants', v)} />
        </div>

        <div>
          <p className="text-sm font-medium text-gray-300 mb-2">Chance of each variant</p>
          <p className="text-xs text-gray-500 mb-3">
            After a card is picked, its variant is rolled using these weights. Relative numbers. Only the proportions matter.
          </p>
          <div className="grid grid-cols-5 gap-3">
            <VariantWeight label="Regular" value={w.regular} percent={pct(w.regular)} onChange={v => setW('regular', v)} />
            <VariantWeight label="Reverse Holo" value={w.reverse} percent={pct(eff.reverse)} onChange={v => setW('reverse', v)} />
            <VariantWeight label="Full Art" value={w.full} percent={pct(eff.full)} onChange={v => setW('full', v)} />
            <VariantWeight label="Full Art Holo" value={w.shiny} percent={pct(eff.shiny)} onChange={v => setW('shiny', v)} />
            <VariantWeight label="Golden" value={w.golden} percent={pct(eff.golden)} onChange={v => setW('golden', v)} />
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-300 mb-2">Upgrade cost</p>
          <p className="text-xs text-gray-500 mb-3">How many duplicates of one card (same variant) are spent to make one of the next variant.</p>
          <div className="grid grid-cols-4 gap-3">
            <NumberField label="Regular → Reverse" value={c.reverse} min={1} onChange={v => setC('reverse', v)} />
            <NumberField label="Reverse → Full Art" value={c.full} min={1} onChange={v => setC('full', v)} />
            <NumberField label="Full Art → Full Art Holo" value={c.shiny} min={1} onChange={v => setC('shiny', v)} />
            <NumberField label="Full Art Holo → Golden" value={c.golden} min={1} onChange={v => setC('golden', v)} />
          </div>
          <p className="text-xs text-gray-500 mt-3 leading-relaxed">
            From Regular prints alone that is <strong className="text-gray-300">{reverseCost}</strong> for a Reverse Holo,{' '}
            <strong className="text-gray-300">{fullCost}</strong> for a Full Art,{' '}
            <strong className="text-gray-300">{shinyCost}</strong> for a Full Art Holo and{' '}
            <strong className="text-gray-300">{goldenCost}</strong> for a Golden.
          </p>
        </div>
      </div>
    </>
  );
}

function VariantWeight({ label, value, percent, onChange }: { label: string; value: number; percent: string; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend"><label htmlFor={id}>{label}</label></legend>
      <input id={id} type="number" min="0" step="any" value={value} onChange={e => onChange(Number(e.target.value))} className={inputCls + ' px-3!'} />
      <p className="fieldset-label tabular-nums">≈ {percent}% of pulls</p>
    </fieldset>
  );
}

// ── Review step ───────────────────────────────────────────

function ReviewStep({
  pack, cards, issues, publishIssues, goLive, setGoLive, onFix,
}: {
  pack: PackInput; cards: CardRow[]; issues: Issue[]; publishIssues: Issue[];
  goLive: boolean; setGoLive: (v: boolean) => void; onFix: (step: string) => void;
}) {
  const mix = rarityStats(cards as unknown as Card[]);
  const shown = issues.length > 0 ? issues : publishIssues;
  const label = (id: string) => STEPS.find(s => s.id === id)?.label ?? id;
  return (
    <>
      <StepTitle title="Review & publish" hint="Drafts are never drawn on stream. Publish when you're happy." />

      {shown.length > 0 ? (
        <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 space-y-2">
          <p className="text-sm font-semibold text-red-300">A few things to fix before publishing</p>
          <ul className="space-y-1.5">
            {shown.map((i, n) => (
              <li key={n} className="flex items-center justify-between gap-3 text-sm text-gray-300">
                <span>{i.message}</span>
                <button type="button" onClick={() => onFix(i.step)} className="shrink-0 text-xs font-bold text-yellow-400 hover:text-yellow-300">Fix in {label(i.step)} →</button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-xl border border-green-500/30 bg-green-950/20 p-4 text-sm text-green-300"><Icon name="check" className="mr-1" />Everything looks good. This pack is ready to publish.</p>
      )}

      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <Summary label="Name" value={pack.name || '-'} />
        <Summary label="Cards" value={String(cards.length)} />
        <Summary label="Rarity mix" value={mix.length ? mix.map(r => `${r.count}× ${'★'.repeat(r.stars)}`).join('  ') : '-'} />
        <Summary label="Draw weight" value={`${pack.weight}×`} />
        <Summary label="Card time / cooldown" value={`${pack.cardTime}s / ${pack.cooldownTime}s`} />
        <Summary
          label="Variants & upgrades"
          value={pack.upgradesEnabled
            ? `On, costs ${pack.upgradeCosts.reverse} / ${pack.upgradeCosts.full} / ${pack.upgradeCosts.shiny} / ${pack.upgradeCosts.golden}`
            : 'Off'}
        />
      </dl>

      <Toggle
        checked={goLive}
        onChange={setGoLive}
        label="Include in draws as soon as it's published"
        hint="It still only appears on stream once it's attached to the active season."
      />
    </>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-gray-200 font-medium">{value}</dd>
    </div>
  );
}

// ── Small shared bits ─────────────────────────────────────

function StepTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {hint && <p className="text-sm text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function TextField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const id = useId();
  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend"><label htmlFor={id}>{label}</label></legend>
      <input id={id} value={value} onChange={e => onChange(e.target.value)} className={inputCls} />
      {hint && <p className="fieldset-label">{hint}</p>}
    </fieldset>
  );
}

function NumberField({
  label, value, onChange, min, max, step, hint, narrow,
}: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; hint?: string; narrow?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend"><label htmlFor={id}>{label}</label></legend>
      <input
        id={id}
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step ?? 'any'}
        onChange={e => onChange(Number(e.target.value))}
        className={inputCls + (narrow ? ' w-32!' : '')}
      />
      {hint && <p className="fieldset-label">{hint}</p>}
    </fieldset>
  );
}
