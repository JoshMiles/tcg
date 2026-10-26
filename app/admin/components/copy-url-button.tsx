'use client';
import { Icon } from '@/app/components/Icon';
import { useState } from 'react';

/** Copies the OBS overlay URL. An icon button for the sidebar footer. */
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
      title={copied ? 'Copied' : 'Copy the OBS overlay URL'}
      aria-label={copied ? 'Copied' : 'Copy the OBS overlay URL'}
      className="aside-item w-8 h-8 shrink-0 flex items-center justify-center rounded-lg bg-white/4 hover:bg-white/9 text-gray-300 hover:text-white transition-colors"
    >
      <Icon name={copied ? 'check' : 'copy'} className={copied ? 'text-green-400' : ''} />
    </button>
  );
}
