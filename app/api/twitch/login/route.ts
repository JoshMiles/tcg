import { NextRequest, NextResponse } from 'next/server';
import { saveTwitchOpaqueUser, ensureUserProfile } from '@/lib/kv';
import { verifyTwitchJwt, getBearerToken } from '@/lib/twitch-jwt';
import { resolveTwitchLogin, twitchCredentials } from '@/lib/twitch-helix';

export const dynamic = 'force-dynamic';

// POST /api/twitch/login
// Verifies the Extension JWT, extracts user_id, resolves Twitch username via Helix,
// saves the opaque→username mapping, and creates the user profile if needed.
export async function POST(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

  const payload = verifyTwitchJwt(token);
  if (!payload) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });

  const numericUserId = payload.user_id;
  if (!numericUserId) {
    return NextResponse.json({ error: 'Identity not shared yet' }, { status: 403 });
  }

  if (!twitchCredentials()) {
    return NextResponse.json({ error: 'Twitch credentials not configured' }, { status: 500 });
  }

  const username = await resolveTwitchLogin(numericUserId).catch(() => null);
  if (!username) {
    return NextResponse.json({ error: 'Could not resolve Twitch username' }, { status: 502 });
  }

  await saveTwitchOpaqueUser(payload.opaque_user_id, username);
  await ensureUserProfile(username, numericUserId);

  return NextResponse.json({ username });
}
