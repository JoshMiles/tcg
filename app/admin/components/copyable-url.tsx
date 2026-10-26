'use client';
import { Icon } from '@/app/components/Icon';
import { maskUrlKey } from '@/lib/mask-url-key';
import { useState } from 'react';

/** Shows a URL with a Copy button. An overlay URL (it has a `key=`) shows the key as dots until Reveal; Copy always copies the real URL. */
export function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const masked = maskUrlKey(url) !== url;

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm text-yellow-300 break-all select-all">
        {masked && !revealed ? maskUrlKey(url) : url}
      </code>
      {masked && (
        <button
          type="button"
          onClick={() => setRevealed(v => !v)}
          aria-pressed={revealed}
          className="shrink-0 px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors"
        >
          {revealed ? 'Hide' : 'Reveal'}
        </button>
      )}
      <button
        onClick={copy}
        className="shrink-0 px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg transition-colors"
      >
        {copied ? <Icon name="check" /> : 'Copy'}
      </button>
    </div>
  );
}
