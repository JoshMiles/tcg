'use client';
import { useState } from 'react';
import { SeasonDialog } from './SeasonDialog';

export function NewSeasonButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-gray-950 font-bold rounded-xl text-sm transition-colors"
      >
        + New Season
      </button>
      <SeasonDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
