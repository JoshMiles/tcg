'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Icon } from '@/app/components/Icon';
import { DEFAULT_SCORING, SCORING_LIMITS, sanitizeScoring, type ScoringSettings } from '@/lib/scoring-core';
import type { ScoringPreview } from '@/lib/scoring-preview';
import { PendingButton } from '../components/PendingButton';
import { ConfirmButton } from '../components/ConfirmButton';
import { previewScoringAction } from './actions';

export interface ScoringGroupConfig { title: string; fields: { name: keyof ScoringSettings; label: string; help: string }[] }

const fmt = (n: number) => Math.round(n).toLocaleString();
const sameNum = (a: string, b: number) => Number(a) === b;

/**
 * The Scoring form with a live preview: as the numbers are typed, the active season is re-scored with them next to the saved
 * numbers (nothing is stored until Save). Warns before leaving with unsaved edits.
 */
export function ScoringForm({ saved, groups, save, reset }: {
  saved: ScoringSettings; groups: ScoringGroupConfig[];
  save: (f: FormData) => Promise<void>; reset: () => Promise<void>;
}) {
  const initial = useMemo(() => Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, String(v)])) as Record<string, string>, [saved]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [result, setResult] = useState<{ season: string; preview: ScoringPreview } | { message: string } | null>(null);
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const dirty = Object.keys(initial).some(k => !sameNum(values[k] ?? '', saved[k as keyof ScoringSettings]));
  const effective = useMemo(() => sanitizeScoring(values), [values]);

  // Debounced preview: only the latest request's answer is shown.
  useEffect(() => {
    const mine = ++seq.current;
    setBusy(true);
    const t = setTimeout(() => {
      startTransition(async () => {
        try {
          const r = await previewScoringAction(values);
          if (mine === seq.current) setResult(r.ok ? { season: r.season, preview: r.preview } : { message: r.message });
        } catch {
          if (mine === seq.current) setResult({ message: 'Could not compute the preview.' });
        }
        if (mine === seq.current) setBusy(false);
      });
    }, 450);
    return () => clearTimeout(t);
  }, [values]);

  // Leaving with unsaved edits asks first (closing the tab, reloading, following an external link).
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const set = (name: string, v: string) => setValues(s => ({ ...s, [name]: v }));
  const preview = result && 'preview' in result ? result.preview : null;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr] items-start">
      <form action={save} className="space-y-5 min-w-0">
        {groups.map(g => (
          <fieldset key={g.title} className="tcg-panel rounded-2xl p-5 space-y-4">
            <legend className="px-2 -ml-2 text-xs font-extrabold text-gray-300 uppercase tracking-wider">{g.title}</legend>
            {g.fields.map(f => {
              const { min, max, step } = SCORING_LIMITS[f.name];
              const def = DEFAULT_SCORING[f.name];
              const changedFromSaved = !sameNum(values[f.name] ?? '', saved[f.name]);
              const atDefault = sameNum(values[f.name] ?? '', def);
              const clamped = Number(values[f.name]) !== effective[f.name] && values[f.name] !== '';
              return (
                <div key={f.name} className="grid sm:grid-cols-[11rem_1fr] gap-x-4 gap-y-1 items-start">
                  <label htmlFor={`scoring-${f.name}`} className="text-sm text-gray-200 font-medium pt-1.5">
                    {f.label}
                    <span className="block text-[11px] font-normal text-gray-600">default {def}{atDefault ? '' : ' · changed'}</span>
                  </label>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        id={`scoring-${f.name}`} name={f.name} type="number" min={min} max={max} step={step}
                        value={values[f.name] ?? ''} onChange={e => set(f.name, e.target.value)}
                        className={`input input-sm w-32 ${changedFromSaved ? 'input-warning' : ''}`}
                      />
                      {!atDefault && <button type="button" onClick={() => set(f.name, String(def))} className="text-xs text-gray-500 hover:text-yellow-300 underline underline-offset-2">Use default</button>}
                      {changedFromSaved && <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">edited</span>}
                    </div>
                    {clamped && <p className="text-xs text-amber-300">Will be saved as {effective[f.name]} (allowed {min}–{max}).</p>}
                    <p className="text-xs text-gray-500 leading-relaxed">{f.help}</p>
                  </div>
                </div>
              );
            })}
          </fieldset>
        ))}

        <div className="sticky bottom-0 z-10 -mx-1 px-1 py-3 bg-gray-950/90 backdrop-blur-sm border-t border-gray-800 flex flex-wrap items-center gap-3">
          <PendingButton type="submit" className="tcg-btn px-5 py-2 rounded-xl text-sm">Save scoring</PendingButton>
          <button type="button" disabled={!dirty} onClick={() => setValues(initial)} className="text-sm text-gray-400 hover:text-white disabled:opacity-40 disabled:pointer-events-none">Discard edits</button>
          <span className={`text-xs ${dirty ? 'text-amber-300' : 'text-gray-600'}`}>{dirty ? 'You have unsaved changes. Saving re-scores every season at once.' : 'Values outside the allowed range are clamped when saved.'}</span>
          <span className="ml-auto">
            <ConfirmButton formId="scoring-reset" title="Reset scoring?" confirmLabel="Reset to defaults" message={<>Reset <strong className="text-white">every</strong> scoring number to its default? This re-scores every season immediately.</>} className="text-xs text-gray-500 hover:text-red-300 underline underline-offset-2">Reset all to defaults</ConfirmButton>
          </span>
        </div>
      </form>
      {/* Outside the save form (forms can't nest); the button above submits it. */}
      <form id="scoring-reset" action={reset} className="hidden" />

      {/* Preview */}
      <aside className="tcg-panel rounded-2xl p-5 space-y-4 xl:sticky xl:top-4 min-w-0" aria-live="polite">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-white"><Icon name="eye" className="mr-1.5 text-yellow-400" />Preview{result && 'season' in result ? <span className="text-gray-500 font-normal"> · {result.season}</span> : null}</h3>
          {busy ? <span className="text-xs text-gray-500">Updating…</span> : dirty ? <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">not saved</span> : <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500">same as saved</span>}
        </div>
        {!result ? <p className="text-sm text-gray-500">Working it out…</p> : !preview ? <p className="text-sm text-gray-500">{'message' in result ? result.message : ''}</p> : (
          <>
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] uppercase tracking-wider text-gray-500"><th className="text-left font-bold pb-1.5" /><th className="text-right font-bold pb-1.5">Saved</th><th className="text-right font-bold pb-1.5">With these</th></tr></thead>
              <tbody className="divide-y divide-gray-800/60">
                <Row label="Set value" a={preview.saved.setValue} b={preview.candidate.setValue} />
                <Row label="Highest card value" a={preview.saved.maxCardValue} b={preview.candidate.maxCardValue} />
                <Row label="Progress bonus (at a full set)" a={preview.saved.completionAtFull} b={preview.candidate.completionAtFull} />
                <Row label="Full set bonus" a={preview.saved.completeSetBonus} b={preview.candidate.completeSetBonus} />
                <Row label="Top score" a={preview.saved.topScore} b={preview.candidate.topScore} />
              </tbody>
            </table>

            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Top 5 with these numbers</p>
              {preview.candidate.top.length === 0 ? <p className="text-sm text-gray-600">No collectors yet in this season.</p> : (
                <ol className="space-y-1">
                  {preview.candidate.top.map(r => {
                    const was = preview.movers.find(m => m.username === r.username);
                    return (
                      <li key={r.username} className="flex items-center gap-2 text-sm">
                        <span className="w-5 text-xs text-gray-600 tabular-nums">{r.rank}</span>
                        <span className="font-mono text-gray-200 truncate flex-1">{r.username}</span>
                        {was && was.savedRank !== r.rank && <span className="text-[11px] text-gray-500">was #{was.savedRank}</span>}
                        <span className="tabular-nums text-yellow-300">{fmt(r.score)}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
            <p className={`text-xs ${preview.rankChanges > 0 ? 'text-amber-300' : 'text-gray-500'}`}>
              {preview.viewers === 0 ? 'No ranked viewers yet.' : preview.rankChanges === 0 ? `No change in rank among the top ${Math.min(20, preview.viewers)} viewers.` : `${preview.rankChanges} of the top ${Math.min(20, preview.viewers)} viewers change rank.`}
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

function Row({ label, a, b }: { label: string; a: number; b: number }) {
  const changed = Math.round(a) !== Math.round(b);
  const pct = a > 0 ? Math.round(((b - a) / a) * 100) : null;
  return (
    <tr>
      <td className="py-1.5 text-gray-400">{label}</td>
      <td className="py-1.5 text-right tabular-nums text-gray-300">{fmt(a)}</td>
      <td className={`py-1.5 text-right tabular-nums ${changed ? 'text-amber-200 font-semibold' : 'text-gray-300'}`}>{fmt(b)}{changed && pct !== null && <span className="ml-1.5 text-[11px] text-gray-500">{pct > 0 ? '+' : ''}{pct}%</span>}</td>
    </tr>
  );
}
