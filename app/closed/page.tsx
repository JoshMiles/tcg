import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BrandMark } from '../admin/components/BrandMark';
import { getAccessSettings, hasSiteAccess } from '@/lib/access';
import { MODE_LABELS } from '@/lib/access-core';
import { loginConfigured, getSession } from '@/lib/session';
import { APP_NAME } from '@/lib/legal';
import { CHANNEL_NAME, CHANNEL_URL } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Closed alpha / beta', robots: { index: false, follow: false } };

/** What everyone else sees while the site is locked to the testers list (ROADMAP Track 16). */
export default async function ClosedPage({ searchParams }: { searchParams: Promise<{ why?: string }> }) {
  const { why } = await searchParams;
  const settings = await getAccessSettings();
  // Open again, or already let in: nothing to explain.
  if (settings.mode === 'open' || (await hasSiteAccess().catch(() => false))) redirect('/');
  const session = await getSession();
  const what = settings.mode === 'alpha' ? 'closed alpha' : 'closed beta';

  return (
    <main id="main" className="min-h-screen flex items-center justify-center p-4">
      <div className="card rounded-3xl w-full max-w-md overflow-hidden shadow-glow">
        <div className="holo-strip" />
        <div className="p-8 space-y-5 text-center">
          <div className="flex flex-col items-center gap-2">
            <BrandMark size={56} />
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest">{APP_NAME}</p>
            <h1 className="text-yellow-400 font-bold text-2xl">The Cheesy TCG is in {what}</h1>
          </div>

          <p className="text-sm text-gray-300">{settings.message || `Only invited testers can open the site for now. It is not public yet (${MODE_LABELS[settings.mode].toLowerCase()}).`}</p>

          {why === 'unavailable' && <p role="alert" className="text-sm font-semibold text-red-400">Twitch sign-in isn&rsquo;t set up on this site yet.</p>}

          {session ? (
            <div className="space-y-3">
              <p role="status" className="text-sm text-gray-300">
                You&rsquo;re signed in as <strong className="text-white">@{session.username}</strong> but not on the tester list. Ask in the {CHANNEL_NAME} Discord.
              </p>
              <form action="/auth/logout" method="post">
                <button type="submit" className="w-full rounded-xl py-3 font-bold text-white bg-gray-800 hover:bg-gray-700 transition-colors">Log out</button>
              </form>
            </div>
          ) : loginConfigured() ? (
            <a href="/auth/twitch?returnTo=%2F" className="flex items-center justify-center gap-2 w-full rounded-xl py-3 font-bold text-white bg-[#9146ff] hover:bg-[#a36bff] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.3 3 3 6.3v13.4h4.6V22h2.6l2.3-2.3h3.7L21 14.6V3H4.3Zm14.9 10.6-2.9 2.9h-4.6l-2.3 2.3v-2.3H6.7V4.7h12.5v8.9ZM16.4 7.9v4.6h-1.7V7.9h1.7Zm-4.6 0v4.6h-1.7V7.9h1.7Z" /></svg>
              Log in with Twitch
            </a>
          ) : (
            <p className="text-sm text-gray-400">Twitch sign-in isn&rsquo;t configured here.</p>
          )}

          <p className="text-xs text-gray-500">
            The game runs only on the <a href={CHANNEL_URL} className="text-yellow-500 hover:text-yellow-300" target="_blank" rel="noopener noreferrer">{CHANNEL_NAME} Twitch channel</a>.
          </p>
          <nav aria-label="Legal" className="flex justify-center gap-4 text-xs text-yellow-500">
            <Link href="/privacy" className="hover:text-yellow-300">Privacy</Link>
            <Link href="/terms" className="hover:text-yellow-300">Terms</Link>
          </nav>
        </div>
      </div>
    </main>
  );
}
