import { permanentRedirect } from 'next/navigation';
import { profileHref } from '@/lib/profile-url';

// Collections are now profiles at /u/<name>. The old address stays alive for good: Discord posts, the Twitch panel and old
// bookmarks all still point here.
export default async function OldCollectionAddress({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  permanentRedirect(profileHref(decodeURIComponent(username)));
}
