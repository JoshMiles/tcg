'use client';
import type { ReactNode } from 'react';

/** Accessible on/off switch used across the admin wizards. */
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex items-start gap-3 group text-left">
      <span className={`mt-0.5 w-10 h-6 rounded-full relative shrink-0 transition-colors ${checked ? 'bg-yellow-500' : 'bg-gray-700'}`}>
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
      </span>
      <span>
        <span className="block text-sm text-gray-200 group-hover:text-white transition-colors">{label}</span>
        {hint && <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>}
      </span>
    </button>
  );
}
