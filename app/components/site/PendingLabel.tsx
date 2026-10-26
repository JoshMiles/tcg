'use client';
import { useLinkStatus } from 'next/link';
import type { ReactNode } from 'react';

/** A link's contents that pulse while its page loads. For same-page `?param` links (tabs, season switchers), which show no `loading.tsx` skeleton. Must sit inside the `<Link>`. */
export function PendingLabel({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className={`inline-flex items-center gap-1.5${pending ? ' text-yellow-300 animate-pulse' : ''}`}>{children}</span>;
}
