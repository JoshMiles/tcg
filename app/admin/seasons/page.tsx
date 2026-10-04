import Link from 'next/link';
import { listSeasons, getPacksForSeason } from '@/lib/kv';
import { deleteSeasonAction, activateSeason } from '../actions';
import { NewSeasonButton } from '../components/NewSeasonButton';
import { StatusChip } from '../components/StatusChip';

export const dynamic = 'force-dynamic';

export default async function SeasonsPage() {
  const seasons = await listSeasons();
  seasons.sort((a, b) => b.createdAt - a.createdAt);

  const packStats = await Promise.all(
    seasons.map(async s => {
      const packs = await getPacksForSeason(s);
      return { id: s.id, total: packs.length, active: packs.filter(p => p.active).length };
    })
  );
  const packMap = Object.fromEntries(packStats.map(({ id, ...v }) => [id, v]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Seasons</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {seasons.length} season{seasons.length !== 1 ? 's' : ''} · one active at a time
          </p>
        </div>
        <NewSeasonButton />
      </div>

      {seasons.length === 0 ? (
        <div className="tcg-panel rounded-2xl py-20 text-center space-y-3">
          <p className="text-gray-500">No seasons yet</p>
          <NewSeasonButton />
        </div>
      ) : (
        <div className="space-y-4">
          {seasons.map(s => {
            const packs = packMap[s.id] ?? { total: 0, active: 0 };
            const activate = activateSeason.bind(null, s.id);
            const del = deleteSeasonAction.bind(null, s.id);
            return (
              <div
                key={s.id}
                className={`rounded-3xl p-[3px] transition-all ${
                  s.active
                    ? 'bg-gradient-to-r from-yellow-300 via-yellow-500 to-amber-600 shadow-glow'
                    : 'bg-gradient-to-r from-gray-700 to-gray-800'
                }`}
              >
                <div className="rounded-[1.35rem] bg-gray-900 overflow-hidden">
                  {s.active && <div className="holo-strip" />}
                  <div className="flex flex-wrap items-center gap-x-8 gap-y-4 p-5">
                    <div className="min-w-0 flex-1 basis-64">
                      <div className="flex items-center gap-3">
                        <h2 className="font-display text-2xl font-bold text-white truncate">{s.name}</h2>
                        <StatusChip active={s.active} />
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 font-semibold">
                        <code className="bg-gray-950 border border-gray-800 px-2 py-1 rounded-md text-gray-400">
                          {s.collectionName}
                        </code>
                        <span>Created {new Date(s.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="text-center">
                      <p className="font-display text-3xl font-bold text-yellow-400 tabular-nums leading-none">
                        {packs.total === 0 ? '—' : `${packs.active}/${packs.total}`}
                      </p>
                      <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider mt-1">Packs active</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {!s.active && (
                        <form action={activate}>
                          <button
                            type="submit"
                            className="px-3 py-2 text-xs font-bold bg-green-500/10 border border-green-400/30 hover:bg-green-500/20 text-green-300 rounded-xl transition-colors"
                          >
                            Activate
                          </button>
                        </form>
                      )}
                      <Link
                        href={`/admin/seasons/${s.id}`}
                        className="tcg-btn px-4 py-2 text-sm rounded-xl"
                      >
                        Manage →
                      </Link>
                      <form action={del}>
                        <button
                          type="submit"
                          className="px-3 py-2 text-xs font-bold text-red-400 hover:text-red-200 hover:bg-red-950/50 rounded-xl transition-colors"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
