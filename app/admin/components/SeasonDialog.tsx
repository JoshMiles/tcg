'use client';
import { useState } from 'react';
import { Dialog } from './Dialog';
import { createSeason } from '../actions';

export function SeasonDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [active, setActive] = useState(false);

  function handleClose() { setActive(false); onClose(); }

  return (
    <Dialog open={open} onClose={handleClose} title="New Season" size="sm">
      <form action={createSeason}>
        <input type="hidden" name="active" value={active ? 'true' : 'false'} />
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Season Name <span className="text-red-400">*</span>
            </label>
            <input
              name="name"
              required
              autoFocus
              placeholder="e.g. Season 2"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Collection Name <span className="text-red-400">*</span>
            </label>
            <input
              name="collectionName"
              required
              placeholder="e.g. Season2Deck"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 transition-colors"
            />
            <p className="text-xs text-gray-600 mt-1">No spaces — used as the KV storage key</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Max Concurrent Packs</label>
            <input
              name="maxConcurrentPacks"
              type="number"
              defaultValue="1"
              min="1"
              className="w-24 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-yellow-500 transition-colors"
            />
            <p className="text-xs text-gray-600 mt-1">Pack openings shown simultaneously on the overlay</p>
          </div>

          <button
            type="button"
            onClick={() => setActive(a => !a)}
            className="flex items-center gap-3 group"
          >
            <div className={`w-10 h-6 rounded-full relative transition-colors ${active ? 'bg-yellow-500' : 'bg-gray-700'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${active ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
            <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
              Set as active season
            </span>
          </button>
        </div>

        <div className="px-6 pb-6 flex items-center justify-between border-t border-gray-800 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-xl text-sm transition-colors"
          >
            Create Season →
          </button>
        </div>
      </form>
    </Dialog>
  );
}
