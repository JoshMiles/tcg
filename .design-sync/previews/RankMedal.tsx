import { RankMedal } from 'cheesy-tcg';

const ROWS = [['Cheesygidds', 4210], ['pixelpanda', 3875], ['moonlitmaple', 3120], ['tobyplays', 2604], ['saltyspud', 1980]] as const;

export const Podium = () => (
  <div className="bg-gray-950 p-5 flex items-center gap-5 text-2xl">
    <RankMedal rank={1} /><RankMedal rank={2} /><RankMedal rank={3} /><RankMedal rank={4} className="text-base font-bold text-gray-400" />
  </div>
);

export const LeaderboardRows = () => (
  <div className="bg-gray-950 p-4">
    <ol className="rounded-2xl border border-gray-800 bg-gray-900/70 divide-y divide-gray-800 w-80">
      {ROWS.map(([name, pts], i) => (
        <li key={name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
          <span className="w-6 text-center text-lg font-bold text-gray-400"><RankMedal rank={i + 1} /></span>
          <span className="flex-1 font-semibold text-gray-100">{name}</span>
          <span className="tabular-nums font-bold text-yellow-300">{pts.toLocaleString()}</span>
        </li>
      ))}
    </ol>
  </div>
);
