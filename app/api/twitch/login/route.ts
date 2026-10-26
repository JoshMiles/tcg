import { NextRequest, NextResponse } from 'next/server';
import { saveTwitchOpaqueUser } from '@/lib/kv';
import { bindAccount } from '@/lib/account-bind';
import { verifyExtensionAuth, getBearerToken, getTwitchUserId } from '@/lib/twitch-jwt';
import { resolveTwitchLogin, twitchCredentials } from '@/lib/twitch-helix';
import { limitTwitch } from '@/lib/rate-limit';

// POST /api/twitch/login
// Verifies the Extension JWT, works out the viewer's Twitch user ID (shared identity, or the
// channel owner), resolves the username via Helix,
// saves the opaque→username mapping, and creates the user profile if needed.
export async function POST(req: NextRequest) {
  const limited = await limitTwitch(req);
  if (limited) return limited;
  const token = getBearerToken(req);
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 });

  const payload = await verifyExtensionAuth(token);
  if (!payload) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });

  const numericUserId = getTwitchUserId(payload);
  if (!numericUserId) {
    return NextResponse.json({ error: 'Identity not shared yet' }, { status: 403 });
  }

  // The fake Twitch page's token already names who is logging in (sandbox only), so there is no Helix lookup.
  if (payload.mock && payload.login) {
    await bindAccount(payload.login, numericUserId); // before the link is saved: a move removes the links to the login it moves
    await saveTwitchOpaqueUser(payload.opaque_user_id, payload.login);
    return NextResponse.json({ username: payload.login });
  }

  if (!twitchCredentials()) {
    return NextResponse.json({ error: 'Twitch credentials not configured' }, { status: 500 });
  }

  const username = await resolveTwitchLogin(numericUserId).catch(() => null);
  if (!username) {
    return NextResponse.json({ error: 'Could not resolve Twitch username' }, { status: 502 });
  }

  await bindAccount(username, numericUserId);
  await saveTwitchOpaqueUser(payload.opaque_user_id, username);

  return NextResponse.json({ username });
}
