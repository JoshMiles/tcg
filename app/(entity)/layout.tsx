import { SiteShell } from '@/app/components/site/SiteShell';

// The public pages that look ONE thing up by its address (a copy, a unique number, a card's copies). They sit in their own route group,
// with the same frame as (site) but NO loading.tsx: a loading skeleton makes Next.js send the page shell (HTTP 200) before the page
// runs, so a missing copy could only show "That page isn't here" with a 200. Without it, notFound() answers a real 404.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
