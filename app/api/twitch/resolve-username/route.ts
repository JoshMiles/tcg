import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Module-scoped token cache — survives across requests in the same serverless instance
let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getAppAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires_at) {
    return cachedToken.access_token;
  }

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.TWITCH_CLIENT_ID!,
      client_secret: process.env.TWITCH_CLIENT_SECRET!,
      grant_type:    'client_credentials',
    }),
  });

  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    access_token: data.access_token,
    expires_at:   Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.access_token;
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');

  if (!userId || !/^\d+$/.test(userId)) {
    return NextResponse.json({ error: 'valid numeric userId required' }, { status: 400 });
  }

  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Twitch credentials not configured' }, { status: 500 });
  }

  try {
    const token = await getAppAccessToken();

    const res = await fetch(`https://api.twitch.tv/helix/users?id=${userId}`, {
      headers: {
        'Client-ID':     clientId,
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Twitch API error' }, { status: 502 });
    }

    const data = await res.json() as { data: Array<{ login: string }> };
    const login = data.data?.[0]?.login ?? null;

    return NextResponse.json({ username: login });
  } catch {
    return NextResponse.json({ error: 'Failed to resolve username' }, { status: 500 });
  }
}
