import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPack, getPackCards } from '@/lib/kv';
import { BulkCards } from './BulkCards';
import { DraftChip } from '../../../components/StatusChip';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ packId: string }> }) {
  const pack = await getPack((await params).packId);
  return { title: `Cards · ${pack?.name || 'Pack'} · Admin`, robots: { index: false } };
}

export default async function BulkCardsPage({ params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  const [pack, cards] = await Promise.all([getPack(packId), getPackCards(packId)]);
  if (!pack) notFound();

  return (
    <div className="space-y-6 mx-auto w-full max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">Cards · {pack.name || 'Untitled pack'}</h1>
            {pack.status === 'draft' && <DraftChip />}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Drop images to add cards in bulk, or edit rows inline. Card numbers never change once assigned.
          </p>
        </div>
        <Link href={`/admin/packs/${packId}`} className="text-sm text-gray-500 hover:text-white transition-colors">← Pack</Link>
      </div>

      <BulkCards
        packId={packId}
        isDraft={pack.status === 'draft'}
        upgradesEnabled={pack.upgradesEnabled}
        packDisabled={pack.disabledVariants ?? []}
        initial={cards.map(c => ({ ...c, upgradesEnabled: c.upgradesEnabled !== false }))}
      />
    </div>
  );
}
