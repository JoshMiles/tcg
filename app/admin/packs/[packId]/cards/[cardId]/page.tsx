import { PendingButton } from '../../../../components/PendingButton';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPack, getPackCards } from '@/lib/kv';
import { updateCard } from '../../../../actions';
import { ImageUploadField } from '../../../../components/image-upload';
import { AudioUploadField } from '../../../../components/audio-upload';
import { VariantChecks } from '../../../../components/VariantSwitches';

export const dynamic = 'force-dynamic';

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ packId: string; cardId: string }>;
}) {
  const { packId, cardId } = await params;
  const [pack, cards] = await Promise.all([getPack(packId), getPackCards(packId)]);
  if (!pack) notFound();

  const card = cards.find(c => c.id === cardId);
  if (!card) notFound();

  const updateThisCard = updateCard.bind(null, packId, cardId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Card</h1>
        <Link href={`/admin/packs/${packId}`} className="text-sm text-gray-500 hover:text-white transition-colors">
          ← {pack.name}
        </Link>
      </div>

      <form action={updateThisCard} className="tcg-panel rounded-xl p-6 grid gap-4 xl:grid-cols-2 items-start">
        <Field label="Card Number" name="number" type="number" defaultValue={String(card.number)} required />
        <Field label="Name" name="name" defaultValue={card.name} required />
        <ImageUploadField name="imageUrl" defaultValue={card.imageUrl} />
        <AudioUploadField name="soundUrl" defaultValue={card.soundUrl} />
        <ImageUploadField name="fullArtImageUrl" defaultValue={card.fullArtImageUrl} label="Full Art Image URL (Full Art &amp; Shiny variants)" />
        <div className="flex items-center gap-3">
          <input type="checkbox" id="card-upgrades" name="upgradesEnabled" defaultChecked={card.upgradesEnabled !== false} className="w-4 h-4 accent-yellow-400" />
          <label htmlFor="card-upgrades" className="text-sm text-gray-300">
            Allow variants &amp; upgrades for this card
            {!pack.upgradesEnabled && <span className="text-gray-600"> (pack has upgrades off)</span>}
          </label>
        </div>
        <div className="space-y-1.5">
          <p className="text-sm text-gray-300">Variants this card can be</p>
          <VariantChecks disabled={card.disabledVariants} dimmed={pack.disabledVariants} />
          <p className="text-xs text-gray-600">E.g. switch off Full Art and Shiny for a card with no full-art image. Variants already off for the whole pack are dimmed.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Stars (1–5)" name="stars" type="number" defaultValue={String(card.stars)} required />
          <Field label="Probability" name="probability" type="number" defaultValue={String(card.probability)} required />
        </div>
        <div className="pt-2 xl:col-span-2">
          <PendingButton
            type="submit"
            className="px-5 py-2 tcg-btn rounded-lg text-sm transition-colors"
          >
            Save Card
          </PendingButton>
        </div>
      </form>
    </div>
  );
}

function Field({ label, name, type = 'text', required, defaultValue }: {
  label: string; name: string; type?: string; required?: boolean; defaultValue?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </label>
      <input
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-colors"
      />
    </div>
  );
}
