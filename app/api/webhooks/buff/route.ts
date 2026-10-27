import { NextRequest, NextResponse } from 'next/server';
import { incomingSecretValid } from '@/lib/webhooks';
import { limitWebhook } from '@/lib/rate-limit';
import { runStreamDeck } from '@/lib/streamdeck';

// A Stream Deck button (through a Mix It Up command): { secret, buff, target?, username? } applies a buff, { secret, action, ... } a quick
// action. Always answers { ok, message } with a line for chat (ROADMAP 55.2, lib/streamdeck.ts).
export async function POST(req: NextRequest) {
  const limited = await limitWebhook(req);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!(await incomingSecretValid(body.secret, new URL(req.url).pathname))) return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
  return NextResponse.json(await runStreamDeck(body));
}
