import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { profileHref } from '@/lib/profile-url';

export const metadata: Metadata = { title: 'My Stats', robots: { index: false, follow: false } };

/** "My stats" lives on the owner's profile Stats tab. This address stays for old links, sign-in callbacks and installed shortcuts: it forwards there and keeps any query string. */
export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSession();
  if (!session) redirect('/auth/twitch?returnTo=/account');
  const rest = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (key !== 'tab') for (const v of [value ?? []].flat()) rest.append(key, v);
  }
  const target = profileHref(session.username, 'stats');
  redirect(rest.size ? `${target}&${rest}` : target);
}
