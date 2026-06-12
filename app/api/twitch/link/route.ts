import { NextRequest, NextResponse } from 'next/server';
import { saveTwitchOpaqueUser, getUserProfile, saveUserProfile } from '@/lib/kv';
import { verifyTwitchJwt } from '@/lib/twitch-jwt';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
  }

  const payload = verifyTwitchJwt(token);
  if (!payload) {
    // In dev mode (no TWITCH_EXTENSION_SECRET), allow with a mock opaque ID
    if (!process.env.TWITCH_EXTENSION_SECRET) {
      const { username } = await req.json() as { username?: string };
      const clean = username?.toLowerCase().trim();
      if (!clean) return NextResponse.json({ error: 'username required' }, { status: 400 });
      await saveTwitchOpaqueUser('dev_mock_opaque', clean);
      await ensureUserProfile(clean);
      return NextResponse.json({ username: clean, opaqueId: 'dev_mock_opaque' });
    }
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const { username } = await req.json() as { username?: string };
  const clean = username?.toLowerCase().trim();
  if (!clean) {
    return NextResponse.json({ error: 'username required' }, { status: 400 });
  }

  await saveTwitchOpaqueUser(payload.opaque_user_id, clean);
  await ensureUserProfile(clean, payload.user_id);

  return NextResponse.json({
    username: clean,
    opaqueId: payload.opaque_user_id,
  });
}

async function ensureUserProfile(username: string, twitchId?: string): Promise<void> {
  const existing = await getUserProfile(username);
  if (!existing) {
    await saveUserProfile({
      username,
      displayName: username,
      twitchId,
      createdAt: Date.now(),
    });
  } else if (twitchId && !existing.twitchId) {
    await saveUserProfile({ ...existing, twitchId });
  }
}
