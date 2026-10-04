import { NextRequest, NextResponse } from 'next/server';
import { resolveTwitchLogin, twitchCredentials } from '@/lib/twitch-helix';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');

  if (!userId || !/^\d+$/.test(userId)) {
    return NextResponse.json({ error: 'valid numeric userId required' }, { status: 400 });
  }

  if (!twitchCredentials()) {
    return NextResponse.json({ error: 'Twitch credentials not configured' }, { status: 500 });
  }

  try {
    return NextResponse.json({ username: await resolveTwitchLogin(userId) });
  } catch {
    return NextResponse.json({ error: 'Failed to resolve username' }, { status: 500 });
  }
}
