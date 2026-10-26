import type { ReactNode } from 'react';
import { requireSiteAccess } from '@/lib/access';
import { ClosedShell } from './ClosedShell';
import { SiteShell } from './SiteShell';

/**
 * The frame for the pages that stay open while the site is closed to testers (privacy, terms, the not-found page): the site's frame for
 * someone who can use the site, the bare ClosedShell (no nav, search or site links) for someone who can't. Deciding that needs the
 * request, so these pages are not prerendered.
 */
export async function OpenPageShell({ children }: { children: ReactNode }) {
  if (!(await requireSiteAccess())) return <ClosedShell>{children}</ClosedShell>;
  return <SiteShell>{children}</SiteShell>;
}
