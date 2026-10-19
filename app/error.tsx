'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { SiteMessage } from '@/app/components/site/SiteMessage';
import { reportProblemUrl } from '@/lib/site';

// A public page crashed. No navigation bar here (it may be what failed), just a way to retry or leave.
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const path = usePathname();
  return (
    <div className="min-h-screen flex items-center justify-center">
      <SiteMessage
        icon="warning" tone="red" title="Something went wrong"
        actions={<>
          <button onClick={reset} className="btn btn-primary px-4 py-2 text-sm rounded-xl">Try again</button>
          <a href={reportProblemUrl(path)} target="_blank" rel="noopener noreferrer" className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500">Report this</a>
          <Link href="/" className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500">Back home</Link>
        </>}
      >
        <p>We couldn&apos;t load this page. Your cards are safe. Try again in a moment.</p>
        {error.digest && <p className="text-xs text-gray-600 font-mono mt-2">Reference: {error.digest}</p>}
      </SiteMessage>
    </div>
  );
}
