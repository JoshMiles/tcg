import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { getSession } from '@/lib/session';
import { getUserSettings } from '@/lib/user-settings-store';
import { countPulls } from '@/lib/collection';
import { sweepTrades } from '@/lib/trades';
import { getUserProfile } from '@/lib/kv';
import { buildGridCards, loadProfileBase } from '@/lib/profile-data';
import { PROFILE_TABS, pickProfileTab, profileHref } from '@/lib/profile-url';
import { SiteMessage } from '@/app/components/site/SiteMessage';
import { ProfileHeader } from './ProfileHeader';
import { ProfileTabBar } from './ProfileTabBar';
import { ActivityTab, CollectionTab, StatsTab, TradesTab } from './ProfileTabs';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> }): Promise<Metadata> {
  const { username } = await params;
  const { tab } = await searchParams;
  const lower = decodeURIComponent(username).toLowerCase();
  const profile = await getUserProfile(lower).catch(() => null);
  const name = profile?.displayName || lower;
  const t = PROFILE_TABS.find(x => x.id === pickProfileTab(tab))!;
  return {
    title: pickProfileTab(tab) === 'collection' ? `${name}'s collection` : `${name} · ${t.label}`,
    description: `${name}'s cards, rank and awards on The Cheesy TCG.`,
    alternates: { canonical: profileHref(lower) }, // the tabs are views of one profile
    // The share image (opengraph-image.tsx next to this file) carries their rank and progress.
  };
}

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ username }, { tab: tabParam }] = await Promise.all([params, searchParams]);
  const lower = decodeURIComponent(username).toLowerCase();
  const tab = pickProfileTab(tabParam);
  const session = await getSession();
  const isOwner = session?.username === lower;
  await sweepTrades(); // hand back copies from offers that have run out of time

  const b = await loadProfileBase(lower, isOwner);
  if (!b) {
    return <SiteMessage icon="cards" title="No active season">Check back when a season is running.<br /><Link href="/leaderboard" className="text-yellow-400 hover:text-yellow-300">See the leaderboard →</Link></SiteMessage>;
  }
  // Someone we have never seen (no profile, nothing collected): say so instead of showing an empty grid under a made-up name.
  if (!b.profile && b.owned.length === 0) {
    return (
      <SiteMessage icon="search" title={`We haven't seen ${lower} yet`} actions={<Link href="/collection" className="tcg-btn px-4 py-2 text-sm rounded-xl">Find a collector</Link>}>
        There is no collection under that name this season. Check the spelling, or watch the stream and pull some cards.
      </SiteMessage>
    );
  }

  const prefs = session ? await getUserSettings(session.username) : undefined;
  // For "Compare with me": the signed-in viewer's copies per card (the season's collection is already loaded).
  const mine = session && !isOwner && tab === 'collection' ? Object.fromEntries(countPulls(b.collection[session.username] ?? [])) : undefined;
  const grid = tab === 'collection' ? await buildGridCards(b) : [];
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <ProfileHeader b={b} isOwner={isOwner} signedIn={!!session} />
      <ProfileTabBar username={lower} active={tab} />
      {tab === 'collection' && <CollectionTab b={b} grid={grid} isOwner={isOwner} tradeWith={session && !isOwner ? lower : undefined} prefs={prefs} mine={mine} />}
      {tab === 'stats' && <StatsTab b={b} />}
      {tab === 'trades' && <TradesTab b={b} viewer={session?.username} />}
      {tab === 'activity' && <ActivityTab b={b} />}
      <p className="text-center text-xs text-gray-600 pt-2">
        Pull cards live on stream · <Link href="/collection" className="hover:text-gray-400"><Icon name="search" className="mr-1" />find another collector</Link>
      </p>
    </div>
  );
}
