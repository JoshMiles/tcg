import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { getSession } from '@/lib/session';
import { getActiveSeasonWithPacks } from '@/lib/kv';
import { getUserSettings } from '@/lib/user-settings-store';
import { profileHref } from '@/lib/profile-url';
import { alertHealth } from '@/lib/watch-core';
import { lastAlertAt } from '@/lib/watch-index';
import { timeAgo } from '@/lib/site-data';
import { SettingsForm } from './SettingsForm';
import { DeleteAccount } from './DeleteAccount';
import { deletionOf } from '@/lib/feedback';
import { CHANNEL_LOGIN } from '@/lib/site';
import { getStaffRecord } from '@/lib/staff';
import { isSuperAdmin } from '@/lib/staff-core';

export const metadata: Metadata = { title: 'Settings', robots: { index: false, follow: false } };

const SECTION_LINKS = [['profile', 'Profile'], ['notifications', 'Notifications'], ['alerts', 'Saved alerts'], ['display', 'Display'], ['experimental', 'Experimental'], ['data', 'Your data'], ['delete-account-section', 'Delete account']];

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/auth/twitch?returnTo=/settings');
  const [settings, active] = await Promise.all([getUserSettings(session.username), getActiveSeasonWithPacks().catch(() => null)]);
  const isStaff = !!(await getStaffRecord(session.username)) || isSuperAdmin({ twitchId: session.twitchId }) || session.username.toLowerCase() === CHANNEL_LOGIN;
  const deletion = await deletionOf(session.username).catch(() => null);
  const alertLine = alertHealth(settings, await lastAlertAt(session.username), timeAgo);
  const cards = (active?.packs ?? []).flatMap(p => p.cards).map(c => ({ number: c.number, name: c.name, stars: c.stars })).sort((a, b) => a.number - b.number);
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white"><Icon name="settings" className="mr-2 text-yellow-400" />Settings</h1>
          <p className="text-sm text-gray-400 mt-1">For @{session.username}. Changes apply on this account everywhere on the site.</p>
        </div>
        <Link href={profileHref(session.username)} className="text-sm text-yellow-400 hover:text-yellow-300">View my profile →</Link>
      </header>
      <nav aria-label="Settings sections" className="flex flex-wrap gap-2">
        {SECTION_LINKS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="px-3 py-1 rounded-full text-xs font-semibold border border-gray-700 text-gray-300 hover:text-yellow-300 hover:border-yellow-500/50 transition-colors">{label}</a>
        ))}
      </nav>
      <SettingsForm initial={settings} username={session.username} cards={cards} isStaff={isStaff} alertLine={alertLine} />
      <DeleteAccount username={session.username} initial={deletion ? { status: deletion.status, at: deletion.at, reply: deletion.reply } : null} />
    </div>
  );
}
