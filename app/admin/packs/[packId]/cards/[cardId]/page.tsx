import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPack, getPackCards } from '@/lib/kv';
import { getHoloResolver } from '@/lib/holo';
import { heldCardNumbers } from '@/lib/card-held';
import { updateCard } from '../../../../actions';
import { CardEditor } from './CardEditor';
import { PageHeader } from '../../../../components/ui';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ packId: string; cardId: string }> }) {
  const { packId, cardId } = await params;
  const card = (await getPackCards(packId)).find(c => c.id === cardId);
  return { title: `${card?.name || 'Card'} · Admin`, robots: { index: false } };
}

export default async function EditCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ packId: string; cardId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { packId, cardId } = await params;
  const { error } = await searchParams;
  const [pack, cards, holoFor, held] = await Promise.all([getPack(packId), getPackCards(packId), getHoloResolver(), heldCardNumbers(packId)]);
  if (!pack) notFound();

  const card = cards.find(c => c.id === cardId);
  if (!card) notFound();

  const updateThisCard = updateCard.bind(null, packId, cardId);
  // The holo depends on the star rating (the "auto" mode), so give the editor the shimmer for each rating and let it pick as you change it.
  const holoByStars = Object.fromEntries([1, 2, 3, 4, 5].map(s => [s, holoFor(pack, s)]));

  return (
    <div className="space-y-6 mx-auto w-full max-w-5xl">
      <PageHeader title="Edit card" subtitle={`${card.name} · #${card.number} in ${pack.name}`} back={{ href: `/admin/packs/${packId}`, label: pack.name }} />

      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-sm text-red-300">Not saved: {error}</p>}

      <CardEditor
        action={updateThisCard}
        cardId={cardId}
        numberLocked={held.has(card.number)}
        packName={pack.name}
        packUpgrades={pack.upgradesEnabled}
        packDisabled={pack.disabledVariants ?? []}
        holoByStars={holoByStars}
        initial={{
          number: card.number,
          name: card.name,
          imageUrl: card.imageUrl,
          fullArtImageUrl: card.fullArtImageUrl ?? '',
          stillUrl: card.stillUrl ?? '',
          fullArtStillUrl: card.fullArtStillUrl ?? '',
          soundUrl: card.soundUrl ?? '',
          stars: card.stars,
          probability: card.probability,
          upgradesEnabled: card.upgradesEnabled !== false,
          disabledVariants: card.disabledVariants ?? [],
        }}
        others={cards.filter(c => c.id !== cardId).map(c => ({ id: c.id, number: c.number, name: c.name, stars: c.stars, probability: c.probability }))}
      />
    </div>
  );
}
