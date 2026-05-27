import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeason, getSeasonCards } from '@/lib/kv';
import { updateCard } from '../../../../actions';

export default async function EditCardPage({
  params,
}: {
  params: Promise<{ id: string; cardId: string }>;
}) {
  const { id, cardId } = await params;
  const [season, cards] = await Promise.all([getSeason(id), getSeasonCards(id)]);
  if (!season) notFound();

  const card = cards.find(c => c.id === cardId);
  if (!card) notFound();

  const updateThisCard = updateCard.bind(null, id, cardId);

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Card</h1>
        <Link href={`/admin/seasons/${id}`} className="text-sm text-gray-400 hover:text-white">
          ← {season.name}
        </Link>
      </div>

      <form action={updateThisCard} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <Field label="Card Number" name="number" type="number" defaultValue={String(card.number)} required />
        <Field label="Name" name="name" defaultValue={card.name} required />
        <Field label="Image URL" name="imageUrl" defaultValue={card.imageUrl} />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Stars (1–5)" name="stars" type="number" defaultValue={String(card.stars)} required />
          <Field label="Probability" name="probability" type="number" defaultValue={String(card.probability)} required />
        </div>

        {card.imageUrl && (
          <div>
            <p className="text-xs text-gray-500 mb-2">Current image</p>
            <img src={card.imageUrl} alt={card.name} className="h-32 object-contain rounded border border-gray-700" />
          </div>
        )}

        <div className="pt-2">
          <button
            type="submit"
            className="px-5 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-sm"
          >
            Save Card
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label, name, type = 'text', required, defaultValue,
}: {
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
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500"
      />
    </div>
  );
}
