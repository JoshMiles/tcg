import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { PushPrompt } from '@/app/components/site/PushPrompt';
import { getSession } from '@/lib/session';
import { listNotices } from '@/lib/trade-notify';
import { NoticeList } from './NoticeList';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Notifications', robots: { index: false, follow: false } };

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect('/auth/twitch?returnTo=/notifications');
  const { notices, seen } = await listNotices(session.username);
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <PushPrompt />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white"><Icon name="bell" className="mr-2 text-yellow-400" />Notifications</h1>
          <p className="text-sm text-gray-400 mt-1">Your newest notices, kept for you. Choose which ones you get in <Link href="/settings" className="text-yellow-400 hover:text-yellow-300">Settings</Link>.</p>
        </div>
        <Link href="/trade" className="text-sm text-yellow-400 hover:text-yellow-300">Open Trade →</Link>
      </header>
      <NoticeList initial={notices} initialSeen={seen} />
    </div>
  );
}
