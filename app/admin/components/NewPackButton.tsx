'use client';
import { useState } from 'react';
import { PackWizard } from './PackWizard';

export function NewPackButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 tcg-btn rounded-xl text-sm transition-colors"
      >
        + New Pack
      </button>
      <PackWizard open={open} onClose={() => setOpen(false)} />
    </>
  );
}
