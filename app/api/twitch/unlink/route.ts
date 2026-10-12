import { NextRequest, NextResponse } from 'next/server';
import { deleteTwitchOpaqueUser } from '@/lib/kv';
import { verifyExtensionAuth, getBearerToken } from '@/lib/twitch-jwt';

export async function POST(req: NextRequest) {
  const token = getBearerToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
  }

  const payload = await verifyExtensionAuth(token);
  // Dev mode (no TWITCH_EXTENSION_SECRET) — unlink the mock opaque ID
  if (!payload && process.env.TWITCH_EXTENSION_SECRET) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  await deleteTwitchOpaqueUser(payload?.opaque_user_id ?? 'dev_mock_opaque');
  return NextResponse.json({ ok: true });
}
