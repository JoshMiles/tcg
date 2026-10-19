'use client';
import { useState } from 'react';
import { renderMessage, SAMPLE_VARS } from '@/lib/mixitup-core';

/** The message box with a live preview built from sample values. */
export function MessageField({ id, name, defaultValue, max }: { id: string; name: string; defaultValue: string; max: number }) {
  const [text, setText] = useState(defaultValue);
  return (
    <div className="space-y-2">
      <textarea id={id} name={name} value={text} onChange={e => setText(e.target.value)} maxLength={max} rows={3}
        className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-hidden" />
      <p className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-sm text-gray-300" aria-live="polite">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mr-2">Preview</span>{renderMessage(text, SAMPLE_VARS) || '(empty)'}
      </p>
    </div>
  );
}
