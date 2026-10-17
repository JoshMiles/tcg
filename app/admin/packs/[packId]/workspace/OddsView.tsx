'use client';
import { useMemo, useState, useTransition } from 'react';
import { Icon } from '@/app/components/Icon';
import { Spinner } from '../../../components/PendingButton';
import { cardThumbUrl } from '@/lib/card-art';
import { shareOf, totalWeight } from '@/lib/card-maths';
import { TIER_DEFAULTS, balanceByRarity, normalizeWeights, simulate, type SimResult } from '@/lib/odds-core';
import type { PackInput } from '@/lib/pack-clean';
import type { WorkCard } from '@/lib/pack-editor-core';
import { VARIANTS, VARIANT_LABELS, effectiveWeights } from '@/lib/variants';
import { getRarity } from '@/lib/rarity';
import { NumberInput } from './fields';

const RUNS = [1_000, 10_000, 100_000];

/**
 * The Odds view (ROADMAP 20.2d): every card's weight, the share of pulls by rarity, Normalize, Balance by rarity and the draw simulator.
 * It reads and writes the workspace's working state, so a balance done here shows in the list and is saved with everything else, and the
 * simulator runs on the unsaved weights and the unsaved version settings.
 */
export function OddsView({ pack, cards, baseCards, editCards }: {
  pack: PackInput;
  cards: WorkCard[];
  baseCards: WorkCard[];
  editCards: (fn: (cards: WorkCard[]) => WorkCard[], key?: string) => void;
}) {
  const upgrades = pack.upgradesEnabled;
  const [targets, setTargets] = useState<Record<number, string>>(() => Object.fromEntries(Object.entries(TIER_DEFAULTS).map(([k, v]) => [k, String(v)])));
  const [showTiers, setShowTiers] = useState(false);
  const [runs, setRuns] = useState(10_000);
  const [sim, setSim] = useState<SimResult | null>(null);
  const [simulating, startSim] = useTransition();

  const baseProb = useMemo(() => new Map(baseCards.map(c => [c.id, c.probability])), [baseCards]);
  const total = totalWeight(cards.map(c => c.probability));
  const dirty = cards.some(c => c.probability !== (baseProb.get(c.id) ?? c.probability));
  const pct = (w: number) => shareOf(w, total) * 100;

  const tiers = useMemo(() => {
    const m = new Map<number, { stars: number; count: number }>();
    for (const c of cards) { const t = m.get(c.stars) ?? { stars: c.stars, count: 0 }; t.count++; m.set(c.stars, t); }
    return [...m.values()].sort((a, b) => b.stars - a.stars);
  }, [cards]);
  const tierPct = (stars: number) => cards.filter(c => c.stars === stars).reduce((s, c) => s + pct(c.probability), 0);

  const set = (id: string, n: number) => editCards(cs => cs.map(c => (c.id === id ? { ...c, probability: n } : c)), `odds:${id}`);
  const apply = (next: Record<string, number>) => editCards(cs => cs.map(c => (next[c.id] !== undefined ? { ...c, probability: next[c.id] } : c)));
  const normalize = () => apply(normalizeWeights(cards));
  const balance = () => apply(balanceByRarity(cards, Object.fromEntries(Object.entries(targets).map(([k, v]) => [Number(k), Number(v)]))));
  const reset = () => editCards(cs => cs.map(c => (baseProb.has(c.id) ? { ...c, probability: baseProb.get(c.id)! } : c)));

  const simulateNow = () => startSim(() => {
    setSim(simulate(cards, id => { const c = cards.find(x => x.id === id); return c ? effectiveWeights({ variantWeights: pack.variantWeights, disabledVariants: pack.disabledVariants }, { disabledVariants: c.upgradesEnabled ? c.disabledVariants : ['reverse', 'full', 'shiny'] }) : undefined; }, upgrades, runs));
  });

  const btn = 'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white transition-colors disabled:opacity-50';
  const off = Math.abs(total - 100) > 0.05;

  if (cards.length === 0) return <p className="tcg-panel rounded-2xl px-5 py-12 text-center text-gray-500">Add some cards first, then tune their odds here.</p>;

  return (
    <section id="odds" className="tcg-panel rounded-2xl overflow-hidden">
      <header className="px-5 py-4 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2"><Icon name="chart" className="text-yellow-500/90" />Odds &amp; simulator</h2>
          <p className="text-xs text-gray-500 mt-0.5">Probabilities are relative weights. They are edited in the same unsaved changes as everything else: simulate here, then save from the top bar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm font-bold tabular-nums ${off ? 'text-amber-300' : 'text-emerald-300'}`} title="The weights add up to this. Anything works, but 100 reads as percentages.">Total {Math.round(total * 100) / 100}</span>
          <button type="button" onClick={normalize} disabled={total <= 0 || !off} className={btn}>Normalize to 100</button>
          <button type="button" onClick={() => setShowTiers(s => !s)} aria-expanded={showTiers} className={btn}>Balance by rarity</button>
          <button type="button" onClick={reset} disabled={!dirty} className={btn}>Reset</button>
        </div>
      </header>

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
              {[...cards].sort((a, b) => (a.number || 1e9) - (b.number || 1e9)).map(c => {
                const changed = c.probability !== (baseProb.get(c.id) ?? c.probability);
                const p = pct(c.probability);
                return (
                  <tr key={c.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-1.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {c.imageUrl ? <img src={cardThumbUrl(c.imageUrl)} alt="" loading="lazy" className="w-6 h-9 object-cover rounded shrink-0" /> : <div className="w-6 h-9 bg-gray-800 rounded shrink-0" />}
                        <span className="truncate text-gray-200">{c.name || 'Untitled'}</span>
                        <span className={`text-[11px] shrink-0 ${getRarity(c.stars)?.text}`}>{'★'.repeat(c.stars)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <div className={`w-24 ml-auto ${changed ? '[&_input]:!border-yellow-500/60 [&_input]:!text-yellow-200' : ''}`}><NumberInput ariaLabel={`Weight for ${c.name || 'card'}`} value={c.probability} min={0} onChange={n => set(c.id, n)} /></div>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-300">{p >= 10 ? p.toFixed(1) : p.toFixed(2)}%</td>
                    <td className="pr-5 pl-3 py-1.5 text-right tabular-nums text-gray-600 hidden sm:table-cell">{p > 0 ? Math.round(100 / p).toLocaleString() : '-'}</td>
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
              <button type="button" onClick={simulateNow} disabled={simulating || total <= 0} className={btn}>{simulating ? <Spinner /> : <Icon name="play" className="w-3 h-3" />}Run</button>
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
                <p className="text-xs text-gray-500">{sim.found} of {cards.filter(c => c.probability > 0).length} cards appeared in {sim.draws.toLocaleString()} packs. Most pulled: {(() => { const top = Object.entries(sim.perCard).sort((a, b) => b[1] - a[1])[0]; const c = cards.find(x => x.id === top?.[0]); return c ? `${c.name} (${top[1].toLocaleString()})` : '-'; })()}.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
