import { getActiveSeasonWithPacks } from '@/lib/kv';
import { getActivity } from '@/lib/activity';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { requireStaff } from '@/lib/staff-guard';
import { ActivityFeed, type CardInfo } from '../../admin/activity/ActivityFeed';
import { PageHeader } from '../../admin/components/ui';

export const metadata = { title: 'Live Activity · Mod', robots: { index: false } };
export const dynamic = 'force-dynamic';

/** The same live feed the admin sees, read-only: mods can watch, filter and open an event, but not gift, grant or remove anything. */
export default async function ModActivityPage() {
  await requireStaff('mod');
  const [{ events, seq }, active] = await Promise.all([getActivity({ limit: 100 }), getActiveSeasonWithPacks()]);
  const raw = await getAvatars(events.map(e => e.username));
  const avatars = Object.fromEntries(Object.entries(raw).map(([u, url]) => [u, sizeTwitchAvatar(url, 70)]));
  const cards: CardInfo[] = (active?.packs ?? []).flatMap(({ pack, cards }) =>
    cards.map(c => ({ packName: pack.name, number: c.number, name: c.name, imageUrl: c.imageUrl, stars: c.stars })),
  );
  return (
    <div className="space-y-6">
      <PageHeader title="Live Activity" subtitle="Pulls, upgrades and trades as they happen. Click a viewer to open their page." />
      <ActivityFeed initialEvents={events} initialSeq={seq} initialAvatars={avatars} cards={cards} mod />
    </div>
  );
}
