import { Icon } from '@/app/components/Icon';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Login problem', robots: { index: false, follow: false } };

const MESSAGES: Record<string, { title: string; text: string }> = {
  denied: { title: 'Login cancelled', text: 'You chose not to share your Twitch profile, so we haven’t logged you in. You can still browse collections and the leaderboard.' },
  expired: { title: 'That login link expired', text: 'The sign-in took too long or was opened in a different browser. Please try again.' },
  failed: { title: 'Twitch login failed', text: 'We couldn’t complete the sign-in with Twitch. Please try again in a moment.' },
  unavailable: { title: 'Login isn’t available right now', text: 'Logging in with Twitch isn’t set up on this site at the moment. You can still browse everything.' },
};

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const m = MESSAGES[reason ?? ''] ?? MESSAGES.failed;
  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
      <p className="text-5xl"><Icon name="cheese" className="w-14 h-14 text-yellow-400" /></p>
      <h1 className="font-display text-3xl font-bold text-white">{m.title}</h1>
      <p className="text-gray-400 leading-relaxed">{m.text}</p>
      <div className="flex justify-center gap-3 pt-2">
        {reason !== 'unavailable' && <a href="/auth/twitch" className="tcg-btn px-5 py-2.5 rounded-xl text-sm">Try again</a>}
        <Link href="/" className="px-5 py-2.5 rounded-xl text-sm bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold">Back home</Link>
      </div>
    </div>
  );
}
