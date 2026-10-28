import { NextResponse } from 'next/server';
import { bridgeStaffGuard } from '@/lib/bridge';
import { staffRefusal } from '@/lib/bridge-core';
import { rateLimit } from '@/lib/rate-limit';
import { chatCommandList } from '@/lib/twitch-chat';

// The chat commands the site runs (ROADMAP 58.6), for TCG Bridge's chat subscription: `{ commands: ['!pack', '!showoff', ...], chat }`, every word with its "!" and
// lowercased (`!pack`, `!showoff`, and each switched-on Chat commands card command with its aliases). The app forwards only messages whose first word is one of
// these. `chat` is false until the channel is connected with the chat permissions. Admin PCs only, like twitch-token; 30 calls a minute per PC.
export async function POST(req: Request) {
  const g = await bridgeStaffGuard(req);
  if (!g.ok) return g.response;
  const refused = staffRefusal(g.pc, 'chat-commands');
  if (refused) return NextResponse.json({ error: refused }, { status: 403 });
  if (!(await rateLimit('bridge-chat-commands', g.hash, 30, 60).catch(() => true))) {
    return NextResponse.json({ error: 'Too many calls. Wait a minute.' }, { status: 429, headers: { 'Retry-After': '60' } });
  }
  return NextResponse.json(await chatCommandList(), { headers: { 'Cache-Control': 'no-store' } });
}
