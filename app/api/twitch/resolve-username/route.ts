import { NextRequest, NextResponse } from 'next/server';
import { resolveTwitchLogin, twitchCredentials } from '@/lib/twitch-helix';
import { limitTwitch } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const limited = await limitTwitch(req);
  if (limited) return limited;
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
