'use client';
import { useEffect, type ReactNode } from 'react';

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
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [open, onClose]);

  if (!open) return null;

  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-2xl' }[size];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-gray-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="flex min-h-full items-start justify-center p-4 pt-16">
        <div className={`relative w-full ${w} bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl shadow-black/60`}>
          {title && (
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800">
              <h2 className="font-bold text-white text-lg">{title}</h2>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors text-xl leading-none"
              >
                ×
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
