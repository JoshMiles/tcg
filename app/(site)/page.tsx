import { Icon, RankMedal } from '@/app/components/Icon';
import { UserInput } from '@/app/components/UserInput';
import { PendingButton } from '../admin/components/PendingButton';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActive, getSeasonOverview, ownersByCard } from '@/lib/site-data';
import { getCollection, listSeasons } from '@/lib/kv';
import { getHiddenUsers } from '@/lib/user-admin';
import { getSnapshot } from '@/lib/season-wrap';
import { recentPullItems } from '@/lib/home-pulls';
import { RecentPulls } from '@/app/components/site/RecentPulls';
import { PrintOfWeek } from '@/app/components/site/PrintOfWeek';
import { InstallHint } from '@/app/components/site/InstallHint';
import { getRarity } from '@/lib/rarity';
import { CardTile } from '@/app/components/CardTile';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { CHANNEL_NAME, CHANNEL_URL } from '@/lib/site';
import { LiveBanner } from '@/app/components/site/Live';
import { Avatar } from '@/app/components/Avatar';
import { getSession, loginConfigured } from '@/lib/session';
import { listOpenTrades } from '@/lib/trades';
import { seasonCountdown, viewerStanding } from '@/lib/home-data';
import { profileHref } from '@/lib/profile-url';

export const dynamic = 'force-dynamic';




export default async function HomePage() {
  async function goToCollection(formData: FormData) {
    'use server';
    const username = String(formData.get('username') ?? '').trim().toLowerCase().replace(/^@/, '');
    if (username) redirect(`/u/${encodeURIComponent(username)}`);
  }

  const [{ season }, session] = await Promise.all([getActive(), getSession()]);
  const overview = season ? await getSeasonOverview(season) : null;
  const standing = session && overview ? viewerStanding(overview.rows, session.username, overview.values.totalCards) : null;
  // Offers waiting for the viewer (a quiet nudge, so a failure just leaves it out).
  const offers = session && season
    ? (await listOpenTrades().catch(() => [])).filter(t => t.kind === 'direct' && t.to === session.username && t.seasonId === season.id && t.expiresAt > Date.now()).length
    : 0;
  const countdown = season ? seasonCountdown(season.endsAt) : null;

  const top = overview?.rows.slice(0, 8) ?? [];
  const recent = season && overview ? await recentPullItems(season, overview.cards, 8) : [];

  // No season running (none, or the latest one is not active): show how the last finished one ended (its final standings were saved when it was wrapped up).
  // (The site keeps showing the latest season after it ends, so an ended season counts too.)
  const lastEnded = season?.endedAt
    ? season
    : !season?.active ? (await listSeasons().catch(() => [])).filter(s => s.status !== 'draft' && s.endedAt).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0] ?? null : null;
  const wrap = lastEnded ? await getSnapshot(lastEnded.id) : null;
  const podium = wrap?.standings.slice(0, 3) ?? [];

  const avatars = await getAvatars([...top.map(r => r.username), ...podium.map(r => r.username), ...(session ? [session.username] : [])]);

  const cardByNumber = new Map(overview?.cards.map(c => [c.number, c]) ?? []);
  const rarest = overview
    ? [...overview.values.cards.values()].sort((a, b) => a.pullRate - b.pullRate).slice(0, 6)
        .map(v => ({ card: cardByNumber.get(v.number)!, v })).filter(x => x.card)
    : [];
  // Who holds the rarest cards (collectors an admin hid or who went private are left out).
  const owners = season && rarest.length > 0
    ? ownersByCard(await getCollection(season.collectionName), overview!.values, 1, await getHiddenUsers().catch(() => new Set<string>()))
    : new Map<number, { top: { username: string; copies: number }[]; collectors: number }>();

  return (
    <div>
      {/* ── Hero ── */}
      <section className="cheese-hero cheese-holes border-b border-yellow-500/10">
        <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 relative">
        <LiveBanner />
        <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr] gap-8 items-center">
          <div className="space-y-4 sm:space-y-5">
            {season && (
              <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-yellow-300 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" /> {season.name}{season.endedAt ? ' · ended' : countdown ? ` · ${countdown}` : season.active ? ' · in progress' : ''}
              </p>
            )}
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-white leading-[1.05]">
              Pull cards.<br />Collect the <span className="text-yellow-300">cheese</span>.
            </h1>
            <p className="text-base sm:text-lg text-gray-300 max-w-xl leading-relaxed">
              A collectible card game played live on {CHANNEL_NAME}&rsquo;s Twitch channel, and nowhere else. Pull cards, chase shinies, climb the board.
            </p>

            {!session && (
            <form action={goToCollection} className="flex gap-2 max-w-md">
                <UserInput
                  name="username"
                  type="text"
                  placeholder="Find a Twitch username…"
                  aria-label="Twitch username"
                  wrapperClassName="relative flex-1 min-w-0"
                  className="w-full bg-gray-950/80 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 text-sm"
                />
                <PendingButton type="submit" className="px-5 py-3 tcg-btn rounded-xl text-sm shrink-0">Go →</PendingButton>
              </form>
              )}
            {!session && loginConfigured() && (
              <Link href="/auth/twitch?returnTo=/" className="inline-flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-500 px-5 py-3 text-sm font-bold text-white transition-colors">
                <Icon name="user" />Log in with Twitch to see your rank
              </Link>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link href="/leaderboard" className="text-yellow-400 hover:text-yellow-300 font-semibold"><Icon name="trophy" className="mr-1" />Leaderboard</Link>
              <Link href="/stats" className="text-yellow-400 hover:text-yellow-300 font-semibold"><Icon name="chart" className="mr-1" />Season stats</Link>
              <Link href="/cards" className="text-yellow-400 hover:text-yellow-300 font-semibold"><Icon name="cards" className="mr-1" />Card dex</Link>
              <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:text-purple-200 font-semibold"><Icon name="tv" className="mr-1" />Watch on Twitch ↗</a>
            </div>
          </div>

          <div className="hidden md:flex justify-center">
            <img src="/brand/icon.png" alt="The Cheesy TCG mascot sipping a hot drink" width={190} height={190} className="cheese-float rounded-[2rem] ring-2 ring-yellow-500/50 shadow-glow" />
          </div>
        </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-12 space-y-14">

        {/* ── Your standing (signed in) ── */}
        {session && overview && (
          <section aria-label="Your standing" className="rind rounded-2xl p-5 sm:p-6 flex flex-wrap items-center gap-5">
            <Avatar src={avatars[session.username] && sizeTwitchAvatar(avatars[session.username], 70)} name={session.displayName} className="w-14 h-14 text-xl ring-2 ring-yellow-500/60" />
            <div className="min-w-0 flex-1 basis-56">
              <p className="font-display text-xl font-bold text-white truncate">Welcome back, {session.displayName}</p>
              {standing ? (
                <>
                  <p className="text-sm text-gray-400">
                    <span className="font-bold text-yellow-300">#{standing.rank}</span> of {standing.of} · <span className="tabular-nums text-white">{standing.score.toLocaleString()}</span> pts
                    {standing.ahead ? <> · <span className="tabular-nums">{standing.ahead.gap.toLocaleString()}</span> to pass <Link href={profileHref(standing.ahead.username)} className="text-yellow-400 hover:text-yellow-300">@{standing.ahead.username}</Link></> : <> · you lead the board</>}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                    <div className="h-2 w-40 max-w-full rounded-full bg-gray-950 border border-gray-800 overflow-hidden" role="progressbar" aria-valuenow={standing.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Cards collected"><div className="h-full bg-gradient-to-r from-yellow-300 to-yellow-600" style={{ width: `${standing.pct}%` }} /></div>
                    <span className="tabular-nums">{standing.uniqueCards}/{standing.totalCards} cards · {standing.totalCards - standing.uniqueCards} to find</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400">You are not on the board yet. Watch the stream and pull a card to join, or your profile may be private.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {offers > 0 && <Link href="/trade" className="inline-flex items-center gap-1.5 rounded-xl bg-purple-500/15 border border-purple-400/40 px-4 py-2 text-sm font-bold text-purple-200 hover:bg-purple-500/25"><Icon name="inbox" />{offers} trade offer{offers === 1 ? '' : 's'}</Link>}
              <Link href={profileHref(session.username)} className="tcg-btn px-4 py-2 text-sm rounded-xl"><Icon name="user" className="mr-1.5" />My profile</Link>
              <Link href="/account" className="px-4 py-2 text-sm rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold"><Icon name="trend" className="mr-1.5" />My stats</Link>
            </div>
          </section>
        )}

        {!season || !overview ? (
          <section className="rind rounded-2xl py-14 text-center space-y-2">
            <p className="text-4xl"><Icon name="cheese" className="w-10 h-10 text-yellow-400" /></p>
            <p className="font-display text-2xl font-bold text-white">No season is running right now</p>
            <p className="text-sm text-gray-400">Check back soon. The next batch of cards is being prepared.</p>
          </section>
        ) : null}

        {lastEnded && podium.length > 0 && (
          <section aria-label="Last season" className="space-y-4">
            <div className="flex items-end justify-between">
              <h2 className="font-display text-3xl font-bold text-white">How {lastEnded.name} ended</h2>
              <Link href={`/leaderboard/${lastEnded.id}`} className="text-sm text-yellow-400 hover:text-yellow-300 font-semibold">Final standings →</Link>
            </div>
            <ol className="grid gap-3 sm:grid-cols-3">
              {podium.map((r, i) => (
                <li key={r.username}>
                  <Link href={profileHref(r.username)} className="rind rounded-2xl p-5 flex flex-col items-center text-center gap-2 hover:brightness-125 transition">
                    <RankMedal rank={i + 1} />
                    <Avatar src={avatars[r.username] && sizeTwitchAvatar(avatars[r.username], 70)} name={r.username} className="w-14 h-14 text-xl" />
                    <span className="font-semibold text-white truncate max-w-full">{r.username}</span>
                    <span className="font-display text-2xl font-bold text-yellow-400 tabular-nums">{Math.round(r.score).toLocaleString()}</span>
                    <span className="text-xs text-gray-500">{r.uniqueCards} cards{r.complete ? ' · complete' : ''}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}

        {season && overview && (
          <div className="space-y-6">
            <ul className="flex flex-wrap gap-2 text-xs" aria-label="Season snapshot">
              <li className="rounded-full border border-gray-800 bg-gray-900/60 px-3 py-1 text-gray-400"><strong className="text-white tabular-nums">{overview.rows.length}</strong> collector{overview.rows.length === 1 ? '' : 's'}</li>
              <li className="rounded-full border border-gray-800 bg-gray-900/60 px-3 py-1 text-gray-400"><strong className="text-white tabular-nums">{overview.rows.reduce((n, r) => n + r.copies, 0).toLocaleString()}</strong> cards pulled</li>
              <li className="rounded-full border border-gray-800 bg-gray-900/60 px-3 py-1 text-gray-400"><strong className="text-white tabular-nums">{overview.values.totalCards}</strong> cards to find</li>
              {countdown && !season.endedAt && <li className="rounded-full border border-yellow-500/30 bg-yellow-500/5 px-3 py-1 text-yellow-300">{countdown}</li>}
            </ul>
            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-8 items-stretch">

              {/* ── Top 5 ── */}
              <section className="flex flex-col gap-4">
                <div className="flex items-end justify-between">
                  <h2 className="font-display text-3xl font-bold text-white">Top collectors</h2>
                  <Link href={`/leaderboard/${season.id}`} className="text-sm text-yellow-400 hover:text-yellow-300 font-semibold">Full leaderboard →</Link>
                </div>
                {top.length === 0 ? (
                  <p className="rind rounded-2xl p-6 text-sm text-gray-400 flex-1">No one is on the board yet. Be the first!</p>
                ) : (
                  <ol className="flex-1 flex flex-col gap-2">
                    {top.map((r, i) => (
                      <li key={r.username} className="flex-1">
                        <Link href={profileHref(r.username)} className={`rind rounded-xl px-4 py-3 h-full flex items-center gap-4 hover:brightness-125 transition ${session?.username === r.username ? 'ring-2 ring-yellow-500/70' : ''}`}>
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
                    {standing && standing.rank > top.length && (
                      <li>
                        <Link href={profileHref(session!.username)} className="rind rounded-xl px-4 py-3 flex items-center gap-4 ring-2 ring-yellow-500/70 hover:brightness-125 transition">
                          <span className="w-8 text-center font-bold text-yellow-300 tabular-nums">#{standing.rank}</span>
                          <Avatar src={avatars[session!.username] && sizeTwitchAvatar(avatars[session!.username], 70)} name={session!.displayName} className="w-9 h-9 text-sm" />
                          <span className="flex-1 min-w-0"><span className="block font-semibold text-white truncate">You</span><span className="block text-xs text-gray-500">{standing.uniqueCards}/{standing.totalCards} cards</span></span>
                          <span className="font-display text-2xl font-bold text-yellow-400 tabular-nums">{standing.score.toLocaleString()}</span>
                        </Link>
                      </li>
                    )}
                  </ol>
                )}
              </section>

              {/* ── Recent pulls ── */}
              <section className="flex flex-col gap-4">
                <div className="flex items-end justify-between">
                  <h2 className="font-display text-3xl font-bold text-white">Recent pulls</h2>
                  <Link href="/stats" className="text-sm text-yellow-400 hover:text-yellow-300 font-semibold">Season stats →</Link>
                </div>
                <div className="flex-1 flex flex-col [&>ul]:flex-1 [&>p]:flex-1">
                <RecentPulls
                  initial={recent}
                  empty={<p className="rind rounded-2xl p-6 text-sm text-gray-400">Nothing pulled yet this season. Packs are opened live on <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="text-purple-300 hover:text-purple-200 font-semibold">{CHANNEL_NAME}&rsquo;s stream</a>, and every pull shows up here.</p>}
                />
                </div>
              </section>
            </div>
            <p className="text-[11px] text-gray-600 -mt-2">Pulls are shown live on stream, so they&rsquo;re public here too. See the <Link href="/privacy" className="underline hover:text-gray-400">Privacy Policy</Link>.</p>
          </div>
        )}

        {season && overview && <PrintOfWeek settings={overview.values.settings} />}

        <InstallHint />

        {/* ── New here? (the full explanation lives on the FAQ page) ── */}
        {!standing && (
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
                  <Link key={card.id} href={`/cards?card=${card.number}`} className="block space-y-2 group">
                    {card.imageUrl ? (
                      <CardTile imageUrl={card.imageUrl} alt={card.name} className="holo-hover relative aspect-[2/3] rounded-xl overflow-hidden border-2 bg-gray-900" style={{ borderColor: rarity?.hex, boxShadow: `0 0 18px -6px ${rarity?.hex}` }} />
                    ) : (
                      <div className="holo-hover aspect-[2/3] rounded-xl overflow-hidden border-2 bg-gray-900" style={{ borderColor: rarity?.hex, boxShadow: `0 0 18px -6px ${rarity?.hex}` }} />
                    )}
                    <div className="text-center">
                      <p className="text-sm font-semibold text-white truncate">{card.name}</p>
                      <p className="text-xs text-gray-500">1 in {Math.round(1 / v.pullRate).toLocaleString()} pulls</p>
                      <p className="text-xs text-gray-600 truncate">
                        {owners.get(card.number)
                          ? <>{owners.get(card.number)!.collectors} collector{owners.get(card.number)!.collectors === 1 ? '' : 's'} · most held by {owners.get(card.number)!.top[0]?.username}</>
                          : 'Nobody has it yet'}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
