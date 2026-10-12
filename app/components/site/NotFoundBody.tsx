import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteMessage } from './SiteMessage';

/** The "page not found" content, without the site frame (the frame comes from the segment's layout, or from app/not-found.tsx). */
export function NotFoundBody({ title = "That page isn't here", note }: { title?: string; note?: string }) {
  async function find(formData: FormData) {
    'use server';
    const name = String(formData.get('username') ?? '').trim().toLowerCase().replace(/^@/, '');
    if (/^[a-z0-9_]{1,25}$/.test(name)) redirect(`/u/${name}`);
  }
  return (
    <SiteMessage
      icon="search"
      title={title}
      actions={<>
        <Link href="/" className="tcg-btn px-4 py-2 text-sm rounded-xl">Back home</Link>
        <Link href="/leaderboard" className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500">Leaderboard</Link>
        <Link href="/cards" className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500">Card dex</Link>
      </>}
    >
      <p>{note ?? 'The link may be old, or the page may have moved. Looking for someone\'s cards?'}</p>
      <form action={find} className="mt-4 flex gap-2 max-w-sm mx-auto">
        <input name="username" placeholder="Find a Twitch username…" autoComplete="off" aria-label="Twitch username" className="flex-1 bg-gray-950 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500" />
        <button type="submit" className="tcg-btn px-4 py-2.5 text-sm rounded-xl shrink-0">Go</button>
      </form>
    </SiteMessage>
  );
}
