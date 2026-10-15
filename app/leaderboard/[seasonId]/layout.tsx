import { notFound } from 'next/navigation';
import { getSeason } from '@/lib/kv';

// Checks the season exists BEFORE the page's loading skeleton (loading.tsx next to this file wraps only the page, not this layout), so an
// unknown or draft season answers a real HTTP 404 while a real one still shows the skeleton while the board is worked out.
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ seasonId: string }> }) {
  const { seasonId } = await params;
  const season = await getSeason(seasonId).catch(() => null);
  if (!season || season.status === 'draft') notFound();
  return children;
}
