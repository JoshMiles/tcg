import { getActiveSeasonWithPacks } from '@/lib/kv';
import { getActivity } from '@/lib/activity';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { ActivityFeed, type CardInfo } from './ActivityFeed';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const [{ events, seq }, active] = await Promise.all([getActivity({ limit: 100 }), getActiveSeasonWithPacks()]);

  const raw = await getAvatars(events.map(e => e.username));
  const avatars = Object.fromEntries(Object.entries(raw).map(([u, url]) => [u, sizeTwitchAvatar(url, 70)]));

  // Lets the feed show card art/names for events that only carry a card number (grants, removals).
  const cards: CardInfo[] = (active?.packs ?? []).flatMap(({ pack, cards }) =>
    cards.map(c => ({ packName: pack.name, number: c.number, name: c.name, imageUrl: c.imageUrl, stars: c.stars }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Live Activity</h1>
        <p className="text-sm text-gray-500 mt-0.5">Pulls, grants, resets and stream triggers as they happen</p>
      </div>
      <ActivityFeed initialEvents={events} initialSeq={seq} initialAvatars={avatars} cards={cards} />
    </div>
  );
}
