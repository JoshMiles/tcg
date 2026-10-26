import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { CollectorFinder } from './CollectorFinder';

export const metadata: Metadata = { title: 'Find a collector', description: 'Look up any viewer\'s profile, collection and rank on The Cheesy TCG.' };

// Every collection is now a profile (/u/<name>); this page is the way in. The top collectors live on /leaderboard.
export default function FindCollector() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-14 space-y-10">
      <header className="text-center space-y-3">
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-white">Find a collector</h1>
        <p className="text-gray-400 max-w-lg mx-auto">Enter a Twitch username to see their profile: collection, rank, points, awards and trades.</p>
      </header>
      <CollectorFinder />
      <p className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm">
        <Link href="/leaderboard" className="text-yellow-500 hover:text-yellow-300">See the top collectors on the leaderboard →</Link>
        <Link href="/cards" className="text-yellow-500 hover:text-yellow-300">Card dex</Link>
      </p>
      <p className="text-center text-xs text-gray-600"><Icon name="info" className="mr-1" />Profiles are public: they show a collector&apos;s cards, rank and awards. See the <Link href="/privacy" className="underline hover:text-gray-400">Privacy Policy</Link>.</p>
    </div>
  );
}
