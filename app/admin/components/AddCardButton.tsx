'use client';
import { useState } from 'react';
import { AddCardDialog } from './AddCardDialog';

export function AddCardButton({ packId }: { packId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 tcg-btn rounded-xl text-sm transition-colors"
      >
        + Add Card
      </button>
      <AddCardDialog open={open} onClose={() => setOpen(false)} packId={packId} />
    </>
  );
}
