import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPack, getPackCards } from '@/lib/kv';
import { getHoloResolver } from '@/lib/holo';
import { updateCard } from '../../../../actions';
import { CardEditor } from './CardEditor';

export const dynamic = 'force-dynamic';

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ packId: string; cardId: string }>;
}) {
  const { packId, cardId } = await params;
  const [pack, cards, holoFor] = await Promise.all([getPack(packId), getPackCards(packId), getHoloResolver()]);
  if (!pack) notFound();

  const card = cards.find(c => c.id === cardId);
  if (!card) notFound();

  const updateThisCard = updateCard.bind(null, packId, cardId);
  // The holo depends on the star rating (the "auto" mode), so give the editor the shimmer for each rating and let it pick as you change it.
  const holoByStars = Object.fromEntries([1, 2, 3, 4, 5].map(s => [s, holoFor(pack, s)]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Card</h1>
        <Link href={`/admin/packs/${packId}`} className="text-sm text-gray-500 hover:text-white transition-colors">
          ← {pack.name}
        </Link>
      </div>

      <CardEditor
        action={updateThisCard}
        cardId={cardId}
        packName={pack.name}
        packUpgrades={pack.upgradesEnabled}
        packDisabled={pack.disabledVariants ?? []}
        holoByStars={holoByStars}
        initial={{
          number: card.number,
          name: card.name,
          imageUrl: card.imageUrl,
          fullArtImageUrl: card.fullArtImageUrl ?? '',
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
