import { SiteShell } from '@/app/components/site/SiteShell';

// The public pages that look ONE thing up by its address (a copy, a unique number, a card's copies). They sit in their own route group,
// with the same frame as (site). The frame streams the page behind a Suspense boundary (the access gate), so the response is a 200 before
// the page runs: a missing copy shows "That page isn't here" with a 200 and a noindex tag, not a real 404.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
