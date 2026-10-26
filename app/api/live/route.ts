import { NextResponse, connection } from 'next/server';
import { getLiveStatus } from '@/lib/twitch-live';

// Public: is the channel live? Polled by the site every minute. The shared CDN cache keeps this to a handful of function
// calls no matter how many people have the site open; `null` means "unknown" (Twitch not configured / unreachable).
export async function GET() {
  await connection();
  const status = await getLiveStatus();
  return NextResponse.json(status, {
    headers: { 'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60' },
  });
}
