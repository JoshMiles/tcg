import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** The bulk card page is the workspace's Grid view now; old links and bookmarks land there. */
export default async function BulkCardsPage({ params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  redirect(`/admin/packs/${packId}?view=grid`);
}
