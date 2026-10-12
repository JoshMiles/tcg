import { Icon, RankMedal } from '@/app/components/Icon';
import { PendingButton } from '../admin/components/PendingButton';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActive, getSeasonOverview, getRecentPulls, timeAgo } from '@/lib/site-data';
import { getRarity } from '@/lib/rarity';
import { VARIANT_LABELS } from '@/lib/variants';
import { cardThumbUrl } from '@/lib/card-art';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { CHANNEL_NAME, CHANNEL_URL } from '@/lib/site';
import { LiveBanner } from '@/app/components/site/Live';
import { Avatar } from '@/app/components/Avatar';

export const dynamic = 'force-dynamic';




export default async function HomePage() {
  async function goToCollection(formData: FormData) {
    'use server';
    const username = String(formData.get('username') ?? '').trim().toLowerCase().replace(/^@/, '');
    if (username) redirect(`/collection/${encodeURIComponent(username)}`);
  }

  const { season } = await getActive();
  const overview = season ? await getSeasonOverview(season) : null;

  const top = overview?.rows.slice(0, 5) ?? [];
  const recent = season ? await getRecentPulls(season.collectionName, 8) : [];
  const avatars = await getAvatars([...top.map(r => r.username), ...recent.map(e => e.username)]);

  const cardByNumber = new Map(overview?.cards.map(c => [c.number, c]) ?? []);
  const rarest = overview
    ? [...overview.values.cards.values()].sort((a, b) => a.pullRate - b.pullRate).slice(0, 6)
        .map(v => ({ card: cardByNumber.get(v.number)!, v })).filter(x => x.card)
    : [];

  return (
    <div>
      {/* ── Hero ── */}
      <section className="cheese-hero cheese-holes border-b border-yellow-500/10">
        <div className="max-w-6xl mx-auto px-4 py-14 sm:py-20 grid md:grid-cols-[1.4fr_1fr] gap-10 items-center relative">
          <div className="space-y-6">
            <LiveBanner />
            {season && (
              <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> {season.name}{season.active ? ' · live now' : ''}
              </p>
            )}
            <h1 className="font-display text-5xl sm:text-6xl font-bold text-white leading-[1.05]">
              Pull cards.<br />Collect the <span className="text-yellow-300">cheese</span>.
            </h1>
            <p className="text-lg text-gray-300 max-w-xl leading-relaxed">
              The Cheesy TCG is a collectible card game played live on {CHANNEL_NAME}&rsquo;s Twitch channel — and nowhere else. Open packs on stream, hunt rare and shiny
              variants, upgrade your duplicates and climb the leaderboard.
            </p>

            <form action={goToCollection} className="flex gap-2 max-w-md">
              <input
                name="username"
                type="text"
                placeholder="Find a Twitch username…"
                autoComplete="off"
                aria-label="Twitch username"
                className="flex-1 min-w-0 bg-gray-950/80 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 text-sm"
              />
              <PendingButton type="submit" className="px-5 py-3 tcg-btn rounded-xl text-sm shrink-0">Go →</PendingButton>
            </form>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link href="/leaderboard" className="text-yellow-400 hover:text-yellow-300 font-semibold"><Icon name="trophy" className="mr-1" />Leaderboard</Link>
              <Link href="/stats" className="text-yellow-400 hover:text-yellow-300 font-semibold"><Icon name="chart" className="mr-1" />Season stats</Link>
              <Link href="/cards" className="text-yellow-400 hover:text-yellow-300 font-semibold"><Icon name="cards" className="mr-1" />Card dex</Link>
              <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:text-purple-200 font-semibold"><Icon name="tv" className="mr-1" />Watch on Twitch ↗</a>
            </div>
          </div>

          <div className="hidden md:flex justify-center">
            <img src="/brand/icon.png" alt="The Cheesy TCG mascot sipping a hot drink" width={260} height={260} className="cheese-float rounded-[2rem] ring-2 ring-yellow-500/50 shadow-glow" />
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-12 space-y-14">

        {/* ── New here? (the full explanation lives on the FAQ page) ── */}
        <section className="rind rounded-2xl p-6 sm:p-8 flex flex-wrap items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">New here?</h2>
            <p className="text-gray-400 leading-relaxed">
              Watch the stream, collect cards as packs are opened, hunt for rare and shiny versions, upgrade your duplicates and climb the leaderboard.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/faq" className="tcg-btn px-5 py-2.5 rounded-xl text-sm">How it works →</Link>
            <Link href="/faq#points" className="px-5 py-2.5 rounded-xl text-sm bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold">How points work</Link>
          </div>
        </section>

        {!season || !overview ? (
          <section className="rind rounded-2xl py-14 text-center space-y-2">
            <p className="text-4xl"><Icon name="cheese" className="w-10 h-10 text-yellow-400" /></p>
            <p className="font-display text-2xl font-bold text-white">No season is running right now</p>
            <p className="text-sm text-gray-400">Check back soon — the next batch of cards is being prepared.</p>
          </section>
        ) : (
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-8">

            {/* ── Top 5 ── */}
            <section className="space-y-4">
              <div className="flex items-end justify-between">
                <h2 className="font-display text-3xl font-bold text-white">Top collectors</h2>
                <Link href={`/leaderboard/${season.id}`} className="text-sm text-yellow-400 hover:text-yellow-300 font-semibold">Full leaderboard →</Link>
              </div>
              {top.length === 0 ? (
                <p className="rind rounded-2xl p-6 text-sm text-gray-400">No one is on the board yet — be the first!</p>
              ) : (
                <ol className="space-y-2">
                  {top.map((r, i) => (
                    <li key={r.username}>
                      <Link href={`/collection/${r.username}`} className="rind rounded-xl px-4 py-3 flex items-center gap-4 hover:brightness-125 transition">
                        <span className="w-8 text-center font-bold text-gray-500 tabular-nums"><RankMedal rank={i + 1} /></span>
                        <Avatar src={avatars[r.username] && sizeTwitchAvatar(avatars[r.username], 70)} name={r.username} className="w-9 h-9 text-sm" />
                        <span className="flex-1 min-w-0">
                          <span className="block font-semibold text-white truncate">{r.username}</span>
                          <span className="block text-xs text-gray-500">{r.uniqueCards}/{overview.values.totalCards} cards</span>
                        </span>
                        <span className="font-display text-2xl font-bold text-yellow-400 tabular-nums">{r.score.toLocaleString()}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* ── Recent pulls ── */}
            <section className="space-y-4">
              <h2 className="font-display text-3xl font-bold text-white">Recent pulls</h2>
              {recent.length === 0 ? (
                <p className="rind rounded-2xl p-6 text-sm text-gray-400">Nothing pulled yet this season.</p>
              ) : (
                <ul className="rind rounded-2xl divide-y divide-gray-800/70 overflow-hidden">
                  {recent.map(e => {
                    const card = cardByNumber.get(e.cardNumber);
                    const rarity = getRarity(e.stars);
                    return (
                      <li key={e.seq} className="px-4 py-2.5 flex items-center gap-3">
                        {card?.imageUrl ? (
                          <img src={cardThumbUrl(card.imageUrl)} alt="" loading="lazy" className="w-8 h-11 object-cover rounded" style={{ boxShadow: `0 0 0 1.5px ${rarity?.hex}` }} />
                        ) : (
                          <span className="w-8 h-11 rounded bg-gray-800" />
                        )}
                        <span className="flex-1 min-w-0 text-sm">
                          <Link href={`/collection/${e.username}`} className="font-semibold text-white hover:text-yellow-300">{e.username}</Link>{' '}
                          <span className="text-gray-400">pulled</span>{' '}
                          <span className="font-semibold" style={{ color: rarity?.hex }}>{e.cardName || `#${e.cardNumber}`}</span>
                          {e.variant && e.variant !== 'regular' && (
                            <span className="ml-1.5 text-[10px] font-extrabold uppercase tracking-wider text-fuchsia-300 border border-fuchsia-500/40 rounded-full px-1.5 py-0.5">{VARIANT_LABELS[e.variant]}</span>
                          )}
                        </span>
                        <span className="text-xs text-gray-600 shrink-0">{timeAgo(e.at)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-[11px] text-gray-600">Pulls are shown live on stream, so they&rsquo;re public here too. See the <Link href="/privacy" className="underline hover:text-gray-400">Privacy Policy</Link>.</p>
            </section>
          </div>
        )}

        {/* ── Rarest cards ── */}
        {rarest.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-end justify-between">
              <h2 className="font-display text-3xl font-bold text-white">The rarest cards</h2>
              <Link href="/cards" className="text-sm text-yellow-400 hover:text-yellow-300 font-semibold">See every card →</Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {rarest.map(({ card, v }) => {
                const rarity = getRarity(card.stars);
                return (
                  <div key={card.id} className="space-y-2">
                    <div className="holo-hover aspect-[2/3] rounded-xl overflow-hidden border-2 bg-gray-900" style={{ borderColor: rarity?.hex, boxShadow: `0 0 18px -6px ${rarity?.hex}` }}>
                      {card.imageUrl && <img src={cardThumbUrl(card.imageUrl)} alt={card.name} loading="lazy" className="w-full h-full object-cover" />}
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-white truncate">{card.name}</p>
                      <p className="text-xs text-gray-500">1 in {Math.round(1 / v.pullRate).toLocaleString()} pulls</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
