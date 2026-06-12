import { NextRequest, NextResponse } from 'next/server';
import { saveTwitchOpaqueUser, getUserProfile, saveUserProfile } from '@/lib/kv';
import { verifyTwitchJwt } from '@/lib/twitch-jwt';

export const dynamic = 'force-dynamic';

let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getAppAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires_at) return cachedToken.access_token;
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

// POST /api/twitch/login
// Verifies the Extension JWT, extracts user_id, resolves Twitch username via Helix,
// saves the opaque→username mapping, and creates the user profile if needed.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

  const payload = verifyTwitchJwt(token);
  if (!payload) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });

  const numericUserId = payload.user_id;
  if (!numericUserId) {
    return NextResponse.json({ error: 'Identity not shared yet' }, { status: 403 });
  }

  const clientId     = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Twitch credentials not configured' }, { status: 500 });
  }

  let username: string | null = null;
  try {
    const accessToken = await getAppAccessToken();
    const helixRes = await fetch(`https://api.twitch.tv/helix/users?id=${numericUserId}`, {
      headers: {
        'Client-ID':     clientId,
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    if (helixRes.ok) {
      const data = await helixRes.json() as { data: Array<{ login: string }> };
      username = data.data?.[0]?.login ?? null;
    }
  } catch {
    // fall through to error below
  }

  if (!username) {
    return NextResponse.json({ error: 'Could not resolve Twitch username' }, { status: 502 });
  }

  await saveTwitchOpaqueUser(payload.opaque_user_id, username);

  const existing = await getUserProfile(username);
  if (!existing) {
    await saveUserProfile({
      username,
      displayName: username,
      twitchId: numericUserId,
      createdAt: Date.now(),
    });
  } else if (!existing.twitchId) {
    await saveUserProfile({ ...existing, twitchId: numericUserId });
  }

  return NextResponse.json({ username });
}
