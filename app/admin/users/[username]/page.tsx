import { staffPage } from '@/lib/staff-guard';
import { PendingButton } from '@/app/components/PendingButton';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { listSeasons, getUserCards, getPackCards, getPack, getUserProfile } from '@/lib/kv';
import type { Season, Pack, Card } from '@/lib/types';
import { getRarity } from '@/lib/rarity';
import { countPulls } from '@/lib/collection';
import { VARIANTS, VARIANT_LABELS, countVariants, encodeEntry } from '@/lib/variants';
import { ConfirmButton } from '../../components/ConfirmButton';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { Avatar } from '@/app/components/Avatar';
import { CardTile } from '@/app/components/CardTile';
import { getActivity } from '@/lib/activity';
import { plainText } from '@/lib/activity-view';
import { getUserAudit } from '@/lib/audit';
import { getSeasonLeaderboard } from '@/lib/leaderboard';
import { getLastSeen } from '@/lib/stats';
import { tradesForUser } from '@/lib/trades';
import { describeItems } from '@/lib/trade-core';
import { listUserSnapshots, SUGGESTED_TAGS } from '@/lib/user-admin';
import { formatUntil, liveUntil, tradeBlockedNow } from '@/lib/restriction';
import { updateUserProfile, removeUserCard, resetUserSeason, resetUser, deleteUser } from '../../actions/users';
import { PageTabs, pickTab } from '../../components/PageTabs';
import { UserTesterPicker } from '../../settings/TesterControls';
import { getTester } from '@/lib/access';
import { GrantPanel, ModerationPanel, PullLimitPanel, TagsEditor, ToolsPanel, TradesPanel, type TradeLine } from './UserPanels';
import { Panel, Tile } from '../../components/ui';
import { getStreamBuff, getUserPullLimit } from '@/lib/pull-limit';
import { effectiveLimit, streamBuffAmount } from '@/lib/pull-limit-core';
import { pullRole, roleLimitOf } from '@/lib/mixitup-core';
import { currentStreamKey, getMixItUpSettings, pullsUsedThisStream } from '@/lib/mixitup';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

// The tab says whose page it is.
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const name = decodeURIComponent((await params).username).toLowerCase();
  return { title: `${name} · Admin`, robots: { index: false } };
}

type SeasonEntry = {
  season: Season;
  ownedNumbers: number[];
  countMap: Map<number, number>;
  variantMap: Map<number, ReturnType<typeof countVariants> extends Map<number, infer V> ? V : never>;
  packs: Array<{ pack: Pack; cards: Card[] }>;
};

function ago(t: number | null | undefined, now: number): string {
  if (!t) return 'never';
  const m = Math.floor((now - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

export default async function UserDetailPage({
  params, searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ compare?: string; tab?: string }>;
}) {
  await staffPage('admin');
  const { username: rawUsername } = await params;
  const { compare: compareRaw, tab: tabParam } = await searchParams;
  const username = rawUsername.toLowerCase();
  const compareWith = compareRaw?.toLowerCase().replace(/^@/, '').trim() || '';
  const [pullRec, mix, pullsUsed, streamBuff, streamKey] = await Promise.all([getUserPullLimit(username), getMixItUpSettings(), pullsUsedThisStream(username), getStreamBuff(), currentStreamKey()]);
  const roleDefault = roleLimitOf(mix, pullRole(undefined, username));
  const effective = effectiveLimit(roleDefault, pullRec, Date.now(), streamBuffAmount(streamBuff, streamKey));

  const [profile, seasons, avatars, audit, snaps, activity, lastSeenMap, trades] = await Promise.all([
    getUserProfile(username),
    listSeasons(),
    getAvatars([username]),
    getUserAudit(username, 30),
    listUserSnapshots(username),
    getActivity({ limit: 500, includeTest: true }),
    getLastSeen(),
    tradesForUser(username).catch(() => ({ incoming: [], outgoing: [], board: [], recent: [] })),
  ]);

  const collections = await Promise.all(seasons.map(s => getUserCards(s.collectionName, username)));

  const seasonEntries: SeasonEntry[] = await Promise.all(
    seasons.map(async (season, i) => {
      const ownedNumbers = collections[i];
      const packData = await Promise.all(
        season.packIds.map(async packId => {
          const [pack, cards] = await Promise.all([getPack(packId), getPackCards(packId)]);
          return pack ? { pack, cards } : null;
        })
      );
      return {
        season,
        ownedNumbers,
        countMap: countPulls(ownedNumbers),
        variantMap: countVariants(ownedNumbers),
        packs: packData.filter((p): p is { pack: Pack; cards: Card[] } => p !== null),
      };
    })
  );

  const hasAnyCards = seasonEntries.some(e => e.ownedNumbers.length > 0);
  if (!hasAnyCards && !profile) notFound();

  const activeSeason = seasons.find(s => s.active && s.status === 'published') ?? null;
  const activeEntry = seasonEntries.find(e => e.season.id === activeSeason?.id);
  const board = activeSeason ? await getSeasonLeaderboard(activeSeason).catch((): null => null) : null;
  const rankIdx = board ? board.rows.findIndex(r => r.username === username) : -1;
  const myRow = rankIdx >= 0 && board ? board.rows[rankIdx] : null;

  const allCards = new Map<string, Card>();
  const cardNameByKey = new Map<number, string>();
  for (const e of seasonEntries) for (const p of e.packs) for (const c of p.cards) { allCards.set(c.id, c); if (!cardNameByKey.has(c.number)) cardNameByKey.set(c.number, c.name); }
  const nameOf = (n: number) => cardNameByKey.get(n);

  const now = Date.now();
  const displayName = profile?.displayName || username;
  const totalCards = seasonEntries.reduce((s, e) => s + e.countMap.size, 0);
  const totalPulls = seasonEntries.reduce((s, e) => s + e.ownedNumbers.length, 0);
  const activeSeasons = seasonEntries.filter(e => e.ownedNumbers.length > 0).length;
  const lastSeen = Math.max(lastSeenMap[username] ?? 0, activity.events.find(e => e.username === username)?.at ?? 0) || null;
  const flags = profile?.flags;

  const timeline = activity.events.filter(e => e.username === username).slice(0, 40);

  // Trades
  const seasonName = (id: string) => seasons.find(s => s.id === id)?.name ?? id;
  // Each trade is named from its own season's cards (seasonEntries already holds every season's packs).
  const toLine = (t: (typeof trades.outgoing)[number], open: boolean): TradeLine => {
    const names = new Map<number, string>();
    for (const p of seasonEntries.find(e => e.season.id === t.seasonId)?.packs ?? []) for (const c of p.cards) names.set(c.number, c.name);
    const tradeNameOf = (n: number) => names.get(n);
    return {
      id: t.id, status: t.status, open, kind: t.kind,
      other: t.from === username ? (t.to ?? null) : t.from,
      mine: t.from === username,
      give: describeItems(t.give, tradeNameOf), get: describeItems(t.get, tradeNameOf),
      at: t.resolvedAt ?? t.createdAt, expiresAt: t.expiresAt, seasonId: t.seasonId, season: seasonName(t.seasonId),
    };
  };
  const tradeLines: TradeLine[] = [
    ...trades.outgoing.map(t => toLine(t, true)),
    ...trades.incoming.map(t => toLine(t, true)),
    ...trades.recent.map(t => toLine(t, false)),
  ];

  // Grantable cards: active season only.
  const grantCards = (activeEntry?.packs ?? []).flatMap(p => p.cards.map(c => ({ number: c.number, name: c.name, stars: c.stars, pack: p.pack.name })));
  const grantUpgrades = !!activeEntry?.packs.some(p => p.pack.upgradesEnabled);

  // Compare with another viewer, active season.
  let compare: { name: string; theyLack: string[]; iLack: string[]; swaps: number } | null = null;
  if (compareWith && compareWith !== username && activeEntry && activeSeason) {
    const theirEntries = await getUserCards(activeSeason.collectionName, compareWith);
    const theirs = new Set(theirEntries.map(e => e % 1_000_000));
    const mine = new Set(activeEntry.ownedNumbers.map(e => e % 1_000_000));
    const dupMine = [...activeEntry.countMap.entries()].filter(([, n]) => n > 1).map(([k]) => k % 1_000_000);
    const theirCounts = countPulls(theirEntries);
    const dupTheirs = [...theirCounts.entries()].filter(([, n]) => n > 1).map(([k]) => k % 1_000_000);
    const every = grantCards.map(c => c.number);
    const iLack = every.filter(n => !mine.has(n) && theirs.has(n));
    const theyLack = every.filter(n => !theirs.has(n) && mine.has(n));
    const swaps = Math.min(iLack.filter(n => dupTheirs.includes(n)).length, theyLack.filter(n => dupMine.includes(n)).length);
    compare = { name: compareWith, iLack: iLack.map(n => nameOf(n) ?? `#${n}`), theyLack: theyLack.map(n => nameOf(n) ?? `#${n}`), swaps };
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: 'user' },
    { id: 'collection', label: 'Collection', icon: 'cards', count: totalCards },
    { id: 'trades', label: 'Trades', icon: 'trade', count: tradeLines.length || undefined },
    { id: 'grant', label: 'Grant', icon: 'gift' },
    { id: 'admin', label: 'Admin', icon: 'shield' },
  ] as const;
  const tab = pickTab(tabs, tabParam);

  const updateProfile = updateUserProfile.bind(null, username);
  const resetAll = resetUser.bind(null, username);
  const deleteThisUser = deleteUser.bind(null, username);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/users" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">← Users</Link>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Avatar src={avatars[username] && sizeTwitchAvatar(avatars[username], 150)} name={displayName} className="w-16 h-16 text-2xl ring-2 ring-yellow-500/60" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-bold text-white">{displayName}</h1>
            {profile?.twitchId && <span className="text-xs px-1.5 py-0.5 bg-purple-900/40 text-purple-400 rounded-md">Twitch</span>}
            {tradeBlockedNow(flags) && <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-red-900/40 text-red-300 rounded-md"><Icon name="ban" className="w-3 h-3" />No trading{liveUntil(flags) ? ` until ${formatUntil(liveUntil(flags)!)}` : ''}</span>}
            {flags?.hideFromBoard && <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-amber-900/40 text-amber-300 rounded-md"><Icon name="shield" className="w-3 h-3" />Hidden</span>}
            {myRow?.complete && <span className="text-xs px-1.5 py-0.5 bg-yellow-900/40 text-yellow-300 rounded-md">Complete</span>}
          </div>
          {displayName.toLowerCase() !== username && <p className="text-sm text-gray-500 font-mono mt-0.5">{username}</p>}
        </div>
        <div className="ml-auto shrink-0 flex gap-2">
          <a href={`/collection/${username}`} target="_blank" className="px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors">↗ Public Collection</a>
          <Link href={`/admin?gift=${encodeURIComponent(username)}`} className="px-3 py-2 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl transition-colors"><Icon name="gift" className="mr-1" />Gift packs</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile label="Rank" value={myRow ? `#${rankIdx + 1}` : '-'} sub={activeSeason ? (myRow ? `of ${board?.rows.length} in ${activeSeason.name}` : 'not ranked') : 'no active season'} />
        <Tile label="Score" value={myRow ? Math.round(myRow.score).toLocaleString() : '-'} sub={myRow ? `${Math.round(myRow.cardPoints).toLocaleString()} from cards` : undefined} />
        <Tile label="Unique cards" value={totalCards} sub={`${activeSeasons} season${activeSeasons === 1 ? '' : 's'}`} />
        <Tile label="Editions held" value={totalPulls} />
        <Tile label="Last seen" value={ago(lastSeen, now)} />
        <Tile label="Joined" value={profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-GB', { timeZone: 'UTC' }) : '-'} sub={`${tradeLines.filter(l => l.status === 'accepted').length} trades done`} />
      </div>

      <PageTabs tabs={tabs} active={tab} base={`/admin/users/${encodeURIComponent(username)}`} keep={{ compare: compareWith || undefined }} label="User sections" />


      {tab === 'profile' && (
        <>
      <Panel id="overview" title="Profile" hint="Tags and notes are only visible to admins.">
        <TagsEditor username={username} initial={profile?.tags ?? []} suggestions={SUGGESTED_TAGS} />
        <form action={updateProfile} className="grid md:grid-cols-3 gap-4">
          <fieldset className="fieldset">
            <legend className="fieldset-legend"><label htmlFor="profile-displayName">Display name</label></legend>
            <input id="profile-displayName" name="displayName" maxLength={60} defaultValue={profile?.displayName || username} className="input w-full" />
          </fieldset>
          <fieldset className="fieldset">
            <legend className="fieldset-legend"><label htmlFor="profile-twitchId">Twitch ID</label></legend>
            <input id="profile-twitchId" readOnly value={profile?.twitchId || '-'} className="input w-full" />
          </fieldset>
          <fieldset className="fieldset md:col-span-3">
            <legend className="fieldset-legend"><label htmlFor="profile-notes">Private notes</label></legend>
            <textarea id="profile-notes" name="notes" maxLength={2000} rows={3} defaultValue={profile?.notes || ''} placeholder="Anything worth remembering about this viewer" className="textarea w-full" />
          </fieldset>
          <div className="md:col-span-3"><PendingButton type="submit" className="px-4 py-2 btn btn-primary rounded-xl text-sm transition-colors">Save Profile</PendingButton></div>
        </form>
      </Panel>

      <Panel id="activity" title="Timeline" hint="Their latest events (pulls, upgrades, grants, trades). The live log keeps the newest 500 events across everyone.">
        {timeline.length === 0 ? <p className="text-sm text-gray-600">Nothing recent.</p> : (
          <ul className="divide-y divide-gray-800/60 rounded-lg border border-gray-800 overflow-hidden">
            {timeline.map(e => (
              <li key={e.seq} className="px-4 py-2 flex items-center gap-4 text-sm">
                <span className="text-gray-300 truncate">{plainText(e, nameOf)}{e.test && <span className="badge badge-xs badge-warning ml-2 align-middle">Test</span>}</span>
                <span className="ml-auto text-xs text-gray-600 shrink-0">{ago(e.at, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

        </>
      )}

      {tab === 'trades' && (
        <>
      <Panel id="trades" title="Trades" hint="Open offers can be cancelled here; the escrowed cards go back to their owner.">
        <TradesPanel username={username} lines={tradeLines} />
      </Panel>

        </>
      )}

      {tab === 'collection' && (
        <>
      {/* Collection per season */}
      <div id="collection" className="space-y-6 scroll-mt-16">
        {seasonEntries.filter(e => e.packs.length > 0).map(({ season, ownedNumbers, countMap, variantMap, packs }) => {
          const totalSeasonCards = packs.reduce((s, p) => s + p.cards.length, 0);
          const pct = totalSeasonCards > 0 ? Math.round(countMap.size / totalSeasonCards * 100) : 0;
          const resetSeason = resetUserSeason.bind(null, username, season.collectionName);
          return (
            <section key={season.id} className="card rounded-2xl overflow-hidden">
              <div className="holo-strip" />
              <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-xl font-bold text-white">{season.name}</h2>
                    {season.active && <span className="text-xs px-1.5 py-0.5 bg-green-900/40 text-green-400 rounded-md">Active</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{countMap.size} / {totalSeasonCards} collected · {pct}%{ownedNumbers.length > countMap.size && ` · ${ownedNumbers.length} total pulls`}</p>
                </div>
                {ownedNumbers.length > 0 && (
                  <form action={resetSeason}>
                    <ConfirmButton
                      title="Reset this season?"
                      confirmLabel="Reset season"
                      message={<>Clear <strong className="text-white">{displayName}</strong>&apos;s cards for <strong className="text-white">{season.name}</strong>? A restore point is kept for 14 days (see Restore &amp; merge).</>}
                      className="px-3 py-1.5 text-xs text-red-500 hover:text-red-300 hover:bg-red-950/40 rounded-lg transition-colors shrink-0"
                    >
                      Reset Season
                    </ConfirmButton>
                  </form>
                )}
              </div>
              <div className="p-6 space-y-6">
                {packs.map(({ pack, cards }) => {
                  const ownedInPack = cards.filter(c => countMap.has(c.number)).length;
                  return (
                    <div key={pack.id}>
                      {packs.length > 1 && <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">{pack.name} · {ownedInPack} / {cards.length}</p>}
                      <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-3">
                        {cards.map(card => {
                          const count = countMap.get(card.number) ?? 0;
                          const owned = count > 0;
                          const color = getRarity(card.stars)?.hex ?? '#fbbf24';
                          const counts = variantMap.get(card.number);
                          return (
                            <div key={card.id} className="relative group">
                              {owned && card.imageUrl ? (
                                <CardTile imageUrl={card.imageUrl} alt={card.name} className="aspect-2/3 rounded-lg overflow-hidden bg-gray-800 holo-hover border-2" style={{ borderColor: color, boxShadow: `0 0 12px -4px ${color}` }} />
                              ) : (
                                <div className={`aspect-2/3 rounded-lg overflow-hidden bg-gray-800 ${owned ? 'holo-hover border-2' : 'border border-dashed border-gray-700'}`} style={owned ? { borderColor: color, boxShadow: `0 0 12px -4px ${color}` } : undefined}>
                                  <div className="w-full h-full flex items-center justify-center text-gray-700 text-xs font-bold border border-gray-700/50 rounded-lg">{card.number}</div>
                                </div>
                              )}
                              {count > 1 && <div className="absolute top-1 left-1 bg-gray-950/85 border border-yellow-500/50 text-yellow-300 text-[10px] font-extrabold px-1.5 rounded-full leading-tight pointer-events-none z-10">×{count}</div>}
                              {owned && counts && (
                                <div className="absolute -top-1.5 -right-1.5 hidden group-hover:flex flex-col gap-1 z-10">
                                  {VARIANTS.filter(v => counts[v] > 0).map(v => (
                                    <form key={v} action={removeUserCard.bind(null, username, season.collectionName, encodeEntry(card.number, v))}>
                                      <ConfirmButton
                                        title="Remove card?"
                                        confirmLabel="Remove one"
                                        message={<>Remove one edition of <strong className="text-white">{v === 'regular' ? '' : `${VARIANT_LABELS[v]} `}{card.name}</strong> from <strong className="text-white">{displayName}</strong>&apos;s collection?</>}
                                        className="min-w-5 h-5 px-1 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center gap-0.5 text-[10px] font-bold leading-none transition-colors"
                                      >
                                        {v === 'regular' ? '' : `${VARIANT_LABELS[v].split(' ')[0]} `}×{counts[v]}
                                      </ConfirmButton>
                                    </form>
                                  ))}
                                </div>
                              )}
                              {owned && <p className="text-center mt-1 text-[9px] leading-tight truncate px-0.5 text-gray-600 group-hover:text-gray-400 transition-colors" title={card.name}>{card.name}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {!hasAnyCards && <div className="card rounded-2xl py-16 text-center"><p className="text-gray-500 text-sm">No cards pulled yet</p></div>}
      </div>

        </>
      )}

      {tab === 'grant' && (
        <>
      <Panel id="grant" title="Grant cards & packs" hint={activeSeason ? `Into ${activeSeason.name}. Pick several cards, choose a version and how many editions of each.` : 'There is no active season.'}>
        {activeSeason ? <GrantPanel username={username} cards={grantCards} upgrades={grantUpgrades} /> : <p className="text-sm text-gray-600">Activate a season first.</p>}
      </Panel>

        </>
      )}

      {tab === 'admin' && (
        <>
      <Panel id="moderation" title="Moderation" hint="Restrictions apply immediately across the website and the Twitch panel.">
        <ModerationPanel username={username} initial={{ noTrading: tradeBlockedNow(flags), until: liveUntil(flags), hideFromBoard: !!flags?.hideFromBoard, reason: flags?.reason ?? '', at: flags?.at, by: flags?.by }} />
      </Panel>

      <Panel id="tester" title="Closed alpha / beta tester" hint="Testers get in while the site is closed and keep a tester achievement. Set in Settings → Access too.">
        <UserTesterPicker login={username} current={(await getTester(username))?.tier ?? 'none'} />
      </Panel>

      <Panel id="pull-limit" title="Pull limit" hint="Paid pulls per stream (Settings → Mix It Up). Set one for this viewer, or give a temporary bonus.">
        <PullLimitPanel username={username} view={{ own: pullRec.limit, defaultLimit: roleDefault, effective: effective.limit, used: pullsUsed, charging: mix.enabled, buffs: pullRec.buffs.filter(b => b.until === null || b.until > Date.now()) }} />
      </Panel>

      <Panel id="tools" title="Restore points, compare, merge & move aside">
        <ToolsPanel
          username={username}
          snapshots={snaps.map(s => ({ id: s.id, at: s.at, reason: s.reason, cards: s.collections.reduce((n, c) => n + c.entries.length, 0), seasons: s.collections.map(c => c.seasonName).join(', ') }))}
          collections={{ cards: totalPulls, seasons: activeSeasons }}
        />
      </Panel>

      <Panel id="compare" title="Compare" hint="Cards missing on each side in the active season, and how many one-for-one duplicate swaps would help both.">
        {compare ? (
          <div className="space-y-3 text-sm">
            <p className="text-gray-300">With <Link href={`/admin/users/${encodeURIComponent(compare.name)}`} className="text-yellow-400 hover:text-yellow-300">{compare.name}</Link>: <strong className="text-white">{compare.swaps}</strong> possible duplicate swap{compare.swaps === 1 ? '' : 's'}.</p>
            <div className="grid md:grid-cols-2 gap-4">
              <div><p className="text-xs text-gray-500 mb-1">{compare.name} has, {username} lacks ({compare.iLack.length})</p><p className="text-gray-300">{compare.iLack.join(', ') || 'nothing'}</p></div>
              <div><p className="text-xs text-gray-500 mb-1">{username} has, {compare.name} lacks ({compare.theyLack.length})</p><p className="text-gray-300">{compare.theyLack.join(', ') || 'nothing'}</p></div>
            </div>
          </div>
        ) : <p className="text-sm text-gray-600">Use “Compare with another viewer” in the tools above.</p>}
      </Panel>

      <Panel id="audit" title="Audit trail" hint="What admins did to this account (newest first).">
        {audit.length === 0 ? <p className="text-sm text-gray-600">No admin actions recorded yet.</p> : (
          <ul className="divide-y divide-gray-800/60 rounded-lg border border-gray-800 overflow-hidden">
            {audit.map((a, i) => (
              <li key={i} className="px-4 py-2 flex flex-wrap items-center gap-x-4 text-sm">
                <span className="text-gray-200 font-medium">{a.action}</span>
                {a.by && <span className="text-xs text-gray-400">by {a.by}</span>}
                {a.detail && <span className="text-xs text-gray-500">{a.detail}</span>}
                <span className="ml-auto text-xs text-gray-600" title={new Date(a.at).toLocaleString()}>{ago(a.at, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <section className="bg-gray-900 border border-red-950/40 rounded-2xl p-6">
        <h2 className="font-semibold text-red-400 mb-1">Danger Zone</h2>
        <p className="text-xs text-gray-500 mb-4">A restore point is saved first and kept for 14 days.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <form action={resetAll}>
            <ConfirmButton
              title="Reset all seasons?"
              confirmLabel="Reset all seasons"
              message={<>Clear <strong className="text-white">{displayName}</strong>&apos;s cards in every season ({totalPulls} cards)? Their profile is kept. A restore point is saved for 14 days.</>}
              className="px-4 py-2 text-sm text-red-500 hover:text-red-300 bg-red-950/40 hover:bg-red-950/70 rounded-xl transition-colors"
            >
              Reset All Seasons
            </ConfirmButton>
          </form>
          <form action={deleteThisUser}>
            <ConfirmButton
              title="Delete user?"
              confirmLabel="Delete user"
              message={<>Delete <strong className="text-white">{displayName}</strong>, including all their cards ({totalPulls}) and their profile? A restore point is saved for 14 days.</>}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-700 hover:bg-red-600 rounded-xl transition-colors"
            >
              Delete User
            </ConfirmButton>
          </form>
        </div>
      </section>
        </>
      )}
    </div>
  );
}
