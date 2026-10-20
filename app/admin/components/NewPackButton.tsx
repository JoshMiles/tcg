'use client';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createDraftPack } from '../draft-actions';
import { Dialog } from './Dialog';
import { fieldClass } from './ui';

/** `newTab` opens the pack in a new tab and leaves this page alone (the season wizard has unsaved edits). */
export function NewPackDialog({ open, onClose, newTab = false }: { open: boolean; onClose: () => void; newTab?: boolean }) {
  const router = useRouter();
  const inputId = useId();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function close() {
    if (busy) return;
    setName('');
    setError('');
    onClose();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the pack a name.');
      return;
    }
    // Open the tab now: browsers block a window.open that comes after an await.
    const tab = newTab ? window.open('', '_blank') : null;
    setBusy(true);
    setError('');
    try {
      const { id } = await createDraftPack({ name: trimmed });
      setName('');
      onClose();
      if (newTab) {
        if (tab) tab.location.href = `/admin/packs/${id}`; else window.open(`/admin/packs/${id}`, '_blank');
        setBusy(false);
      } else router.push(`/admin/packs/${id}`);
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : 'Could not create the pack.');
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} title="New pack" size="sm">
      <form onSubmit={onSubmit} className="p-6 space-y-4">
        <fieldset className="fieldset">
          <legend className="fieldset-legend"><label htmlFor={inputId}>Pack name</label></legend>
          <input
            id={inputId}
            autoFocus
            value={name}
            maxLength={80}
            onChange={e => { setName(e.target.value); if (error) setError(''); }}
            placeholder="e.g. Cheesy Starter Pack"
            className={fieldClass}
          />
          <p className="fieldset-label">Creates a draft pack and opens the pack workspace.</p>
          {error && <p role="alert" className="fieldset-label text-red-400">{error}</p>}
        </fieldset>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={close} disabled={busy} className="px-4 py-2 text-sm text-gray-300 hover:text-white">
            Cancel
          </button>
          <button type="submit" disabled={busy || !name.trim()} className="px-4 py-2 btn btn-primary rounded-lg text-sm disabled:opacity-50">
            {busy ? 'Creating…' : 'Create pack'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function NewPackButton({
  label = '+ New Pack',
  className = 'px-4 py-2 btn btn-primary rounded-xl text-sm transition-colors',
  newTab = false,
}: {
  label?: ReactNode;
  className?: string;
  newTab?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>
      <NewPackDialog open={open} onClose={() => setOpen(false)} newTab={newTab} />
    </>
  );
}

