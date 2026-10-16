'use client';
import { Icon } from '@/app/components/Icon';
import { useState } from 'react';

/** Copies the OBS overlay URL. Sized to sit beside the Preview button in the sidebar. */
export function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={copy}
      title="Copy the OBS overlay URL"
      className="aside-item flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.09] text-gray-300 hover:text-white text-xs font-semibold transition-colors"
    >
      <Icon name={copied ? 'check' : 'copy'} className={copied ? 'text-green-400' : ''} />
      <span className="aside-label truncate">{copied ? 'Copied' : 'Copy URL'}</span>
    </button>
  );
}
