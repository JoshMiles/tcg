import { Icon } from '@/app/components/Icon';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { listOpenTrades, sweepTrades } from '@/lib/trades';
import { getUserAwards } from '@/lib/season-wrap';
import { buildAdvice, missingGain } from '@/lib/advisor';
import { recordScoreSample } from '@/lib/score-history';
import { chartPoints } from '@/lib/score-history-core';
import { getUserSettings } from '@/lib/user-settings-store';
import { SITE_URL } from '@/lib/site';
import { profileHref } from '@/lib/profile-url';
import { ShareImageButton } from '@/app/components/ShareImage';
import { ScoreChart } from './ScoreChart';
import { WantToggle } from './WantToggle';
import { getCollection } from '@/lib/kv';
import { countVariants } from '@/lib/variants';
import { getActive, getSeasonOverview } from '@/lib/site-data';
import { computeUserStats, VARIANT_LABELS } from '@/lib/user-stats';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { getRarity } from '@/lib/rarity';
import { cardThumbUrl } from '@/lib/card-art';
import { Avatar } from '@/app/components/Avatar';
import { UpgradeButton } from '@/app/components/UpgradeButton';
import { getHoloResolver } from '@/lib/holo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My Stats', robots: { index: false, follow: false } };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const { season: seasonParam } = await searchParams;
  const holoFor = await getHoloResolver();
  const session = await getSession();
  if (!session) redirect('/auth/twitch?returnTo=/account');

  await sweepTrades(); // hand back copies from offers that have run out of time
  const { season, seasons } = await getActive(seasonParam);
  const avatar = (await getAvatars([session.username]))[session.username];

  const header = (
    <div className="flex items-center gap-4">
      <Avatar src={avatar && sizeTwitchAvatar(avatar, 150)} name={session.displayName} className="w-16 h-16 text-2xl ring-2 ring-yellow-500/60" />
      <div className="min-w-0">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-white truncate">{session.displayName}</h1>
        <p className="text-sm text-gray-500">@{session.username}</p>
      </div>
    </div>
  );

  if (!season) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
        {header}
        <p className="rind rounded-2xl p-8 text-center text-gray-400">No season is running right now, so there&rsquo;s nothing to show yet.</p>
      </div>
    );
  }

  const overview = await getSeasonOverview(season);
  const collection = await getCollection(season.collectionName);
  const owned = collection[session.username] ?? [];
  // Upgrades only make sense in the season that is running; an earlier season is a read-only look back.
  const live = season.active && !season.endedAt;
  const s = computeUserStats(overview, session.username, owned, collection, { upgrades: live });
  const upgradesOn = live && overview.cards.some(c => c.pack.upgradesEnabled);

  const [prefs, awards, openTrades, history] = await Promise.all([
    getUserSettings(session.username),
    getUserAwards(session.username).catch(() => []),
    live ? listOpenTrades().catch(() => []) : Promise.resolve([]),
    live && s.copies > 0 ? recordScoreSample(session.username, season.id, Math.round(s.score), s.rank) : Promise.resolve([]),
  ]);
  const offers = openTrades.filter(t => t.kind === 'direct' && t.to === session.username && t.seasonId === season.id && t.expiresAt > Date.now()).length;
  const samples = chartPoints(history);

  const ownedNumbers = new Set(countVariants(owned).keys());
  const missing = overview.cards
    .filter(c => !ownedNumbers.has(c.number))
    .map(c => ({ number: c.number, name: c.name, stars: c.stars, pullRate: overview.values.cards.get(c.number)?.pullRate ?? 0, value: overview.values.cards.get(c.number)?.values.regular ?? 0, imageUrl: c.imageUrl }));
  const above = s.rank && s.rank > 1 ? overview.rows[s.rank - 2] : null;
  const best = s.upgradable[0];
  const advice = buildAdvice({
    uniqueCards: s.uniqueCards, totalCards: s.totalCards, complete: s.complete, maxCompletionBonus: s.maxCompletionBonus, completeSetBonusValue: s.completeSetBonusValue,
    bestUpgrade: best ? { cardName: best.card.name, fromLabel: VARIANT_LABELS[best.from], toLabel: VARIANT_LABELS[best.to], gain: best.gain, cost: best.cost } : undefined,
    missing, nextRank: above ? { username: above.username, gap: Math.max(1, Math.ceil(above.score - s.score)) } : null,
  });
  const missingTop = [...missing].sort((a, b) => missingGain(b, s) - missingGain(a, s)).slice(0, 8);
  const wanted = new Set(prefs.wanted);

  const shareSpec = {
    title: session.displayName,
    subtitle: `@${session.username} · ${season.name}`,
    stats: [s.rank ? `#${s.rank} rank` : 'Unranked', `${Math.round(s.score).toLocaleString()} pts`, `${s.uniqueCards}/${s.totalCards} cards`],
    cards: s.topCopies.slice(0, 6).map(t => ({
      src: (t.variant === 'full' || t.variant === 'shiny') && t.card.fullArtImageUrl ? t.card.fullArtImageUrl : t.card.imageUrl,
      name: t.card.name, hex: getRarity(t.card.stars)?.hex, tag: t.variant === 'regular' ? undefined : t.variant === 'reverse' ? 'RH' : t.variant === 'full' ? 'FA' : 'SH',
    })),
    footer: SITE_URL.replace(/^https?:\/\//, ''),
  };

  const tiles = [
    { label: 'Score', value: s.score.toLocaleString(), sub: 'points' },
    { label: 'Rank', value: s.rank ? `#${s.rank}` : '—', sub: s.rank ? `of ${s.players}` : 'not on the board yet' },
    { label: 'Cards', value: `${s.uniqueCards}/${s.totalCards}`, sub: `${s.completionPct}% complete` },
    { label: 'Copies', value: s.copies.toLocaleString(), sub: 'total owned' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {header}
        <div className="flex gap-2">
          {offers > 0 && <Link href="/trade" className="inline-flex items-center gap-1.5 rounded-xl bg-purple-500/15 border border-purple-400/40 px-4 py-2 text-sm font-bold text-purple-200 hover:bg-purple-500/25"><Icon name="inbox" />{offers} offer{offers === 1 ? '' : 's'}</Link>}
          <Link href={profileHref(session.username)} className="tcg-btn px-4 py-2 text-sm rounded-xl"><Icon name="user" className="mr-1.5" />My profile</Link>
          <Link href={`/leaderboard/${season.id}`} className="px-4 py-2 text-sm rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold"><Icon name="trophy" className="mr-1.5" />Leaderboard</Link>
        </div>
      </div>
      <div className="-mt-4 space-y-2">
        <p className="text-sm text-gray-500">{season.name}{season.endedAt ? ' · ended (a look back)' : season.active ? ' · in progress' : ''}</p>
        {seasons.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {seasons.map(x => (
              <Link key={x.id} href={`/account?season=${x.id}`} className={`px-3 py-1 rounded-full text-xs whitespace-nowrap border transition-colors ${x.id === season.id ? 'bg-yellow-500 text-gray-950 border-yellow-500 font-semibold' : 'text-gray-400 border-gray-700 hover:text-white'}`}>{x.name}</Link>
            ))}
          </div>
        )}
      </div>

      {s.copies === 0 ? (
        <div className="rind rounded-2xl py-14 text-center space-y-2">
          <p className="text-4xl"><Icon name="cheese" className="w-10 h-10 text-yellow-400" /></p>
          <p className="font-display text-2xl font-bold text-white">Your collection is empty</p>
          <p className="text-sm text-gray-400">Watch the stream — cards are pulled live. They&rsquo;ll appear here as you collect them.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {tiles.map(t => (
              <div key={t.label} className="rind rounded-xl p-4 space-y-0.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{t.label}</p>
                <p className="font-display text-3xl font-bold text-white tabular-nums">{t.value}</p>
                <p className="text-xs text-gray-500">{t.sub}</p>
              </div>
            ))}
          </div>

          {advice.length > 0 && (
            <section className="rind rounded-2xl p-5 space-y-3" aria-label="What to do next">
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

          {samples.length >= 2 && (
            <section className="rind rounded-2xl p-5 space-y-3" aria-label="Score history">
              <h2 className="font-display text-xl font-bold text-white">Your score over time</h2>
              <ScoreChart samples={samples} />
              <p className="text-xs text-gray-600">Recorded each time you open this page, so it starts from your first visit.</p>
            </section>
          )}

          {/* Where the score comes from */}
          <section className="rind rounded-2xl p-5 space-y-3">
            <h2 className="font-display text-xl font-bold text-white">Where your points come from</h2>
            <dl className="divide-y divide-gray-800/70 text-sm">
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-gray-300">Your cards <span className="text-gray-600">· every copy you own</span></dt>
                <dd className="font-semibold text-white tabular-nums">{s.cardPoints.toLocaleString()}</dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-gray-300">Completion bonus <span className="text-gray-600">· {s.completionPct}% of the set (up to {s.maxCompletionBonus.toLocaleString()})</span></dt>
                <dd className="font-semibold text-emerald-300 tabular-nums">+{s.completionBonus.toLocaleString()}</dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="text-gray-300">
                  Complete collection bonus{' '}
                  <span className="text-gray-600">· {s.complete ? 'you own every card!' : `own every card to earn +${s.completeSetBonusValue.toLocaleString()}`}</span>
                </dt>
                <dd className={`font-semibold tabular-nums ${s.complete ? 'text-emerald-300' : 'text-gray-600'}`}>
                  {s.complete ? '+' : ''}{s.setBonus.toLocaleString()}
                </dd>
              </div>
              <div className="py-2.5 flex items-center justify-between gap-4">
                <dt className="font-semibold text-white">Total</dt>
                <dd className="font-display text-xl font-bold text-yellow-400 tabular-nums">{s.score.toLocaleString()}</dd>
              </div>
            </dl>
            {s.missing > 0 && (
              <p className="text-xs text-gray-500 leading-relaxed">
                {s.missing} card{s.missing === 1 ? '' : 's'} to go for a complete collection. Each new card adds its own points <em>and</em> raises your completion bonus.
              </p>
            )}
          </section>

          {/* Upgrades you can afford */}
          {upgradesOn && (
            <section id="upgrades" className="rind rounded-2xl p-5 space-y-3">
              <h2 className="font-display text-xl font-bold text-white"><Icon name="arrowUp" className="mr-2 text-yellow-400" />Ready to upgrade</h2>
              {s.upgradable.length === 0 ? (
                <p className="text-sm text-gray-400">
                  Nothing yet. Collect duplicates of the same card and version — you&rsquo;ll see what you can upgrade here.
                </p>
              ) : (
                <ul className="divide-y divide-gray-800/70">
                  {s.upgradable.map(u => {
                    const rarity = getRarity(u.card.stars);
                    return (
                      <li key={`${u.card.id}-${u.from}`} className="py-2.5 flex items-center gap-3">
                        {u.card.imageUrl ? (
                          <img src={cardThumbUrl(u.card.imageUrl)} alt="" loading="lazy" className="w-9 h-12 object-cover rounded" style={{ boxShadow: `0 0 0 1.5px ${rarity?.hex}` }} />
                        ) : <span className="w-9 h-12 rounded bg-gray-800" />}
                        <span className="flex-1 min-w-0 text-sm">
                          <span className="block font-semibold text-white truncate">{u.card.name}</span>
                          <span className="block text-xs text-gray-400">
                            {u.cost}× {VARIANT_LABELS[u.from]} → 1 {VARIANT_LABELS[u.to]}
                            <span className="text-gray-600"> · you have {u.have}</span>
                          </span>
                        </span>
                        <span
                          className={`text-xs font-bold tabular-nums shrink-0 ${u.gain >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
                          title="Projected change to your score, including the serial bonuses it spends"
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
                Upgrades are permanent — the copies you spend are destroyed. The newest serial numbers are spent first, and the new copy gets the next free serial of its version. The points shown are projected with the serial bonuses included, so they can occasionally be negative.
              </p>
            </section>
          )}

          {missingTop.length > 0 && (
            <section id="missing" className="rind rounded-2xl p-5 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl font-bold text-white"><Icon name="search" className="mr-2 text-yellow-400" />Cards you still need</h2>
                <Link href="/cards" className="text-xs text-yellow-500 hover:text-yellow-300">Card Dex →</Link>
              </div>
              <ul className="divide-y divide-gray-800/70">
                {missingTop.map(m => {
                  const rarity = getRarity(m.stars);
                  return (
                    <li key={m.number} className="py-2 flex items-center gap-3">
                      {m.imageUrl ? <img src={cardThumbUrl(m.imageUrl)} alt="" loading="lazy" className="w-8 h-11 object-cover rounded opacity-70" style={{ boxShadow: `0 0 0 1.5px ${rarity?.hex}` }} /> : <span className="w-8 h-11 rounded bg-gray-800" />}
                      <Link href={`/cards?card=${m.number}`} className="flex-1 min-w-0 hover:text-yellow-200">
                        <span className="block text-sm font-semibold text-white truncate">{m.name}</span>
                        <span className="block text-xs" style={{ color: rarity?.hex }}>{'★'.repeat(m.stars)} {rarity?.label} · {m.pullRate > 0 ? `1 in ${Math.round(1 / m.pullRate).toLocaleString()}` : '—'}</span>
                      </Link>
                      <span className="text-xs font-bold text-emerald-300 tabular-nums shrink-0" title="Its points plus its share of the completion bonus">+{missingGain(m, s).toLocaleString()}</span>
                      <WantToggle number={m.number} initial={wanted.has(m.number)} />
                    </li>
                  );
                })}
              </ul>
              {missing.length > missingTop.length && <p className="text-xs text-gray-500">Showing the {missingTop.length} worth the most. {missing.length - missingTop.length} more still to find.</p>}
            </section>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            <section className="rind rounded-2xl p-5 space-y-4">
              <h2 className="font-display text-xl font-bold text-white">Completion by rarity</h2>
              {s.rarity.map(r => (
                <div key={r.stars} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold" style={{ color: r.hex }}>{'★'.repeat(r.stars)} {r.label}</span>
                    <span className="text-gray-500 tabular-nums">{r.owned}/{r.total}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(r.owned / r.total) * 100}%`, backgroundColor: r.hex }} />
                  </div>
                </div>
              ))}
              {s.missing > 0 && <p className="text-xs text-gray-500">{s.missing} card{s.missing === 1 ? '' : 's'} still to find.</p>}
            </section>

            <section className="rind rounded-2xl p-5 space-y-4">
              <h2 className="font-display text-xl font-bold text-white">Most valuable copies</h2>
              <ul className="divide-y divide-gray-800/70">
                {s.topCopies.map(t => {
                  const rarity = getRarity(t.card.stars);
                  return (
                    <li key={`${t.card.id}-${t.variant}`} className="py-2 flex items-center gap-3">
                      {t.card.imageUrl ? (
                        <img src={cardThumbUrl(t.card.imageUrl)} alt="" loading="lazy" className="w-8 h-11 object-cover rounded" style={{ boxShadow: `0 0 0 1.5px ${rarity?.hex}` }} />
                      ) : <span className="w-8 h-11 rounded bg-gray-800" />}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-white truncate">{t.card.name}</span>
                        <span className="block text-xs text-gray-500">{VARIANT_LABELS[t.variant]}{t.count > 1 ? ` ×${t.count}` : ''}</span>
                      </span>
                      <span className="font-display text-lg font-bold text-yellow-400 tabular-nums">{t.value.toLocaleString()}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          {upgradesOn && (
            <section className="rind rounded-2xl p-5 space-y-3">
              <h2 className="font-display text-xl font-bold text-white">Your versions</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(['regular', 'reverse', 'full', 'shiny'] as const).map(v => (
                  <div key={v} className="rounded-xl bg-gray-950/50 border border-gray-800 p-3">
                    <p className="text-xs text-gray-500">{VARIANT_LABELS[v]}</p>
                    <p className="font-display text-2xl font-bold text-white tabular-nums">{s.variants[v]}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {awards.length > 0 && (
            <section className="rind rounded-2xl p-5 space-y-3" aria-label="Awards">
              <h2 className="font-display text-xl font-bold text-white"><Icon name="trophy" className="mr-2 text-yellow-400" />Awards</h2>
              <ul className="flex flex-wrap gap-1.5">
                {awards.map((a, i) => (
                  <li key={`${a.seasonId}-${a.award.id}-${i}`}>
                    <Link href={`/leaderboard/${a.seasonId}`} title={a.award.detail} className="inline-flex items-center gap-1 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-0.5 text-[11px] font-bold text-yellow-300 hover:bg-yellow-500/20">
                      <Icon name={a.award.icon} className="w-3 h-3" />{a.award.title}<span className="text-yellow-500/70 font-semibold">· {a.seasonName}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <ShareImageButton spec={shareSpec} filename={`cheesy-tcg-${session.username}-stats.png`} label="Share my stats" />
            <Link href="/settings" className="text-xs text-gray-500 hover:text-gray-300"><Icon name="settings" className="mr-1" />Settings</Link>
          </div>
        </>
      )}
    </div>
  );
}
