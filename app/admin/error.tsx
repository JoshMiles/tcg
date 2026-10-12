'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { Icon } from '@/app/components/Icon';

/** A page crashed. Show it inside the admin frame (sidebar still works) with a way to retry or leave. */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="mx-auto max-w-xl tcg-panel rounded-2xl px-6 py-12 text-center space-y-4" role="alert">
      <span className="mx-auto w-12 h-12 rounded-2xl bg-red-500/10 border border-red-400/30 text-red-300 flex items-center justify-center"><Icon name="warning" className="w-6 h-6" /></span>
      <div>
        <h1 className="text-xl font-bold text-white">This page hit a problem</h1>
        <p className="text-sm text-gray-400 mt-1">Something went wrong while loading it. Your data is not affected. Try again, or go somewhere else from the sidebar.</p>
        {error.digest && <p className="text-xs text-gray-600 mt-2 font-mono">Reference: {error.digest}</p>}
      </div>
      <div className="flex justify-center gap-2">
        <button onClick={reset} className="tcg-btn px-4 py-2 text-sm rounded-xl"><Icon name="refresh" className="mr-1.5" />Try again</button>
        <Link href="/admin" className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500">Dashboard</Link>
      </div>
    </div>
  );
}
