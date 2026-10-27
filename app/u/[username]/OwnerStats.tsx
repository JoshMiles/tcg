import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { InfoTip } from '@/app/components/InfoTip';
import { PushPrompt } from '@/app/components/site/PushPrompt';
import { DiscordPrompt } from '@/app/components/site/DiscordPrompt';
import { ShareImageButton } from '@/app/components/ShareImage';
import { UpgradeButton } from '@/app/components/UpgradeButton';
import type { Session } from '@/lib/session';
import type { Copy } from '@/lib/serials-core';
import type { ProfileBase } from '@/lib/profile-data';
import { tradeHistory } from '@/lib/trades';
import { buildStatsCard } from '@/lib/share-stats';
import { buildAdvice, missingGain } from '@/lib/advisor';
import { recordScoreSample } from '@/lib/score-history';
import { chartPoints } from '@/lib/score-history-core';
import { getSeasonOverview } from '@/lib/site-data';
import { getPastSeasonResults } from '@/lib/season-wrap';
import { computeUserStats, VARIANT_LABELS } from '@/lib/user-stats';
import { usesFullArt } from '@/lib/variants';
import { getRarity } from '@/lib/rarity';
import { cardThumbUrl } from '@/lib/card-art';
import { getHoloResolver } from '@/lib/holo';
import { SITE_URL } from '@/lib/site';
import { EarlierCollection } from './EarlierCollection';
import { ScoreChart } from './ScoreChart';
import { WantToggle } from './WantToggle';

/**
 * The owner-only parts of their own Stats tab, wrapped around the public stats (`children`): the "earlier collection" notice and the sign-in
 * prompts above, what to do next, then the public stats, then upgrades, the cards still needed, the score over time and the share button.
 * Everything here acts on the signed-in session, never on the profile in the URL.
 */
export async function OwnerStats({ b, session, copies, restored, children }: { b: ProfileBase; session: Session; copies: Copy[]; restored?: string; children: ReactNode }) {
  const season = b.season;
  const lead = (
    <>
      <PushPrompt />
      <DiscordPrompt />
      <EarlierCollection session={session} restored={restored} />
    </>
  );
  const [overview, holoFor, tradeLog, pastResults] = await Promise.all([getSeasonOverview(season), getHoloResolver(), tradeHistory().catch(() => []), getPastSeasonResults(session.username).catch(() => [])]);
  const past = pastResults.length > 0 && (
    <section className="card rounded-2xl p-5 space-y-3" aria-label="Past seasons">
      <h2 className="font-display text-xl font-bold text-white"><Icon name="trophy" className="mr-2 text-yellow-400" />Past seasons</h2>
      <ul className="divide-y divide-gray-800/70">
        {pastResults.map(r => (
          <li key={r.seasonId} className="py-2 flex items-center gap-3 text-sm">
            <Link href={`/leaderboard/${r.seasonId}`} className="flex-1 min-w-0 truncate font-semibold text-white hover:text-yellow-200">{r.seasonName}</Link>
            <span className="font-bold text-yellow-300 tabular-nums">#{r.rank}</span>
            <span className="text-gray-400 tabular-nums">{Math.round(r.score).toLocaleString()} pts</span>
          </li>
        ))}
      </ul>
    </section>
  );
  // Upgrades only make sense in the season that is running.
  const live = season.active && !season.endedAt;
  const s = computeUserStats(overview, session.username, b.owned, b.collection, { upgrades: live });
  if (s.copies === 0) return <div className="space-y-6">{lead}{children}{past}</div>;
  const upgradesOn = live && overview.cards.some(c => c.pack.upgradesEnabled);
  const history = live ? await recordScoreSample(session.username, season.id, Math.round(s.score), s.rank) : [];
  const samples = chartPoints(history);

  const missing = overview.cards
    .filter(c => !b.variantMap.has(c.number))
    .map(c => ({ number: c.number, name: c.name, stars: c.stars, pullRate: overview.values.cards.get(c.number)?.pullRate ?? 0, value: overview.values.cards.get(c.number)?.values.regular ?? 0, imageUrl: c.imageUrl }));
  const above = s.rank && s.rank > 1 ? overview.rows[s.rank - 2] : null;
  const best = s.upgradable[0];
  const advice = buildAdvice({
    uniqueCards: s.uniqueCards, totalCards: s.totalCards, complete: s.complete, maxCompletionBonus: s.maxCompletionBonus, completeSetBonusValue: s.completeSetBonusValue,
    bestUpgrade: best ? { cardName: best.card.name, fromLabel: VARIANT_LABELS[best.from], toLabel: VARIANT_LABELS[best.to], gain: best.gain, cost: best.cost } : undefined,
    missing, nextRank: above ? { username: above.username, gap: Math.max(1, Math.ceil(above.score - s.score)) } : null,
  });
  const missingTop = [...missing].sort((a, z) => missingGain(z, s) - missingGain(a, s)).slice(0, 8);
  const wanted = new Set(b.settings.wanted);

  const shareSpec = {
    title: session.displayName,
    subtitle: `@${session.username} · ${season.name}`,
    // The stats image: rank and score, six figures and a strip of their three most valuable prints (the header chips would repeat them).
    statsCard: buildStatsCard({
      rank: s.rank, score: s.score, uniqueCards: s.uniqueCards, totalCards: s.totalCards, copies: s.copies,
      completionBonusPct: overview.values.settings.completionBonusPct,
      prints: copies.filter(c => c.owner === session.username),
      chance: (card, variant) => {
        const cv = overview.values.cards.get(card);
        if (!cv) return 0;
        const w = cv.maths.weights;
        const total = w.regular + w.reverse + w.full + w.shiny + (w.golden ?? 0);
        return total > 0 ? cv.pullRate * (w[variant] / total) : 0;
      },
      nameOf: n => overview.cards.find(c => c.number === n)?.name ?? `Card #${n}`,
      hexOf: n => getRarity(overview.cards.find(c => c.number === n)?.stars ?? 0)?.hex,
      tradesCompleted: tradeLog.filter(t => t.status === 'accepted' && t.seasonId === season.id && (t.from === session.username || t.to === session.username || t.resolvedBy === session.username)).length,
    }),
    cards: s.topCopies.slice(0, 3).map(t => ({
      src: usesFullArt(t.variant) && t.card.fullArtImageUrl ? t.card.fullArtImageUrl : t.card.imageUrl,
      name: t.card.name, hex: getRarity(t.card.stars)?.hex, tag: t.variant === 'regular' ? undefined : t.variant === 'reverse' ? 'RH' : t.variant === 'full' ? 'FA' : t.variant === 'shiny' ? 'FH' : 'GD',
    })),
    footer: SITE_URL.replace(/^https?:\/\//, ''),
  };

  return (
    <div className="space-y-6">
      {lead}
      {advice.length > 0 && (
        <section className="card rounded-2xl p-5 space-y-3" aria-label="What to do next">
          <h2 className="font-display text-xl font-bold text-white"><Icon name="zap" className="mr-2 text-yellow-400" />What to do next</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {advice.map(a => {
              const body = (
                <>
                  <span className="flex items-center gap-2 text-sm font-semibold text-white"><Icon name={a.icon} className="text-yellow-400" />{a.title}{a.points ? <span className="ml-auto text-xs font-bold text-emerald-300 tabular-nums">+{a.points.toLocaleString()}</span> : null}</span>
                  <span className="block text-xs text-gray-400 mt-1 leading-relaxed">{a.detail}</span>
                </>
              );
              return <li key={a.id}>{a.href ? <Link href={a.href} className="block rounded-xl border border-gray-800 bg-gray-950/50 hover:border-yellow-500/40 p-3 transition-colors">{body}</Link> : <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-3">{body}</div>}</li>;
            })}
          </ul>
          <p className="text-xs text-gray-600">Suggestions use today&rsquo;s values, which move as more cards are pulled.</p>
        </section>
      )}

      {children}

      {/* Upgrades you can afford */}
      {upgradesOn && (
        <section id="upgrades" className="card rounded-2xl p-5 space-y-3">
          <h2 className="font-display text-xl font-bold text-white"><Icon name="arrowUp" className="mr-2 text-yellow-400" />Ready to upgrade<InfoTip term="upgrade" /></h2>
          {s.upgradable.length === 0 ? (
            <p className="text-sm text-gray-400">
              Nothing yet. Collect duplicates of the same card and version. You&rsquo;ll see what you can upgrade here.
            </p>
          ) : (
            <ul className="divide-y divide-gray-800/70">
              {s.upgradable.map(u => {
                const rarity = getRarity(u.card.stars);
                return (
                  <li key={`${u.card.id}-${u.from}`} className="py-2.5 flex items-center gap-3">
                    {u.card.imageUrl ? (
                      <img src={cardThumbUrl(u.card.imageUrl)} alt="" loading="lazy" className="w-9 h-12 object-cover rounded-sm" style={{ boxShadow: `0 0 0 1.5px ${rarity?.hex}` }} />
                    ) : <span className="w-9 h-12 rounded-sm bg-gray-800" />}
                    <span className="flex-1 min-w-0 text-sm">
                      <span className="block font-semibold text-white truncate">{u.card.name}</span>
                      <span className="block text-xs text-gray-400">
                        {u.cost}× {VARIANT_LABELS[u.from]} → 1 {VARIANT_LABELS[u.to]}
                        <span className="text-gray-600"> · you have {u.have}</span>
                      </span>
                    </span>
                    <span
                      className={`text-xs font-bold tabular-nums shrink-0 ${u.gain >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
                      title="Projected change to your score, including the edition bonuses it spends"
                    >
                      {u.gain >= 0 ? '+' : '−'}{Math.abs(u.gain).toLocaleString()} pts
                    </span>
                    <UpgradeButton cardNumber={u.card.number} from={u.from} to={u.to} have={u.have} cost={u.cost} gain={u.gain} holo={holoFor(u.card.pack, u.card.stars)} card={{ name: u.card.name, imageUrl: u.card.imageUrl, fullArtImageUrl: u.card.fullArtImageUrl }} />
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-gray-500 leading-relaxed">
            Upgrades are permanent. The editions you spend are destroyed. The newest edition numbers are spent first, and the new edition gets the next free edition number of its version. The points shown are projected with the edition bonus included, so they can occasionally be negative.
          </p>
        </section>
      )}

      {missingTop.length > 0 && (
        <section id="missing" className="card rounded-2xl p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-white"><Icon name="search" className="mr-2 text-yellow-400" />Cards you still need</h2>
            <Link href="/cards" className="text-xs text-yellow-500 hover:text-yellow-300">Card Dex →</Link>
          </div>
          <ul className="divide-y divide-gray-800/70">
            {missingTop.map(m => {
              const rarity = getRarity(m.stars);
              return (
                <li key={m.number} className="py-2 flex items-center gap-3">
                  {m.imageUrl ? <img src={cardThumbUrl(m.imageUrl)} alt="" loading="lazy" className="w-8 h-11 object-cover rounded-sm opacity-70" style={{ boxShadow: `0 0 0 1.5px ${rarity?.hex}` }} /> : <span className="w-8 h-11 rounded-sm bg-gray-800" />}
                  <Link href={`/cards?card=${m.number}`} className="flex-1 min-w-0 hover:text-yellow-200">
                    <span className="block text-sm font-semibold text-white truncate">{m.name}</span>
                    <span className="block text-xs" style={{ color: rarity?.hex }}>{'★'.repeat(m.stars)} {rarity?.label} · {m.pullRate > 0 ? `1 in ${Math.round(1 / m.pullRate).toLocaleString()}` : '-'}</span>
                  </Link>
                  <span className="text-xs font-bold text-emerald-300 tabular-nums shrink-0" title="Its points plus its share of the progress bonus">+{missingGain(m, s).toLocaleString()}</span>
                  <WantToggle number={m.number} initial={wanted.has(m.number)} />
                </li>
              );
            })}
          </ul>
          {missing.length > missingTop.length && <p className="text-xs text-gray-500">Showing the {missingTop.length} worth the most. {missing.length - missingTop.length} more still to find.</p>}
        </section>
      )}

      {samples.length < 2 && live && (
        <section className="card rounded-2xl p-5 space-y-2" aria-label="Score history">
          <h2 className="font-display text-xl font-bold text-white">Your score over time</h2>
          <p className="text-sm text-gray-400">A line appears here once your score or rank has changed between two visits to this tab. Come back after your next pull or trade.</p>
        </section>
      )}

      {samples.length >= 2 && (
        <section className="card rounded-2xl p-5 space-y-3" aria-label="Score history">
          <h2 className="font-display text-xl font-bold text-white">Your score over time</h2>
          <ScoreChart samples={samples} />
          <p className="text-xs text-gray-600">Recorded each time you open this tab, so it starts from your first visit.</p>
        </section>
      )}

      {past}

      <div className="flex flex-wrap items-center gap-3">
        <ShareImageButton spec={shareSpec} filename={`cheesy-tcg-${session.username}-stats.png`} label="Share my stats" />
      </div>
    </div>
  );
}
