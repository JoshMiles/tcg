import { Spinner } from 'cheesy-tcg';

export const Sizes = () => (
  <div className="bg-gray-950 p-5 flex items-center gap-4 text-yellow-400">
    <Spinner />
    <Spinner className="w-5 h-5" />
    <Spinner className="w-8 h-8 text-gray-300" />
  </div>
);

export const InAButton = () => (
  <div className="bg-gray-950 p-5">
    <button disabled className="inline-flex items-center gap-2 rounded-xl bg-yellow-500 px-4 py-2 text-sm font-bold text-gray-950 opacity-80">
      <Spinner /> Saving
    </button>
  </div>
);
