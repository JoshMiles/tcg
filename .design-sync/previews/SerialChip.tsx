import { SerialChip } from 'cheesy-tcg';

export const Tiers = () => (
  <div className="bg-gray-950 p-5 flex items-center gap-2">
    <SerialChip n={1} bonus={3} />
    <SerialChip n={4} bonus={2} />
    <SerialChip n={27} />
    <SerialChip n={112} est />
  </div>
);

export const InAFeedRow = () => (
  <div className="bg-gray-950 p-4">
    <div className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-900/70 px-3 py-2 text-sm w-80">
      <span className="font-semibold text-gray-100">pixelpanda</span>
      <span className="text-gray-400">pulled</span>
      <span className="font-bold text-yellow-300">Angrygidds</span>
      <SerialChip n={4} bonus={2} className="ml-auto" />
    </div>
  </div>
);
