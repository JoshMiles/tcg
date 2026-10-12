'use client';
import { useMemo, useState, useTransition } from 'react';
import { Icon } from '@/app/components/Icon';
import { Spinner } from '../../components/PendingButton';
import { cardThumbUrl } from '@/lib/card-art';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import { getRarity } from '@/lib/rarity';
import type { Variant } from '@/lib/types';
import { savePackOddsAction } from '../../pack-actions';

export interface OddsCard { id: string; number: number; name: string; stars: number; imageUrl: string; probability: number }
type Weights = Record<Variant, number>;

const TIER_DEFAULTS: Record<number, number> = { 5: 2, 4: 8, 3: 20, 2: 30, 1: 40 };
const RUNS = [1_000, 10_000, 100_000];

interface SimResult {
  draws: number;
  perCard: Record<string, number>;
  perStars: Record<number, number>;
  perVariant: Record<Variant, number>;
  found: number;
  fullSet: { median: number; p90: number } | null;
}

/** Cumulative draw: picks an index by weight. */
function makePicker(weights: number[]): () => number {
  const cum: number[] = [];
  let t = 0;
  for (const w of weights) { t += Math.max(0, w); cum.push(t); }
  return () => {
    if (t <= 0) return -1;
    const r = Math.random() * t;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] > r) hi = mid; else lo = mid + 1; }
    return lo;
  };
}

/**
 * Edit every card's odds in one place (with the effect of each change on the whole pack shown live), then try them out: a simulator
 * draws thousands of packs from the numbers you have typed (saved or not), so you can see what the odds really mean before saving.
 */
export function OddsPanel({ packId, cards, upgrades, cardWeights }: { packId: string; cards: OddsCard[]; upgrades: boolean; cardWeights: Record<string, Weights> }) {
  const [odds, setOdds] = useState<Record<string, string>>(() => Object.fromEntries(cards.map(c => [c.id, String(c.probability)])));
  const [targets, setTargets] = useState<Record<number, string>>(() => Object.fromEntries(Object.entries(TIER_DEFAULTS).map(([k, v]) => [k, String(v)])));
  const [showTiers, setShowTiers] = useState(false);
  const [saving, startSave] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [runs, setRuns] = useState(10_000);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [simulating, startSim] = useTransition();

  const num = (id: string) => { const v = Number(odds[id]); return Number.isFinite(v) && v >= 0 ? v : 0; };
  const total = cards.reduce((s, c) => s + num(c.id), 0);
  const dirty = cards.some(c => num(c.id) !== c.probability);
  const pct = (id: string) => (total > 0 ? (num(id) / total) * 100 : 0);

  const tiers = useMemo(() => {
    const m = new Map<number, { stars: number; count: number }>();
    for (const c of cards) { const t = m.get(c.stars) ?? { stars: c.stars, count: 0 }; t.count++; m.set(c.stars, t); }
    return [...m.values()].sort((a, b) => b.stars - a.stars);
  }, [cards]);
  const tierPct = (stars: number) => cards.filter(c => c.stars === stars).reduce((s, c) => s + pct(c.id), 0);

  const set = (id: string, v: string) => setOdds(o => ({ ...o, [id]: v }));
  const apply = (next: Record<string, number>) => setOdds(Object.fromEntries(cards.map(c => [c.id, String(Math.round((next[c.id] ?? 0) * 10_000) / 10_000)])));
  const normalize = () => { if (total > 0) apply(Object.fromEntries(cards.map(c => [c.id, (num(c.id) / total) * 100]))); };
  const balance = () => {
    const wanted = tiers.map(t => ({ ...t, target: Math.max(0, Number(targets[t.stars]) || 0) }));
    const sum = wanted.reduce((s, t) => s + t.target, 0) || 1;
    apply(Object.fromEntries(cards.map(c => {
      const t = wanted.find(x => x.stars === c.stars)!;
      return [c.id, ((t.target / sum) * 100) / t.count];
    })));
  };
  const reset = () => setOdds(Object.fromEntries(cards.map(c => [c.id, String(c.probability)])));

  const save = () => startSave(async () => {
    setMessage(null);
    try {
      const r = await savePackOddsAction(packId, Object.fromEntries(cards.map(c => [c.id, num(c.id)])));
      setMessage({ ok: true, text: r.changed > 0 ? `Saved odds for ${r.changed} card${r.changed === 1 ? '' : 's'}.` : 'Nothing changed.' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : 'Could not save the odds.' });
    }
  });

  const simulate = () => startSim(() => {
    const pick = makePicker(cards.map(c => num(c.id)));
    if (pick() < 0) { setSim(null); return; }
    const perCard: Record<string, number> = {};
    const perStars: Record<number, number> = {};
    const perVariant = Object.fromEntries(VARIANTS.map(v => [v, 0])) as Record<Variant, number>;
    const variantPickers = new Map<string, () => number>();
    const pickVariant = (c: OddsCard): Variant => {
      if (!upgrades) return 'regular';
      let p = variantPickers.get(c.id);
      if (!p) { const w = cardWeights[c.id]; p = makePicker(VARIANTS.map(v => w?.[v] ?? 0)); variantPickers.set(c.id, p); }
      const i = p();
      return VARIANTS[i < 0 ? 0 : i];
    };
    for (let i = 0; i < runs; i++) {
      const c = cards[pick()];
      perCard[c.id] = (perCard[c.id] ?? 0) + 1;
      perStars[c.stars] = (perStars[c.stars] ?? 0) + 1;
      perVariant[pickVariant(c)]++;
    }
    // How many draws until every card with odds has been seen at least once (300 trials).
    const reachable = cards.filter(c => num(c.id) > 0).length;
    const trials: number[] = [];
    for (let t = 0; t < 300; t++) {
      const seen = new Set<number>();
      let n = 0;
      while (seen.size < reachable && n < 20_000) { seen.add(pick()); n++; }
      trials.push(n);
    }
    trials.sort((a, b) => a - b);
    setSim({
      draws: runs, perCard, perStars, perVariant, found: Object.keys(perCard).length,
      fullSet: reachable > 0 ? { median: trials[Math.floor(trials.length / 2)], p90: trials[Math.floor(trials.length * 0.9)] } : null,
    });
  });

  const btn = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white transition-colors disabled:opacity-50';
  const off = Math.abs(total - 100) > 0.05;

  return (
    <section id="odds" className="tcg-panel rounded-2xl overflow-hidden">
      <header className="px-5 py-4 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2"><Icon name="chart" className="text-yellow-500/90" />Odds &amp; simulator</h2>
          <p className="text-xs text-gray-500 mt-0.5">Probabilities are relative weights. Edit them here, then simulate before you save.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-bold tabular-nums ${off ? 'text-amber-300' : 'text-emerald-300'}`} title="The weights add up to this. Anything works, but 100 reads as percentages.">Total {Math.round(total * 100) / 100}</span>
          <button type="button" onClick={normalize} disabled={total <= 0 || !off} className={btn}>Normalize to 100</button>
          <button type="button" onClick={() => setShowTiers(s => !s)} aria-expanded={showTiers} className={btn}>Balance by rarity</button>
          <button type="button" onClick={reset} disabled={!dirty} className={btn}>Reset</button>
          <button type="button" onClick={save} disabled={!dirty || saving} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold border border-yellow-500 bg-yellow-500 text-gray-950 hover:bg-yellow-400 disabled:opacity-50 transition-colors">{saving && <Spinner />}Save odds</button>
        </div>
      </header>

      {message && <p role="status" className={`px-5 py-2 text-sm ${message.ok ? 'text-green-300 bg-green-500/10' : 'text-red-300 bg-red-500/10'}`}>{message.text}</p>}

      {showTiers && (
        <div className="dash-slide px-5 py-4 border-b border-gray-800 bg-gray-950/40 space-y-3">
          <p className="text-xs text-gray-400">Pick how much of all pulls each rarity should be. The cards in a rarity share it equally; you can fine-tune them afterwards.</p>
          <div className="flex flex-wrap items-end gap-3">
            {tiers.map(t => (
              <label key={t.stars} className="text-xs text-gray-500 space-y-1">
                <span className={getRarity(t.stars)?.text}>{'★'.repeat(t.stars)} <span className="text-gray-600">({t.count})</span></span>
                <input type="number" min={0} step="any" value={targets[t.stars] ?? ''} onChange={e => setTargets(x => ({ ...x, [t.stars]: e.target.value }))} className="block w-20 rounded-lg bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-yellow-500" />
              </label>
            ))}
            <button type="button" onClick={balance} className={btn}>Apply</button>
          </div>
        </div>
      )}

      <div className="grid xl:grid-cols-[1.3fr_1fr]">
        {/* Odds table */}
        <div className="max-h-[32rem] overflow-auto xl:border-r border-gray-800">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-900 z-10">
              <tr className="text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-800">
                <th className="text-left px-5 py-2.5">Card</th>
                <th className="text-right px-3 py-2.5 w-28">Weight</th>
                <th className="text-right px-3 py-2.5 w-20">Chance</th>
                <th className="text-right pr-5 pl-3 py-2.5 w-24 hidden sm:table-cell">1 in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {cards.map(c => {
                const changed = num(c.id) !== c.probability;
                const p = pct(c.id);
                return (
                  <tr key={c.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-1.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {c.imageUrl ? <img src={cardThumbUrl(c.imageUrl)} alt="" loading="lazy" className="w-6 h-9 object-cover rounded shrink-0" /> : <div className="w-6 h-9 bg-gray-800 rounded shrink-0" />}
                        <span className="truncate text-gray-200">{c.name}</span>
                        <span className={`text-[11px] shrink-0 ${getRarity(c.stars)?.text}`}>{'★'.repeat(c.stars)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <input type="number" min={0} step="any" value={odds[c.id]} onChange={e => set(c.id, e.target.value)} aria-label={`Weight for ${c.name}`} className={`w-24 rounded-lg bg-gray-950 border px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:border-yellow-500 ${changed ? 'border-yellow-500/60 text-yellow-200' : 'border-gray-700 text-white'}`} />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-300">{p >= 10 ? p.toFixed(1) : p.toFixed(2)}%</td>
                    <td className="pr-5 pl-3 py-1.5 text-right tabular-nums text-gray-600 hidden sm:table-cell">{p > 0 ? Math.round(100 / p).toLocaleString() : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* By rarity + simulator */}
        <div className="p-5 space-y-5 min-w-0">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider font-bold text-gray-500">Share of pulls by rarity</p>
            {tiers.map(t => {
              const v = tierPct(t.stars);
              return (
                <div key={t.stars} className="space-y-0.5">
                  <div className="flex justify-between text-xs"><span className={getRarity(t.stars)?.text}>{'★'.repeat(t.stars)} <span className="text-gray-600">{t.count} card{t.count === 1 ? '' : 's'}</span></span><span className="text-gray-400 tabular-nums">{v.toFixed(1)}%</span></div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden"><div className={`h-full rounded-full ${getRarity(t.stars)?.bar ?? 'bg-gray-500'}`} style={{ width: `${Math.min(100, v)}%` }} /></div>
                </div>
              );
            })}
          </div>

          <div className="space-y-3 border-t border-gray-800 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs uppercase tracking-wider font-bold text-gray-500 mr-auto">Draw simulator</p>
              <select value={runs} onChange={e => setRuns(Number(e.target.value))} aria-label="Packs to simulate" className="rounded-lg bg-gray-950 border border-gray-700 px-2 py-1.5 text-xs text-white">
                {RUNS.map(n => <option key={n} value={n}>{n.toLocaleString()} packs</option>)}
              </select>
              <button type="button" onClick={simulate} disabled={simulating || total <= 0} className={btn}>{simulating ? <Spinner /> : <Icon name="play" className="w-3 h-3" />}Run</button>
            </div>
            {!sim ? <p className="text-xs text-gray-600">Uses the weights typed on the left{dirty ? ' (including unsaved changes)' : ''}. Each pack gives one card{upgrades ? ' and a variant roll' : ''}.</p> : (
              <div className="space-y-3 text-sm">
                {sim.fullSet && (
                  <div className="rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Packs to find every card once</p>
                    <p className="text-gray-200"><strong className="text-white tabular-nums">{sim.fullSet.median.toLocaleString()}</strong> typical · <strong className="text-white tabular-nums">{sim.fullSet.p90.toLocaleString()}</strong> for 9 viewers in 10 <span className="text-xs text-gray-600">(300 trials)</span></p>
                  </div>
                )}
                <div className="grid grid-cols-5 gap-1.5 text-center">
                  {[5, 4, 3, 2, 1].filter(s => tiers.some(t => t.stars === s)).map(s => (
                    <div key={s} className="rounded-lg bg-gray-950/50 border border-gray-800 py-1.5">
                      <p className={`text-[11px] ${getRarity(s)?.text}`}>{'★'.repeat(s)}</p>
                      <p className="text-sm font-bold text-white tabular-nums">{(((sim.perStars[s] ?? 0) / sim.draws) * 100).toFixed(1)}%</p>
                    </div>
                  ))}
                </div>
                {upgrades && (
                  <div className="grid grid-cols-4 gap-1.5 text-center">
                    {VARIANTS.map(v => (
                      <div key={v} className="rounded-lg bg-gray-950/50 border border-gray-800 py-1.5">
                        <p className="text-[11px] text-gray-500">{VARIANT_LABELS[v]}</p>
                        <p className="text-sm font-bold text-white tabular-nums">{(((sim.perVariant[v] ?? 0) / sim.draws) * 100).toFixed(1)}%</p>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500">{sim.found} of {cards.filter(c => num(c.id) > 0).length} cards appeared in {sim.draws.toLocaleString()} packs. Most pulled: {(() => { const top = Object.entries(sim.perCard).sort((a, b) => b[1] - a[1])[0]; const c = cards.find(x => x.id === top?.[0]); return c ? `${c.name} (${top[1].toLocaleString()})` : '—'; })()}.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
