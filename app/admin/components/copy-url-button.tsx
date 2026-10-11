'use client';
import { useState } from 'react';

const OVERLAY_URL = 'https://tcg-khaki.vercel.app/overlay.html';

export function CopyUrlButton() {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(OVERLAY_URL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={copy}
      title="Copy Overlay URL"
      className="aside-item w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors"
    >
      <span aria-hidden>{copied ? '✓' : '📋'}</span>
      <span className="aside-label">{copied ? 'Copied!' : 'Copy Overlay URL'}</span>
    </button>
  );
}
