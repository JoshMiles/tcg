'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CHANGELOG_SEEN_KEY, hasUnseenChanges } from '@/lib/changelog';

/** Link to /changelog with a small dot while the newest entry is newer than the viewer's last visit (kept in localStorage). */
export function ChangelogLink({ newest, className, children }: { newest: string; className?: string; children: React.ReactNode }) {
  const [unseen, setUnseen] = useState(false);
  useEffect(() => {
    try { setUnseen(hasUnseenChanges(localStorage.getItem(CHANGELOG_SEEN_KEY), newest)); } catch { /* storage blocked: no dot */ }
  }, [newest]);
  return (
    <Link href="/changelog" className={className}>
      {children}
      {unseen && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-yellow-400 align-middle" role="img" aria-label="New" />}
    </Link>
  );
}

/** Records that the viewer has seen the newest entry (rendered on /changelog). */
export function MarkChangelogSeen({ newest }: { newest: string }) {
  useEffect(() => {
    try { localStorage.setItem(CHANGELOG_SEEN_KEY, newest); } catch { /* ignore */ }
  }, [newest]);
  return null;
}
