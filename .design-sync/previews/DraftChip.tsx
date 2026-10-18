import { DraftChip, StatusChip } from 'cheesy-tcg';

export const Default = () => (
  <div className="bg-gray-950 p-5"><DraftChip /></div>
);

export const InAPackList = () => (
  <div className="bg-gray-950 p-4 space-y-2">
    <div className="flex items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900/70 p-4 w-80">
      <div className="flex-1">
        <div className="font-bold text-white">Spooky Season Pack</div>
        <div className="text-xs text-gray-400">24 cards</div>
      </div>
      <DraftChip />
    </div>
    <div className="flex items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900/70 p-4 w-80">
      <div className="flex-1">
        <div className="font-bold text-white">Launch Pack</div>
        <div className="text-xs text-gray-400">28 cards</div>
      </div>
      <StatusChip active />
    </div>
  </div>
);
