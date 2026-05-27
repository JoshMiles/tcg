'use client';
import { useState } from 'react';

export function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm text-yellow-300 break-all select-all">
        {url}
      </code>
      <button
        onClick={copy}
        className="shrink-0 px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors"
      >
        {copied ? '✓' : 'Copy'}
      </button>
    </div>
  );
}
