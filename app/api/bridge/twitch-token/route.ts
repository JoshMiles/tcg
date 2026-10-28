import { NextResponse } from 'next/server';
import { bridgeStaffGuard } from '@/lib/bridge';
import { staffRefusal } from '@/lib/bridge-core';
import { rateLimit } from '@/lib/rate-limit';
import { channelAccessToken } from '@/lib/twitch-channel';
import { isTesting } from '@/lib/twitch-channel-core';
import { credentials } from '@/lib/twitch-oauth';

// A fresh access token for the connected Twitch channel (ROADMAP 58.1), for TCG Bridge's EventSub connection (58.2). The refresh token never
// leaves the site. Admin PCs only (an old paired PC needs its staff switch); 30 calls a minute per PC. The answer is never cached and never logged.
export async function POST(req: Request) {
  const g = await bridgeStaffGuard(req);
  if (!g.ok) return g.response;
  const refused = staffRefusal(g.pc, 'twitch-token');
  if (refused) return NextResponse.json({ error: refused }, { status: 403 });
  if (!(await rateLimit('bridge-twitch-token', g.hash, 30, 60).catch(() => true))) {
    return NextResponse.json({ error: 'Too many calls. Wait a minute.' }, { status: 429, headers: { 'Retry-After': '60' } });
  }
  const t = await channelAccessToken();
  if (!t.ok) {
    const [status, error] = t.error === 'not-connected' ? [404, 'No Twitch channel is connected.'] : t.error === 'rejected' ? [409, 'Twitch ended the connection. Connect the channel again on the site.'] : [503, 'Twitch could not be reached. Try again.'];
    return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
  // clientId: Helix wants it beside the token (the same Twitch app as the sign-in). testing: the account is not the live channel (58.1).
  return NextResponse.json({ accessToken: t.accessToken, expiresAt: t.expiresAt, userId: t.userId, login: t.login, clientId: credentials().clientId, testing: isTesting(t.login) }, { headers: { 'Cache-Control': 'no-store' } });
}
