'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A button for an action that is not a form submit (a server action called from a handler) but should not fire on a stray click:
 * the first click arms it ("Sure?"), the second runs `onConfirm`, and it relaxes after a few seconds. Like the trade buttons on the
 * public site. For a destructive form, use ConfirmButton instead.
 */
export function ArmedButton({ onConfirm, children, armedLabel = 'Sure?', className = '', armedClassName, disabled, title }: {
  onConfirm: () => void;
  children: ReactNode;
  armedLabel?: ReactNode;
  className?: string;
  /** Replaces `className` while armed (default: the same). */
  armedClassName?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <button
      type="button"
      disabled={disabled}
      title={armed ? 'Click again to confirm' : title}
      aria-live="polite"
      onClick={() => {
        if (timer.current) clearTimeout(timer.current);
        if (armed) { setArmed(false); onConfirm(); return; }
        setArmed(true);
        timer.current = setTimeout(() => setArmed(false), 4000);
      }}
      className={armed ? `btn btn-sm btn-error ${armedClassName || className}` : className}
    >
      {armed ? armedLabel : children}
    </button>
  );
}
