'use client';
import { useRef, useState, type ReactNode } from 'react';
import { createPortal, useFormStatus } from 'react-dom';
import { Spinner } from '@/app/components/PendingButton';
import { Dialog } from './Dialog';

/**
 * Drop-in replacement for the submit button of a destructive `<form action={serverAction}>`.
 * Clicking opens a confirmation dialog; confirming submits the surrounding form (or the form with
 * id `formId`, for buttons that live outside it). Cancel is focused by default so a stray Enter
 * doesn't destroy anything.
 */
export function ConfirmButton({
  message,
  title = 'Are you sure?',
  confirmLabel = 'Delete',
  className,
  children,
  formId,
  tone = 'danger',
  typeToConfirm,
  disabled = false,
}: {
  message: ReactNode;
  title?: string;
  confirmLabel?: string;
  className?: string;
  children: ReactNode;
  formId?: string;
  /** The confirm button's colour: red for something destructive (default), yellow for a switch that is not (activating a season). */
  tone?: 'danger' | 'primary';
  /** For something that can't be undone and affects everyone: the confirm button stays off until this exact phrase is typed. */
  typeToConfirm?: string;
  /** Keeps the opening button off (for a form whose own fields are not ready). */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const armed = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.toLowerCase();
  const { pending } = useFormStatus(); // the surrounding form is running its action
  const buttonRef = useRef<HTMLButtonElement>(null);

  function confirm() {
    if (!armed) return;
    setOpen(false);
    setTyped('');
    const form = formId
      ? (document.getElementById(formId) as HTMLFormElement | null)
      : buttonRef.current?.form;
    form?.requestSubmit();
  }

  return (
    <>
      <button ref={buttonRef} type="button" form={formId} disabled={pending || disabled} aria-busy={pending} className={`${className} inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait`} onClick={() => { setTyped(''); setOpen(true); }}>
        {pending && <Spinner />}
        {children}
      </button>
      {open &&
        createPortal(
          <Dialog open onClose={() => setOpen(false)} title={title} size="sm">
            <div className="p-6 space-y-5">
              <div className="text-sm text-gray-300 leading-relaxed">{message}</div>
              {typeToConfirm && (
                <label className="block text-xs text-gray-400">
                  Type <strong className="text-white font-mono">{typeToConfirm}</strong> to confirm
                  <input
                    value={typed}
                    onChange={e => setTyped(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } }}
                    autoComplete="off"
                    className="input w-full font-mono mt-1.5 input-error"
                  />
                </label>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm font-bold bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={!armed}
                  className={`btn ${tone === 'primary' ? 'btn-primary' : 'btn-error'} disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </Dialog>,
          document.body,
        )}
    </>
  );
}
