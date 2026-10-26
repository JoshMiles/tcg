import { notFound } from 'next/navigation';
import { getSeason } from '@/lib/kv';

// Checks the season exists before the page (loading.tsx next to this file wraps only the page, not this layout), so an unknown or draft
// season shows the not-found page. The site frame streams this behind its access gate, so that answer is a 200 with a noindex tag, not a 404.
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ seasonId: string }> }) {
  const { seasonId } = await params;
  const season = await getSeason(seasonId).catch(() => null);
  if (!season || season.status === 'draft') notFound();
  return children;
}
