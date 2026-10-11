import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getCollection } from '@/lib/kv';
import { getActive, getSeasonOverview } from '@/lib/site-data';
import { computeUserStats, VARIANT_LABELS } from '@/lib/user-stats';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { getRarity } from '@/lib/rarity';
import { cardThumbUrl } from '@/lib/card-art';
import { Avatar } from '@/app/components/Avatar';
import { UpgradeButton } from '@/app/components/UpgradeButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'My Stats' };

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect('/auth/twitch?returnTo=/account');

  const { season } = await getActive();
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
  const owned = (await getCollection(season.collectionName))[session.username] ?? [];
  const s = computeUserStats(overview, session.username, owned);
  const upgradesOn = overview.cards.some(c => c.pack.upgradesEnabled);

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
          <Link href={`/collection/${session.username}`} className="tcg-btn px-4 py-2 text-sm rounded-xl">🃏 My collection</Link>
          <Link href={`/leaderboard/${season.id}`} className="px-4 py-2 text-sm rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold">🏆 Leaderboard</Link>
        </div>
      </div>
      <p className="text-sm text-gray-500 -mt-4">{season.name}{season.active ? ' · live' : ''}</p>

      {s.copies === 0 ? (
        <div className="rind rounded-2xl py-14 text-center space-y-2">
          <p className="text-4xl">🧀</p>
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

          {/* Upgrades you can afford */}
          {upgradesOn && (
            <section className="rind rounded-2xl p-5 space-y-3">
              <h2 className="font-display text-xl font-bold text-white">⬆️ Ready to upgrade</h2>
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
                        <span className="text-xs font-bold text-emerald-300 tabular-nums shrink-0">+{u.gain.toLocaleString()} pts</span>
                        <UpgradeButton cardNumber={u.card.number} from={u.from} to={u.to} have={u.have} cost={u.cost} />
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-xs text-gray-500 leading-relaxed">
                Upgrades are permanent — the copies you spend are destroyed. That makes the card scarcer, which can raise the value of the copies you keep (including lower versions).
                It also nudges the season-wide average, so other cards&rsquo; values can shift slightly.
              </p>
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
        </>
      )}
    </div>
  );
}
