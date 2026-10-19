'use client';
import type { ReactNode } from 'react';

/** Accessible on/off switch used across the admin wizards. */
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer text-left">
      <input type="checkbox" role="switch" className="toggle toggle-primary mt-0.5" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm text-gray-200">{label}</span>
        {hint && <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}
