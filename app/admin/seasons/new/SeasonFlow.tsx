'use client';
import { Icon } from '@/app/components/Icon';
import { useMemo, useState } from 'react';
import { ArmedButton } from '../../components/ArmedButton';
import { DateTimeField } from '../../components/DateTimeField';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SaveIndicator, Stepper } from '../../components/Stepper';
import { BrandMark } from '../../components/BrandMark';
import { NewPackButton } from '../../components/NewPackButton';
import { useAutosave } from '../../components/use-autosave';
import { createDraftSeason, saveDraftSeason, publishSeason, discardDraftSeason, type SeasonInput } from '../../draft-actions';
import { suggestCollectionName, validateSeason, type Issue } from '@/lib/draft-validation';

export interface PackOption {
  id: string;
  name: string;
  coverImageUrl: string;
  status: 'draft' | 'published';
  active: boolean;
  cardCount: number;
  weight: number;
  upgradesEnabled: boolean;
}

const STEPS = [
  { id: 'details', label: 'Details' },
  { id: 'packs',   label: 'Packs' },
  { id: 'review',  label: 'Review' },
];

const inputCls = 'input w-full';

export function SeasonFlow({
  packs, otherCollections, initial,
}: {
  packs: PackOption[];
  /** Collection names used by other seasons (a clash would merge two seasons' viewer collections). */
  otherCollections: string[];
  initial?: { id: string; season: SeasonInput };
}) {
  const router = useRouter();
  const [draftId, setDraftId] = useState<string | null>(initial?.id ?? null);
  const [season, setSeason] = useState<SeasonInput>(initial?.season ?? { name: '', collectionName: '', maxConcurrentPacks: 1, packIds: [] });
  // The collection name follows the season name until the admin edits it themselves.
  const [keyTouched, setKeyTouched] = useState(!!initial?.season.collectionName);
  const [step, setStep] = useState('details');
  const [busy, setBusy] = useState<'create' | 'publish' | 'exit' | 'discard' | null>(null);
  const [nameError, setNameError] = useState('');
  // The box holds what is typed (it may be empty on the way to a new number); the season gets a whole number of at least 1.
  const [maxText, setMaxText] = useState(String(initial?.season.maxConcurrentPacks ?? 1));
  const [publishIssues, setPublishIssues] = useState<Issue[]>([]);

  const set = <K extends keyof SeasonInput>(key: K, value: SeasonInput[K]) => setSeason(s => ({ ...s, [key]: value }));
  const setName = (name: string) => {
    setSeason(s => ({ ...s, name, ...(keyTouched ? {} : { collectionName: suggestCollectionName(name) }) }));
    setNameError('');
  };

  const save = useAutosave(season, async v => { await saveDraftSeason(draftId!, v); }, { enabled: !!draftId });

  const issues = useMemo(() => validateSeason(season, otherCollections), [season, otherCollections]);
  const issuesByStep = useMemo(() => {
    const m: Record<string, number> = {};
    for (const i of issues) m[i.step] = (m[i.step] ?? 0) + 1;
    return m;
  }, [issues]);

  const selected = season.packIds.map(id => packs.find(p => p.id === id)).filter((p): p is PackOption => !!p);
  const drawable = selected.filter(p => p.status === 'published' && p.active);
  const stepIdx = STEPS.findIndex(s => s.id === step);

  async function goNext() {
    if (step === 'details' && !season.name.trim()) { setNameError('Give the season a name to continue.'); return; }
    if (!draftId) {
      setBusy('create');
      try {
        const { id } = await createDraftSeason(season);
        setDraftId(id);
        window.history.replaceState(null, '', `/admin/seasons/new?draft=${id}`);
      } catch (e) {
        setNameError(e instanceof Error ? e.message : 'Couldn\'t create the draft.');
        setBusy(null);
        return;
      }
      setBusy(null);
    }
    setStep(STEPS[Math.min(stepIdx + 1, STEPS.length - 1)].id);
  }

  async function saveAndExit() {
    setBusy('exit');
    await save.flush();
    router.push('/admin/seasons');
  }

  async function publish(activate: boolean) {
    if (!draftId) return;
    setBusy('publish');
    setPublishIssues([]);
    await save.flush();
    const res = await publishSeason(draftId, activate);
    if (res.ok) { router.push(`/admin/seasons/${draftId}`); return; }
    setPublishIssues(res.issues);
    setBusy(null);
  }

  async function discard() {
    if (!draftId) { router.push('/admin/seasons'); return; }
    setBusy('discard');
    await save.flush(); // let a pending autosave land first, or it would fire at the deleted draft and fail
    await discardDraftSeason(draftId);
    router.push('/admin/seasons');
  }

  const togglePack = (id: string) =>
    set('packIds', season.packIds.includes(id) ? season.packIds.filter(p => p !== id) : [...season.packIds, id]);

  const label = (id: string) => STEPS.find(s => s.id === id)?.label ?? id;
  const shown = issues.length > 0 ? issues : publishIssues;

  return (
    <div className="space-y-6 mx-auto w-full max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white wrap-break-word min-w-0">{season.name.trim() || 'New season'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">Season setup · saved as a draft until you create it</p>
        </div>
        <div className="flex items-center gap-4">
          <SaveIndicator state={save.state} error={save.error} hasDraft={!!draftId} />
          <Link href="/admin/seasons" className="text-sm text-gray-500 hover:text-white transition-colors">← Seasons</Link>
        </div>
      </div>

      <Stepper steps={STEPS} current={step} onSelect={id => { setStep(id); setPublishIssues([]); }} locked={!draftId} issuesByStep={issuesByStep} />

      <div className="card rounded-2xl p-6 space-y-5">

        {/* ── Details ── */}
        {step === 'details' && (
          <>
            <StepTitle title="Season details" hint="You can change these later, except that the collection name should stay fixed once viewers have cards." />
            <fieldset className="fieldset">
              <legend className="fieldset-legend"><label htmlFor="season-name">Season name <span className="text-red-400">*</span></label></legend>
              <input
                id="season-name"
                value={season.name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void goNext(); } }}
                placeholder="e.g. Season 2"
                autoFocus
                className={inputCls}
              />
              {nameError && <p className="fieldset-label text-red-400">{nameError}</p>}
            </fieldset>
            <fieldset className="fieldset">
              <legend className="fieldset-legend"><label htmlFor="season-collection">Collection name</label></legend>
              <input
                id="season-collection"
                value={season.collectionName}
                onChange={e => { setKeyTouched(true); set('collectionName', e.target.value.replace(/\s+/g, '')); }}
                placeholder="e.g. Season2Deck"
                className={inputCls}
              />
              <p className="fieldset-label">Storage key for viewers&apos; cards. No spaces, and unique per season. Suggested from the name.</p>
              {season.collectionName && otherCollections.some(n => n.toLowerCase() === season.collectionName.toLowerCase()) && (
                <p className="fieldset-label text-red-400">Another season already uses this. Its viewers&apos; cards would be shared.</p>
              )}
            </fieldset>
            <fieldset className="fieldset">
              <legend className="fieldset-legend"><label htmlFor="season-max">Max concurrent packs</label></legend>
              <input
                id="season-max"
                type="number"
                min={1}
                step={1}
                value={maxText}
                onChange={e => { setMaxText(e.target.value); const n = Math.floor(Number(e.target.value)); if (Number.isFinite(n) && n >= 1) set('maxConcurrentPacks', n); }}
                onBlur={() => setMaxText(String(season.maxConcurrentPacks))}
                className={inputCls + ' w-28!'}
              />
              <p className="fieldset-label">Pack openings shown at once on the overlay</p>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <DateTimeField label="Starts (optional)" defaultValue={season.startsAt} onChange={ms => set('startsAt', ms)} help="Shown on the Seasons page; with the switch below it also turns the season on by itself." />
              <DateTimeField label="Ends (optional)" defaultValue={season.endsAt} onChange={ms => set('endsAt', ms)} help="At this time an active season is wrapped up: final standings, awards, trading closed." />
            </div>
            {season.startsAt !== undefined && (
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" role="switch" checked={!!season.autoStart} onChange={e => set('autoStart', e.target.checked)} className="toggle toggle-sm toggle-primary" />
                Switch this season on automatically at the start time
              </label>
            )}
            {season.startsAt !== undefined && season.endsAt !== undefined && season.endsAt <= season.startsAt && (
              <p className="text-xs text-red-400">The end must be after the start.</p>
            )}
          </>
        )}

        {/* ── Packs ── */}
        {step === 'packs' && (
          <>
            <StepTitle title="Choose packs" hint="Packs are drawn by weight while this season is active. Draft packs can be attached now, but they only start being drawn once published." />
            {packs.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-gray-500 text-sm">You don&apos;t have any packs yet.</p>
                <NewPackButton newTab label="Create a pack →" className="btn btn-primary inline-block px-4 py-2 text-sm rounded-xl" />
              </div>
            ) : (
              <ul className="space-y-2">
                {packs.map(p => {
                  const on = season.packIds.includes(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => togglePack(p.id)}
                        aria-pressed={on}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                          on ? 'border-yellow-500/60 bg-yellow-500/5' : 'border-gray-800 bg-gray-900/40 hover:border-gray-600'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-md border flex items-center justify-center text-xs font-bold shrink-0 ${on ? 'bg-yellow-500 border-yellow-500 text-gray-950' : 'border-gray-600'}`}>
                          {on ? <Icon name="check" className="w-3 h-3" /> : ''}
                        </span>
                        {p.coverImageUrl ? (
                          <img src={p.coverImageUrl} alt="" className="w-10 h-12 object-cover rounded-sm shrink-0" />
                        ) : (
                          <span className="w-10 h-12 rounded-sm bg-gray-800 flex items-center justify-center shrink-0"><BrandMark size={24} /></span>
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium text-white truncate">{p.name || 'Untitled pack'}</span>
                          <span className="block text-xs text-gray-500">
                            {p.cardCount} card{p.cardCount === 1 ? '' : 's'} · weight {p.weight}×
                          </span>
                        </span>
                        <span className="flex flex-wrap justify-end gap-1.5 shrink-0">
                          {p.status === 'draft' && <Chip cls="text-amber-300 bg-amber-500/10 border-amber-400/30">Draft</Chip>}
                          {p.status === 'published' && !p.active && <Chip cls="text-gray-400 bg-gray-800 border-gray-700">Inactive</Chip>}
                          {p.upgradesEnabled && <Chip cls="text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-400/30">Upgrades</Chip>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-gray-600">
              Draw weight belongs to the pack (shared by every season using it), change it in the pack&apos;s settings.{' '}
              <NewPackButton newTab label="Create another pack →" className="text-yellow-500 hover:text-yellow-400" />
            </p>
          </>
        )}

        {/* ── Review ── */}
        {step === 'review' && (
          <>
            <StepTitle title="Review" hint="A draft season is never active. Create it, or create it and make it the live season." />
            {shown.length > 0 ? (
              <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 space-y-2">
                <p className="text-sm font-semibold text-red-300">A few things to fix first</p>
                <ul className="space-y-1.5">
                  {shown.map((i, n) => (
                    <li key={n} className="flex items-center justify-between gap-3 text-sm text-gray-300">
                      <span>{i.message}</span>
                      <button type="button" onClick={() => { setStep(i.step); setPublishIssues([]); }} className="shrink-0 text-xs font-bold text-yellow-400 hover:text-yellow-300">Fix in {label(i.step)} →</button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-xl border border-green-500/30 bg-green-950/20 p-4 text-sm text-green-300"><Icon name="check" className="mr-1" />Ready to create.</p>
            )}
            {issues.length === 0 && drawable.length === 0 && (
              <p className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 text-sm text-amber-200">
                None of the attached packs is published and active yet, so nothing would be drawn if you activate this season now. You can still create it and publish packs later.
              </p>
            )}
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Summary label="Name" value={season.name || '-'} />
              <Summary label="Collection name" value={season.collectionName || '-'} />
              <Summary label="Packs" value={selected.length ? selected.map(p => p.name || 'Untitled').join(', ') : '-'} />
              <Summary label="Concurrent packs" value={String(season.maxConcurrentPacks)} />
            </dl>
          </>
        )}

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-gray-800">
          <div className="flex items-center gap-1">
            {stepIdx > 0 ? (
              <button type="button" onClick={() => setStep(STEPS[stepIdx - 1].id)} className="px-4 py-2 text-sm text-gray-500 hover:text-white transition-colors">← Back</button>
            ) : !draftId && (
              <button type="button" onClick={discard} disabled={!!busy} className="px-4 py-2 text-sm text-gray-500 hover:text-white transition-colors">Cancel</button>
            )}
            {draftId && <ArmedButton onConfirm={discard} disabled={!!busy} armedLabel="Sure? Discard it" title="Delete this draft season" className="px-3 py-2 text-xs text-red-500/80 hover:text-red-300 transition-colors" armedClassName="px-3 py-2 text-xs font-bold text-red-300 bg-red-500/10 rounded-lg">Discard draft</ArmedButton>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {draftId && (
              <button type="button" onClick={saveAndExit} disabled={!!busy} className="px-4 py-2.5 text-sm font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors">
                {busy === 'exit' ? 'Saving…' : 'Save draft & exit'}
              </button>
            )}
            {step !== 'review' ? (
              <button type="button" onClick={goNext} disabled={!!busy} className="px-5 py-2.5 btn btn-primary rounded-xl text-sm transition-colors">
                {busy === 'create' ? 'Saving…' : 'Next →'}
              </button>
            ) : (
              <>
                <button type="button" onClick={() => publish(false)} disabled={!!busy || issues.length > 0} className="px-4 py-2.5 text-sm font-semibold text-gray-200 bg-gray-700 hover:bg-gray-600 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {busy === 'publish' ? 'Creating…' : 'Create season'}
                </button>
                <button type="button" onClick={() => publish(true)} disabled={!!busy || issues.length > 0} className="px-5 py-2.5 btn btn-primary rounded-xl text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  Create &amp; activate →
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {hint && <p className="text-sm text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`text-[10px] font-extrabold uppercase tracking-wider border rounded-full px-2 py-0.5 ${cls}`}>{children}</span>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-gray-200 font-medium">{value}</dd>
    </div>
  );
}
