import { NextRequest, NextResponse } from 'next/server';
import { parseIncomingWebhook } from '@/lib/webhooks';
import { runCommand } from '@/lib/commands';
import { argsFrom, flatReply } from '@/lib/commands-core';

export const dynamic = 'force-dynamic';

// One webhook for every chat command (ROADMAP 19.2). Body: { secret, command, username, args? }. Mix It Up sends $username and
// $allargs. Answers 200 with { ok, message, vars } and each variable again at the top level, so "JSON to special identifiers" can read
// them. A refusal is { ok: false, message } with the command's own error text; an unknown command answers { ok: false, message: '' }.
export async function POST(req: NextRequest) {
  const parsed = await parseIncomingWebhook(req);
  if (!parsed.ok) return parsed.response;

  const out = await runCommand({
    command: typeof parsed.body.command === 'string' ? parsed.body.command : '',
    username: parsed.username.replace(/^@/, ''),
    args: argsFrom(parsed.body),
  });
  return NextResponse.json(flatReply(out.ok, out.message, out.vars));
}
