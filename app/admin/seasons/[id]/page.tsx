import { notFound } from 'next/navigation';
import { getSeason } from '@/lib/kv';
import { updateSeason } from '../../actions';
import { SeasonFields } from '../../components/SeasonFields';

export const dynamic = 'force-dynamic';

export default async function SeasonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const season = await getSeason(id);
  if (!season) notFound();

  const updateThisSeason = updateSeason.bind(null, id);

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Season Settings</h1>
        {season.active && (
          <span className="text-xs px-2 py-1 bg-green-900 text-green-400 rounded-full">Active</span>
        )}
      </div>

      <form action={updateThisSeason} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <SeasonFields
          defaults={{
            name: season.name,
            collectionName: season.collectionName,
            maxConcurrentPacks: season.maxConcurrentPacks,
            active: season.active,
          }}
        />
        <div className="pt-2">
          <button
            type="submit"
            className="px-5 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-sm"
          >
            Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
