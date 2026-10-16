import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** The card now opens in the pack workspace; old links and bookmarks land there. */
export default async function EditCardPage({ params }: { params: Promise<{ packId: string; cardId: string }> }) {
  const { packId, cardId } = await params;
  redirect(`/admin/packs/${packId}?card=${encodeURIComponent(cardId)}`);
}
