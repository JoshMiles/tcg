import { NextRequest, NextResponse } from 'next/server';
import { saveTwitchOpaqueUser, ensureUserProfile } from '@/lib/kv';
import { verifyTwitchJwt, getBearerToken } from '@/lib/twitch-jwt';

const DEV_OPAQUE_ID = 'dev_mock_opaque';

export async function POST(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
  }

  const payload = verifyTwitchJwt(token);
  // In dev mode (no TWITCH_EXTENSION_SECRET), allow with a mock opaque ID
  const devMode = !payload && !process.env.TWITCH_EXTENSION_SECRET;
  if (!payload && !devMode) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const { username } = await req.json() as { username?: string };
  const clean = username?.toLowerCase().trim();
  if (!clean) return NextResponse.json({ error: 'username required' }, { status: 400 });

  const opaqueId = payload?.opaque_user_id ?? DEV_OPAQUE_ID;
  await saveTwitchOpaqueUser(opaqueId, clean);
  await ensureUserProfile(clean, payload?.user_id);

  return NextResponse.json({ username: clean, opaqueId });
}
