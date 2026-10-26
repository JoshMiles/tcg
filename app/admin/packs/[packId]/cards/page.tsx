import { redirect } from 'next/navigation';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/** The bulk card page is the workspace's Grid view now; old links and bookmarks land there. */
export default async function BulkCardsPage({ params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  redirect(`/admin/packs/${packId}?view=grid`);
}
