import { NextRequest, NextResponse } from 'next/server';
import { deleteTwitchOpaqueUser } from '@/lib/kv';
import { verifyTwitchJwt } from '@/lib/twitch-jwt';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
  }

  const payload = verifyTwitchJwt(token);
  if (!payload) {
    // Dev mode — allow with opaque ID from body
    if (!process.env.TWITCH_EXTENSION_SECRET) {
      await deleteTwitchOpaqueUser('dev_mock_opaque');
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  await deleteTwitchOpaqueUser(payload.opaque_user_id);
  return NextResponse.json({ ok: true });
}
