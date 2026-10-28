import { redirect } from 'next/navigation';
import { staffPage } from '@/lib/staff-guard';
import { legacyStreamHref } from '@/lib/stream-page';

// The Mix It Up page is the Stream page now (ROADMAP 63.2). Old bookmarks and links land on the right section; note, error, saved and filter are kept.
export default async function MixItUpMoved({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await staffPage('admin');
  redirect(legacyStreamHref(await searchParams));
}
