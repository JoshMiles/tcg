'use client';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/** Small spinner that inherits the text colour. */
export function Spinner({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Submit button for a `<form action={serverAction}>`: while the action runs it is disabled and shows a spinner
 * (optionally with `pendingLabel`), so a slow action visibly "took" and can't be pressed twice.
 */
export function PendingButton({
  children, pendingLabel, disabled, className = '', ...rest
}: { children: ReactNode; pendingLabel?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending: formPending, data } = useFormStatus();
  // A button with name/value (several submit buttons in one form) only spins when it is the one that was pressed.
  const pending = formPending && (!rest.name || data?.get(rest.name) === rest.value);
  return (
    <button
      type="submit"
      {...rest}
      disabled={disabled || formPending}
      aria-busy={pending}
      className={`${className} inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-wait`}
    >
      {pending && <Spinner />}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
