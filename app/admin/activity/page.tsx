import { staffPage } from '@/lib/staff-guard';
import { getActiveSeasonWithPacks, listSeasons } from '@/lib/kv';
import { getActivity } from '@/lib/activity';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { ActivityFeed, type CardInfo } from './ActivityFeed';
import { PageHeader } from '../components/ui';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Live Activity · Admin', robots: { index: false } };

export default async function ActivityPage() {
  await staffPage('admin');
  const [{ events, seq }, active] = await Promise.all([getActivity({ limit: 100, includeTest: true }), getActiveSeasonWithPacks()]);

  const raw = await getAvatars(events.map(e => e.username));
  const avatars = Object.fromEntries(Object.entries(raw).map(([u, url]) => [u, sizeTwitchAvatar(url, 70)]));

  // Lets the feed show card art/names for events that only carry a card number (grants, removals).
  const seasons = Object.fromEntries((await listSeasons()).map(s => [s.collectionName, s.id]));
  const cards: CardInfo[] = (active?.packs ?? []).flatMap(({ pack, cards }) =>
    cards.map(c => ({ packName: pack.name, number: c.number, name: c.name, imageUrl: c.imageUrl, stars: c.stars }))
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Live Activity" subtitle="Pulls, grants, resets and stream triggers as they happen" />
      <ActivityFeed initialEvents={events} initialSeq={seq} initialAvatars={avatars} cards={cards} seasons={seasons} serverNow={Date.now()} />
    </div>
  );
}
