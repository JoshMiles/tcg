import { Dialog } from 'cheesy-tcg';

// The dialog is a native modal. The transform keeps a non-modal first paint inside this card.
export const Open = () => (
  <div className="bg-gray-950" style={{ transform: 'translateZ(0)', height: 360 }}>
    <Dialog open title="Upgrade this print?" onClose={() => {}} size="sm">
      <div className="px-6 py-5 space-y-4">
        <p className="text-sm text-gray-300">Spend 3 duplicates of <span className="font-bold text-yellow-300">Angrygidds</span> to turn your print into a Reverse Holo.</p>
        <div className="flex justify-end gap-2">
          <button className="px-3 py-2 text-sm font-semibold text-gray-300 rounded-xl hover:bg-gray-800">Cancel</button>
          <button className="rounded-xl bg-yellow-500 hover:bg-yellow-400 px-4 py-2 text-sm font-bold text-gray-950">Upgrade</button>
        </div>
      </div>
    </Dialog>
  </div>
);
