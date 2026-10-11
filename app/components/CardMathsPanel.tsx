'use client';
import { useState, type ReactNode } from 'react';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import type { CardMaths } from '@/lib/card-maths';
import type { Variant } from '@/lib/types';

const n = (x: number, d = 2) => (Number.isFinite(x) ? x.toLocaleString(undefined, { maximumFractionDigits: d }) : '∞');
const pct = (p: number) => (p >= 0.1 ? `${(p * 100).toFixed(1)}%` : p >= 0.001 ? `${(p * 100).toFixed(2)}%` : `${(p * 100).toFixed(3)}%`);

function Step({ no, title, children }: { no: number; title: string; children: ReactNode }) {
  return (
    <li className="space-y-1.5">
      <p className="text-xs font-bold text-yellow-300"><span className="text-gray-500 mr-1.5">{no}.</span>{title}</p>
      <div className="space-y-1 pl-4 border-l border-gray-800">{children}</div>
    </li>
  );
}
const Eq = ({ children }: { children: ReactNode }) => <p className="font-mono text-[12px] leading-relaxed text-gray-300 break-words">{children}</p>;
const Note = ({ children }: { children: ReactNode }) => <p className="text-[11px] leading-relaxed text-gray-500">{children}</p>;
const Hi = ({ children }: { children: ReactNode }) => <strong className="text-yellow-300">{children}</strong>;

/**
 * "Advanced information (for nerds)": a collapsed section for a card's detail view that shows the full working behind its
 * points: pull chance → rarity → scarcity → variant multiplier → value, plus the pull odds and what would move the number.
 * Everything comes from `maths` (built by the same code that computes the points), so it always matches the figures above it.
 */
export function CardMathsPanel({ maths: m, variants, shown }: { maths: CardMaths; variants: Variant[]; shown: Variant }) {
  const choices = variants.length ? variants : (['regular'] as Variant[]);
  const [picked, setPicked] = useState<Variant | null>(null);
  const v = picked && choices.includes(picked) ? picked : choices.includes(shown) ? shown : choices[0];
  const label = VARIANT_LABELS[v];
  const i = VARIANTS.indexOf(v);
  const prev = i > 0 ? VARIANTS[i - 1] : null;

  // Pull odds
  const wTotal = VARIANTS.reduce((s, x) => s + Math.max(0, m.weights[x]), 0) || 1;
  const variantRate = m.pullRate * (Math.max(0, m.weights[v]) / wTotal);
  const within = (packs: number, p: number) => 1 - Math.pow(1 - p, packs);
  // What would one more / one fewer copy of this version do?
  const k = m.scarcitySmoothing;
  const clamp = (x: number) => Math.min(m.scarcityMax, Math.max(m.scarcityMin, x));
  const base = m.baseScore * m.rarity * m.multiplier[v];
  const valueAt = (copies: number) => Math.max(1, Math.round(base * clamp((m.avgCopies[v] + k) / (copies + k))));
  const clamped = m.scarcityRaw[v] !== m.scarcity[v];
  // Regular copies needed to craft one (the cost chain)
  const craft = VARIANTS.slice(1, i + 1).reduce((c, x) => c * m.costs[x as Exclude<Variant, 'regular'>], 1);

  return (
    <details className="group rounded-xl border border-gray-800 bg-gray-950/40">
      <summary className="cursor-pointer select-none list-none flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-bold text-gray-300 hover:text-white">
        <span>🤓 Advanced information <span className="font-normal text-gray-500">(for nerds)</span></span>
        <span className="text-gray-500 transition-transform group-open:rotate-90" aria-hidden>›</span>
      </summary>
      <div className="px-3 pb-4 pt-1 space-y-4 border-t border-gray-800">
        {choices.length > 1 && (
          <div role="group" aria-label="Version to explain" className="flex flex-wrap gap-1.5 pt-3">
            {choices.map(x => (
              <button key={x} type="button" aria-pressed={x === v} onClick={() => setPicked(x)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${x === v ? 'border-yellow-500 bg-yellow-500/10 text-yellow-300' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
                {VARIANT_LABELS[x]}
              </button>
            ))}
          </div>
        )}

        <div className="rounded-lg bg-gray-900/70 border border-gray-800 p-3">
          <Eq>points = max(1, round( <Hi>base</Hi> × <Hi>rarity</Hi> × <Hi>scarcity</Hi> × <Hi>version</Hi> ))</Eq>
          <Eq>{label}: round( {n(m.baseScore, 4)} × {n(m.rarity, 4)} × {n(m.scarcity[v], 4)} × {n(m.multiplier[v], 4)} ) = round({n(m.raw[v], 3)}) = <Hi>{m.values[v].toLocaleString()} pts</Hi></Eq>
        </div>

        <ol className="space-y-4">
          <Step no={1} title="Pull chance">
            <Eq>pull chance = (pack weight ÷ all pack weights) × (card odds ÷ all card odds in the pack)</Eq>
            <Eq>= ({n(m.packWeight)} ÷ {n(m.totalPackWeight)}) × ({n(m.cardProbability, 4)} ÷ {n(m.totalProbability, 4)}) = {n(m.pullRate, 6)} = <Hi>{pct(m.pullRate)}</Hi> (1 in {n(1 / m.pullRate, 1)})</Eq>
            <Note>Rolled first, as a card; the version (Regular, Reverse Holo…) is rolled afterwards and doesn&rsquo;t change this.</Note>
          </Step>

          <Step no={2} title="Rarity">
            <Eq>rarity = (1 ÷ (pull chance × cards in the season)) ^ rarity strength</Eq>
            <Eq>= (1 ÷ ({n(m.pullRate, 6)} × {m.totalCards})) ^ {n(m.rarityExponent)} = {n(m.rarityBase, 4)} ^ {n(m.rarityExponent)} = <Hi>{n(m.rarity, 4)}</Hi></Eq>
            <Note>1.0 is an average card; a card half as likely as average is worth twice as much (at strength 1).</Note>
          </Step>

          <Step no={3} title={`Scarcity of ${label}`}>
            <Eq>scarcity = clamp( (average copies of {label} per card + k) ÷ (copies of this card&rsquo;s {label} + k), {n(m.scarcityMin)}, {n(m.scarcityMax)} )</Eq>
            <Eq>= clamp( ({n(m.avgCopies[v], 3)} + {n(k)}) ÷ ({m.copies[v].toLocaleString()} + {n(k)}) ) = clamp({n(m.scarcityRaw[v], 4)}) = <Hi>{n(m.scarcity[v], 4)}</Hi>{clamped ? ` (limited to ${n(m.scarcityMin)}–${n(m.scarcityMax)})` : ''}</Eq>
            <Note>Each version is compared with the same version of other cards (a Shiny with other Shinies). k = {n(k)} is a smoothing term that stops early-season values from lurching. This is the only part that changes as cards are pulled, traded and upgraded.</Note>
          </Step>

          <Step no={4} title={`Version multiplier (${label})`}>
            {v === 'regular' || !prev ? (
              <Eq>Regular is the yardstick: multiplier = <Hi>1</Hi></Eq>
            ) : !m.upgradesEnabled ? (
              <Eq>This card&rsquo;s pack has no versions: multiplier = <Hi>1</Hi></Eq>
            ) : (
              <>
                <Eq>multiplier = max( by odds, by crafting cost )</Eq>
                <Eq>by odds = Regular weight ÷ {label} weight = {n(m.weights.regular)} ÷ {n(m.weights[v])} = {n(m.byOdds[v], 3)}</Eq>
                <Eq>by cost = {VARIANT_LABELS[prev]} multiplier × copies to upgrade × margin = {n(m.multiplier[prev], 3)} × {m.costs[v as Exclude<Variant, 'regular'>]} × {n(m.upgradeMargin)} = {n(m.byCost[v], 3)}</Eq>
                <Eq>= max({n(m.byOdds[v], 3)}, {n(m.byCost[v], 3)}) = <Hi>{n(m.multiplier[v], 3)}</Hi> <span className="text-gray-500">({m.byOdds[v] >= m.byCost[v] ? 'set by how rare it is to pull' : 'set by what it costs to craft'})</span></Eq>
                <Note>The cost floor means upgrading is never a pure loss: a crafted copy is always worth a little more than the copies it consumed.</Note>
              </>
            )}
          </Step>

          <Step no={5} title="What moves it">
            <Eq>{label} copies out there now: {m.copies[v].toLocaleString()} → <Hi>{m.values[v]} pts</Hi></Eq>
            {m.copies[v] > 0 && <Eq>one fewer ({(m.copies[v] - 1).toLocaleString()}) → {valueAt(m.copies[v] - 1)} pts</Eq>}
            <Eq>one more ({(m.copies[v] + 1).toLocaleString()}) → {valueAt(m.copies[v] + 1)} pts</Eq>
            <Note>Rarity and the version multiplier are fixed by the pack&rsquo;s setup; only the copy count moves with play. A score counts only the copies a collector owns, so a copy is worth more the fewer others there are.</Note>
          </Step>
        </ol>

        <div className="space-y-1.5 border-t border-gray-800 pt-3">
          <p className="text-xs font-bold text-yellow-300">Odds &amp; other numbers</p>
          <Eq>chance per pack of this card: {pct(m.pullRate)} · expected packs to see it: {n(1 / m.pullRate, 1)}</Eq>
          {m.upgradesEnabled && <Eq>chance per pack of a {label}: {pct(variantRate)} ({label} weight {n(m.weights[v])} of {n(wTotal)}) · expected packs: {variantRate > 0 ? n(1 / variantRate, 1) : '∞'}</Eq>}
          <Eq>at least one {label} within 10 / 50 / 100 packs: {variantRate > 0 ? `${pct(within(10, variantRate))} / ${pct(within(50, variantRate))} / ${pct(within(100, variantRate))}` : '—'}</Eq>
          {m.upgradesEnabled && v !== 'regular' && <Eq>crafting a {label} from Regulars costs {craft} copies (each step&rsquo;s cost multiplied)</Eq>}
          <Eq>season: {m.totalCards} cards · {m.totalCopies.toLocaleString()} copies pulled · set value {m.setValue.toLocaleString()} pts (one Regular of every card)</Eq>
          <Note>Your score is the points of every copy you own, plus a completion bonus ({n(m.completionBonusPct, 1)}% of the set value × the share of cards you own) and a complete-set bonus ({n(m.completeSetBonusPct, 1)}% of the set value once you own every card). Values are live, so these numbers drift as the season goes on.</Note>
        </div>
      </div>
    </details>
  );
}
