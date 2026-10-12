import { getUserProfile, listSeasons, getCollection } from './kv';
import { getUserSettings } from './user-settings-store';
import { listNotices } from './trade-notify';
import { tradesForUser } from './trades';

/** Everything stored about one viewer (their profile, settings, collections per season, trades and notices). Never other people's data. */
export async function buildExport(username: string) {
  const u = username.toLowerCase();
  const [profile, settings, seasons, notices, trades] = await Promise.all([
    getUserProfile(u).catch(() => null),
    getUserSettings(u),
    listSeasons().catch(() => []),
    listNotices(u).catch(() => ({ notices: [], seen: 0 })),
    tradesForUser(u).catch(() => null),
  ]);
  const collections = (await Promise.all(seasons.map(async s => {
    const owned = (await getCollection(s.collectionName).catch(() => ({} as Record<string, number[]>)))[u] ?? [];
    return owned.length ? { seasonId: s.id, season: s.name, entries: owned } : null;
  }))).filter(Boolean);
  return {
    exportedAt: new Date().toISOString(),
    username: u,
    profile: profile ? { displayName: profile.displayName, twitchId: profile.twitchId, createdAt: profile.createdAt } : null,
    settings,
    collections,
    notices: notices.notices,
    trades: trades ? { incoming: trades.incoming, outgoing: trades.outgoing, recent: trades.recent } : null,
    note: 'Collection entries are card numbers; numbers of 1,000,000 and up are upgraded versions (number + 1,000,000 x version).',
  };
}
