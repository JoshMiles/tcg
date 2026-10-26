import { NextRequest, NextResponse } from 'next/server';
import { getTwitchOpaqueUser } from '@/lib/kv';
import { limitTwitch } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const limited = await limitTwitch(req);
  if (limited) return limited;
  const opaqueId = req.nextUrl.searchParams.get('opaqueId');
  if (!opaqueId) {
    return NextResponse.json({ error: 'opaqueId required' }, { status: 400 });
  }

  const username = await getTwitchOpaqueUser(opaqueId);
  return NextResponse.json({ username: username ?? null });
}
