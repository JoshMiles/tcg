'use client';
import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
}: {
  message: ReactNode;
  title?: string;
  confirmLabel?: string;
  className?: string;
  children: ReactNode;
  formId?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function confirm() {
    setOpen(false);
    const form = formId
      ? (document.getElementById(formId) as HTMLFormElement | null)
      : buttonRef.current?.form;
    form?.requestSubmit();
  }

  return (
    <>
      <button ref={buttonRef} type="button" form={formId} className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open &&
        createPortal(
          <Dialog open onClose={() => setOpen(false)} title={title} size="sm">
            <div className="p-6 space-y-5">
              <div className="text-sm text-gray-300 leading-relaxed">{message}</div>
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
                  className="px-4 py-2 text-sm font-bold bg-red-600 hover:bg-red-500 text-white rounded-xl transition-colors"
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
