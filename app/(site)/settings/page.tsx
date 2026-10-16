import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { getSession } from '@/lib/session';
import { getActiveSeasonWithPacks } from '@/lib/kv';
import { getUserSettings } from '@/lib/user-settings-store';
import { profileHref } from '@/lib/profile-url';
import { SettingsForm } from './SettingsForm';
import { DeleteAccount } from './DeleteAccount';
import { deletionOf } from '@/lib/feedback';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings', robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/auth/twitch?returnTo=/settings');
  const [settings, active] = await Promise.all([getUserSettings(session.username), getActiveSeasonWithPacks().catch(() => null)]);
  const deletion = await deletionOf(session.username).catch(() => null);
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
      <SettingsForm initial={settings} username={session.username} cards={cards} />
      <DeleteAccount username={session.username} initial={deletion ? { status: deletion.status, at: deletion.at, reply: deletion.reply } : null} />
    </div>
  );
}
