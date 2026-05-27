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
      className="w-full text-left px-3 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors"
    >
      {copied ? '✓ Copied!' : 'Copy Overlay URL'}
    </button>
  );
}
