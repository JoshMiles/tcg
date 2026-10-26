import { staffPage } from '@/lib/staff-guard';
import { redirect } from 'next/navigation';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/** The card now opens in the pack workspace; old links and bookmarks land there. */
export default async function EditCardPage({ params }: { params: Promise<{ packId: string; cardId: string }> }) {
  await staffPage('admin');
  const { packId, cardId } = await params;
  redirect(`/admin/packs/${packId}?card=${encodeURIComponent(cardId)}`);
}
