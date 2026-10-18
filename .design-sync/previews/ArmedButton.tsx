import { ArmedButton } from 'cheesy-tcg';

export const Destructive = () => (
  <div className="bg-gray-950 p-5">
    <ArmedButton
      onConfirm={() => {}}
      armedLabel="Sure? Delete the draft"
      className="px-3 py-2 text-sm font-semibold text-red-400 rounded-lg border border-red-500/30 hover:bg-red-500/10"
      armedClassName="px-3 py-2 text-sm font-bold text-red-300 bg-red-500/10 rounded-lg border border-red-500/40"
    >
      Delete draft
    </ArmedButton>
  </div>
);

export const Primary = () => (
  <div className="bg-gray-950 p-5 flex gap-3">
    <ArmedButton onConfirm={() => {}} className="rounded-xl bg-yellow-500 hover:bg-yellow-400 px-4 py-2 text-sm font-bold text-gray-950">
      Accept trade
    </ArmedButton>
    <ArmedButton onConfirm={() => {}} disabled className="rounded-xl bg-yellow-500 px-4 py-2 text-sm font-bold text-gray-950 disabled:opacity-50">
      Accept trade
    </ArmedButton>
  </div>
);
