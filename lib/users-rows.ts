// Every viewer as one Admin Users row (collection progress, score, last seen, trades). Shared by the Users page and its CSV export.
import { getAllCollectionUsers, getUserProfiles, listSeasons, getPackCards, getPacksForSeason } from '@/lib/kv';
import { tradeBlockedNow } from '@/lib/restriction';
import { uniqueCount } from '@/lib/collection';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { getActivity } from '@/lib/activity';
import { getSeasonLeaderboard } from '@/lib/leaderboard';
import { getLastSeen } from '@/lib/stats';
import { tradeCountsByUser } from '@/lib/trades';
import { decodeEntry } from '@/lib/variants';
import type { UserRow } from '@/lib/users-list';

export async function loadUserRows() {
  const [users, seasons, activity, lastSeenMap, trades] = await Promise.all([
    getAllCollectionUsers(),
    listSeasons(),
    getActivity({ limit: 500 }),
    getLastSeen(),
    tradeCountsByUser().catch((): Record<string, { total: number; open: number; completed: number }> => ({})),
  ]);
  const active = seasons.find(s => s.active && s.status === 'published') ?? null;

  const [profileMap, avatars, board] = await Promise.all([
    getUserProfiles(users.map(u => u.username)),
    getAvatars(users.map(u => u.username)),
    active ? getSeasonLeaderboard(active).catch((): null => null) : Promise.resolve(null),
  ]);
  const scoreRows = new Map((board?.rows ?? []).map((r, i) => [r.username, { score: r.score, rank: i + 1 }]));

  // The cards a season can be completed with: the same set the leaderboard uses (draft packs are never drawn, so their cards don't count).
  const seasonNumbers: Record<string, Set<number>> = {};
  await Promise.all(seasons.map(async s => {
    const packs = (await getPacksForSeason(s)).filter(p => p.status !== 'draft');
    seasonNumbers[s.id] = new Set((await Promise.all(packs.map(p => getPackCards(p.id)))).flat().map(c => c.number));
  }));

  // Last seen: the viewer's last counted action, falling back to the latest 500 logged events.
  const lastActive = new Map<string, number>();
  for (const e of activity.events) if (e.username && !lastActive.has(e.username)) lastActive.set(e.username, e.at);
  for (const [u, t] of Object.entries(lastSeenMap)) if (t > (lastActive.get(u) ?? 0)) lastActive.set(u, t);

  const rows: UserRow[] = users.map(user => {
    const unique = user.seasons.reduce((s, x) => s + uniqueCount(x.cards), 0);
    const pulls = user.seasons.reduce((s, x) => s + x.cards.length, 0);
    let shiny = 0, full = 0;
    for (const s of user.seasons) for (const e of s.cards) { const v = decodeEntry(e).variant; if (v === 'shiny') shiny++; else if (v === 'full') full++; }
    const withPct = user.seasons.map(us => {
      const numbers = seasonNumbers[us.id] ?? new Set<number>();
      const total = numbers.size;
      const owned = new Set(us.cards.map(e => decodeEntry(e).cardNumber).filter(n => numbers.has(n))).size;
      return { id: us.id, name: us.name, owned, total, pct: total > 0 ? Math.round((owned / total) * 100) : 0 };
    });
    const primary = withPct.find(w => w.id === active?.id) ?? [...withPct].sort((a, b) => b.pct - a.pct)[0];
    const profile = profileMap.get(user.username);
    const score = scoreRows.get(user.username);
    return {
      username: user.username,
      displayName: profile?.displayName || user.username,
      avatar: avatars[user.username] ? sizeTwitchAvatar(avatars[user.username], 70) : undefined,
      isTwitch: !!profile?.twitchId,
      tags: profile?.tags ?? [],
      noTrading: tradeBlockedNow(profile?.flags),
      hidden: !!profile?.flags?.hideFromBoard,
      hasNotes: !!profile?.notes?.trim(),
      unique, pulls, shiny, full,
      primary: primary ? { name: primary.name, owned: primary.owned, total: primary.total, pct: primary.pct } : null,
      otherSeasons: withPct.length - 1,
      score: score?.score ?? null,
      scoreRank: score?.rank ?? null,
      joined: profile?.createdAt ?? null,
      lastActive: lastActive.get(user.username) ?? null,
      trades: trades[user.username]?.total ?? 0,
    };
  });
  return { rows, active };
}
