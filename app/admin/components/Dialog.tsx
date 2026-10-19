'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Dialog({
  open,
  onClose,
  title,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // React's `open` prop is a non-modal dialog. Promote it with showModal() so Esc and the focus trap are native.
  // Re-check after every render: a parent update can leave the attribute set without the top layer.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el || el.matches(':modal')) return;
    if (el.open) el.close();
    el.showModal();
    el.querySelector<HTMLElement>('[autofocus]')?.focus();
  });
  useEffect(() => () => {
    const el = ref.current;
    if (el?.open) el.close();
  }, []);

  if (!open) return null;

  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-2xl' }[size];
  const tree = (
    <dialog
      ref={ref}
      open
      className="modal modal-open"
      aria-labelledby={title ? titleId : undefined}
      onCancel={e => { e.preventDefault(); onClose(); }}
    >
      <div className={`modal-box card tcg-panel tcg-modal ${width}`}>
        <div className="holo-strip" />
        {title && (
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800">
            <h2 id={titleId} className="font-bold text-white text-lg">{title}</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="text-gray-500 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors text-xl leading-none"
            >
              ×
            </button>
          </div>
        )}
        {children}
      </div>
      <button type="button" aria-label="Close" tabIndex={-1} className="modal-backdrop" onClick={onClose} />
    </dialog>
  );

  if (!mounted) return tree;
  return createPortal(tree, document.body);
}
