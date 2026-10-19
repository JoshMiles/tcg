import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { getSession } from '@/lib/session';
import { getUserSettings } from '@/lib/user-settings-store';
import { countPulls } from '@/lib/collection';
import { getOwnerCopies } from '@/lib/serials';
import { pronounsFor } from '@/lib/pronouns-store';
import { sweepTrades } from '@/lib/trades';
import { getUserProfile } from '@/lib/kv';
import { SITE_URL } from '@/lib/site';
import { buildBigStats, buildGridCards, buildShareBase, buildShareCandidates, buildShareSpec, loadProfileBase } from '@/lib/profile-data';
import { pickProfileTab, profileHref, profileTitle } from '@/lib/profile-url';
import { SiteMessage } from '@/app/components/site/SiteMessage';
import { getStaffBadges } from '@/lib/staff-badge';
import { staffPanelLink } from '@/lib/staff-guard';
import { ProfileHeader } from './ProfileHeader';
import { ProfileTabBar } from './ProfileTabBar';
import { OverviewTab } from './OverviewTab';
import { ShareTab } from './ShareTab';
import { sharesPostingOn } from '@/lib/discord';
import { ActivityTab, CollectionTab, StatsTab, TradesTab } from './ProfileTabs';

export const dynamic = 'force-dynamic';

/** A private profile (Settings, Private profile) opens only for its owner; everyone else sees a short "this profile is private" page. */
async function canSee(lower: string): Promise<boolean> {
  const session = await getSession();
  if (session?.username === lower) return true;
  return !(await getUserSettings(lower).catch(() => null))?.privateProfile;
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> }): Promise<Metadata> {
  const { username } = await params;
  const { tab } = await searchParams;
  const lower = decodeURIComponent(username).toLowerCase();
  const profile = await getUserProfile(lower).catch(() => null);
  const name = profile?.displayName || lower;
  // A private profile tells a visitor nothing, not even in the tab title or the link preview.
  if (!(await canSee(lower))) return { title: 'Private profile', description: 'This profile is private.', robots: { index: false, follow: false } };
  return {
    title: profileTitle(name, pickProfileTab(tab)),
    description: `${name}'s cards, rank and awards on The Cheesy TCG.`,
    alternates: { canonical: profileHref(lower) }, // the tabs are views of one profile
    // The share image (opengraph-image.tsx next to this file) carries their rank and progress.
  };
}

export default async function ProfilePage({ params, searchParams }: { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ username }, { tab: tabParam }] = await Promise.all([params, searchParams]);
  const lower = decodeURIComponent(username).toLowerCase();
  const session = await getSession();
  const isOwner = session?.username === lower;
  const tab = pickProfileTab(tabParam, isOwner);
  if (!isOwner && (await getUserSettings(lower).catch(() => null))?.privateProfile) {
    return (
      <SiteMessage icon="lock" title="This profile is private" actions={<Link href="/collection" className="btn btn-primary px-4 py-2 text-sm rounded-xl">Find a collector</Link>}>
        This collector keeps their profile to themselves, so there is nothing to show here. Their cards still appear on stream when they are shown.
      </SiteMessage>
    );
  }
  await sweepTrades(); // hand back copies from offers that have run out of time

  const b = await loadProfileBase(lower, isOwner);
  if (!b) {
    return <SiteMessage icon="cards" title="No active season">Check back when a season is running.<br /><Link href="/leaderboard" className="text-yellow-400 hover:text-yellow-300">See the leaderboard →</Link></SiteMessage>;
  }
  // Someone we have never seen (no profile, nothing collected): say so instead of showing an empty grid under a made-up name.
  if (!b.profile && b.owned.length === 0) {
    return (
      <SiteMessage icon="search" title={`We haven't seen ${lower} yet`} actions={<Link href="/collection" className="btn btn-primary px-4 py-2 text-sm rounded-xl">Find a collector</Link>}>
        There is no collection under that name this season. Check the spelling, or watch the stream and pull some cards.
      </SiteMessage>
    );
  }

  const prefs = session ? await getUserSettings(session.username) : undefined;
  // For "Compare with me": the signed-in viewer's copies per card (the season's collection is already loaded).
  const mine = session && !isOwner && (tab === 'collection' || tab === 'overview') ? Object.fromEntries(countPulls(b.collection[session.username] ?? [])) : undefined;
  const SITE_SHORT = SITE_URL.replace(/^https?:\/\//, '');
  const copies = await getOwnerCopies(b.season.collectionName, lower);
  const discordOn = tab === 'share' && isOwner ? await sharesPostingOn() : false;
  const pronouns = await pronounsFor(lower, b.settings.pronouns);
  const grid = tab === 'collection' ? await buildGridCards(b, copies) : [];
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <ProfileHeader b={b} isOwner={isOwner} signedIn={!!session} canReport={!!session && !isOwner && !(await staffPanelLink(session).catch(() => null))} pronouns={pronouns} staffBadge={(await getStaffBadges())[lower] ?? null} shareSpec={buildShareSpec(b, copies, SITE_SHORT)} />
      <ProfileTabBar username={lower} active={tab} isOwner={isOwner} />
      {tab === 'overview' && <OverviewTab b={b} copies={copies} isOwner={isOwner} viewer={session?.username} mine={mine} />}
      {tab === 'collection' && <CollectionTab b={b} grid={grid} isOwner={isOwner} tradeWith={session && !isOwner ? lower : undefined} prefs={prefs} mine={mine} />}
      {tab === 'stats' && <StatsTab b={b} />}
      {tab === 'trades' && <TradesTab b={b} viewer={session?.username} />}
      {tab === 'activity' && <ActivityTab b={b} />}
      {tab === 'share' && isOwner && <ShareTab base={buildShareBase(b, SITE_SHORT)} candidates={buildShareCandidates(b, copies, 18)} bigStats={buildBigStats(b)} link={`${SITE_URL}${profileHref(lower)}`} username={lower} discordOn={discordOn} />}
      <p className="text-center text-xs text-gray-600 pt-2">
        Pull cards live on stream · <Link href="/collection" className="hover:text-gray-400"><Icon name="search" className="mr-1" />find another collector</Link>
      </p>
    </div>
  );
}
