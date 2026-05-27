import Link from 'next/link';
import { listSeasons } from '@/lib/kv';
import { deleteSeasonAction } from '../actions';

export default async function SeasonsPage() {
  const seasons = await listSeasons();
  seasons.sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Seasons</h1>
        <Link
          href="/admin/seasons/new"
          className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-lg text-sm"
        >
          + New Season
        </Link>
      </div>

      {seasons.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center text-gray-400">
          No seasons yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {seasons.map(s => (
            <div
              key={s.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4"
            >
              {s.coverImageUrl && (
                <img src={s.coverImageUrl} alt={s.name} className="w-12 h-16 object-cover rounded" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{s.name}</span>
                  {s.active && (
                    <span className="text-xs px-2 py-0.5 bg-green-900 text-green-400 rounded-full">Active</span>
                  )}
                </div>
                <p className="text-sm text-gray-400 mt-0.5">Collection: {s.collectionName}</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Created {new Date(s.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Link
                  href={`/admin/seasons/${s.id}`}
                  className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg"
                >
                  Edit
                </Link>
                <form
                  action={async () => {
                    'use server';
                    await deleteSeasonAction(s.id);
                  }}
                >
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-sm bg-red-900 hover:bg-red-800 text-red-300 rounded-lg"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
