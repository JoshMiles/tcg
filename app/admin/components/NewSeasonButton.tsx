'use client';
import { useState } from 'react';
import { SeasonDialog } from './SeasonDialog';

export function NewSeasonButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 tcg-btn rounded-xl text-sm transition-colors"
      >
        + New Season
      </button>
      <SeasonDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
