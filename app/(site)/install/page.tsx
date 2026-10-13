import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, type IconName } from '@/app/components/Icon';
import { InstallGuide } from '@/app/components/site/InstallGuide';

export const metadata: Metadata = {
  title: 'Add to home screen',
  description: 'Put The Cheesy TCG on your phone or computer like an app: steps for iPhone, Android and desktop.',
};

const PERKS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'phone', title: 'Its own icon', text: 'Sits next to your other apps.' },
  { icon: 'monitor', title: 'Full screen', text: 'No browser bars in the way.' },
  { icon: 'refresh', title: 'Always up to date', text: 'Nothing to download or update.' },
];

export default function InstallPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <header className="space-y-3">
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-white">Get the app</h1>
        <p className="text-gray-400 leading-relaxed max-w-2xl">
          The Cheesy TCG isn&rsquo;t in an app store, but you can add it to your home screen in a few taps. It then opens full screen from its own icon, with your collection, trades and leaderboard one tap away.
        </p>
        <ul className="grid sm:grid-cols-3 gap-3 pt-1 text-sm">
          {PERKS.map(p => (
            <li key={p.title} className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
              <Icon name={p.icon} className="text-yellow-400" /> <span className="font-bold text-white">{p.title}</span>
              <p className="text-gray-400 mt-0.5">{p.text}</p>
            </li>
          ))}
        </ul>
      </header>

      <InstallGuide />

      <p className="text-sm text-gray-500">
        Not working? See <Link href="/faq#help" className="text-yellow-400 hover:text-yellow-300">Something not working?</Link> in the FAQ. The game itself is only played live on stream; this is just a faster way to view your cards.
      </p>
    </div>
  );
}
