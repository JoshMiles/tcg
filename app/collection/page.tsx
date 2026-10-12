import { PendingButton } from '../admin/components/PendingButton';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BrandMark } from '../admin/components/BrandMark';

export const metadata: Metadata = { title: 'Collections', description: 'Look up any viewer\'s card collection on The Cheesy TCG.' };

export default function CollectionLanding() {
  async function goToCollection(formData: FormData) {
    'use server';
    const username = (formData.get('username') as string).trim().toLowerCase();
    if (username) redirect(`/collection/${username}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="tcg-panel rounded-3xl w-full max-w-md overflow-hidden shadow-glow">
        <div className="holo-strip" />
        <div className="p-8 space-y-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <BrandMark size={64} />
            <h1 className="text-3xl font-bold text-yellow-400">The Cheesy TCG</h1>
            <p className="text-gray-500 text-sm">Enter a Twitch username to view a collection</p>
          </div>
          <form action={goToCollection} className="flex gap-2">
            <input
              name="username"
              type="text"
              placeholder="your_username"
              autoComplete="off"
              className="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 focus:shadow-glow transition text-sm"
            />
            <PendingButton type="submit" className="px-5 py-3 tcg-btn rounded-xl text-sm shrink-0">
              Go →
            </PendingButton>
          </form>
          <p className="text-[11px] text-gray-600">
            <a href="/terms" className="hover:text-gray-400 transition-colors">Terms</a>
            {' · '}
            <a href="/privacy" className="hover:text-gray-400 transition-colors">Privacy</a>
          </p>
        </div>
      </div>
    </div>
  );
}
