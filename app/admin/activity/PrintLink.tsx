'use client';
import Link from 'next/link';
import { createContext, useContext, type ReactNode } from 'react';
import { adminCopyHrefFor, copyHrefFor } from '@/lib/copy-link';
import type { ActivityEvent } from '@/lib/activity';

/** Collection name -> season id, so an event (which only knows its collection) can link to the print's page. */
export const PrintSeasons = createContext<Record<string, string>>({});

/**
 * Where an event's print opens: the admin print page for the admin panel, the public print page (`/c/<number>`) for mods, who have no
 * serials admin. Null when the event has no print to point at.
 */
export function usePrintHref(e: ActivityEvent, mod: boolean): string | null {
  const seasons = useContext(PrintSeasons);
  if (e.type !== 'pull' && e.type !== 'grant' && e.type !== 'upgrade') return null;
  const seasonId = (e.collectionName && seasons[e.collectionName]) || '';
  return mod ? copyHrefFor(e, seasonId) : adminCopyHrefFor(e, seasonId) ?? copyHrefFor(e, seasonId);
}

/** The card name in a feed row; opens the print when there is one. */
export function PrintLink({ event, mod, children }: { event: ActivityEvent; mod: boolean; children: ReactNode }) {
  const href = usePrintHref(event, mod);
  if (!href) return <span className="font-bold text-white">{children}</span>;
  return (
    <Link href={href} onClick={ev => ev.stopPropagation()} className="font-bold text-white hover:text-yellow-300 underline decoration-gray-600 underline-offset-2 hover:decoration-yellow-400">
      {children}
    </Link>
  );
}
