import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSeason } from '@/lib/kv';
import { createPack } from '../../../../actions';
import { PackFields } from '../../../../components/PackFields';

export const dynamic = 'force-dynamic';

export default async function NewPackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const season = await getSeason(id);
  if (!season) notFound();

  const createPackForSeason = createPack.bind(null, id);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New Pack</h1>
        <Link href={`/admin/seasons/${id}`} className="text-sm text-gray-400 hover:text-white">
          ← {season.name}
        </Link>
      </div>

      <form action={createPackForSeason} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <PackFields />
        <div className="pt-2">
          <button
            type="submit"
            className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg"
          >
            Create Pack
          </button>
        </div>
      </form>
    </div>
  );
}
