import { NextRequest, NextResponse } from 'next/server';
import { getSession, isSameOrigin } from '@/lib/session';
import {
  isDiscordDmConfigured,
  getDiscordLink,
  unlinkDiscord,
  updateDiscordKinds,
  sendTestDiscordDm,
} from '@/lib/discord-user';
import { toDiscordLinkView, sanitizeDiscordKinds } from '@/lib/discord-dm-core';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const enabled = isDiscordDmConfigured();
  const link = await getDiscordLink(session.username);

  return NextResponse.json({
    enabled,
    linked: link ? toDiscordLinkView(link) : null,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { kinds?: unknown; test?: boolean };

  if (body.test) {
    const testRes = await sendTestDiscordDm(session.username);
    if (!testRes.ok) {
      return NextResponse.json(
        { error: testRes.error === 'closed' ? 'closed' : testRes.error || 'Failed to send test message' },
        { status: testRes.error === 'closed' ? 403 : 500 },
      );
    }
    const link = await getDiscordLink(session.username);
    return NextResponse.json({ ok: true, linked: link ? toDiscordLinkView(link) : null });
  }

  if (Array.isArray(body.kinds)) {
    const kinds = sanitizeDiscordKinds(body.kinds);
    const updated = await updateDiscordKinds(session.username, kinds);
    if (!updated) return NextResponse.json({ error: 'not_linked' }, { status: 404 });
    return NextResponse.json({ ok: true, linked: toDiscordLinkView(updated) });
  }

  return NextResponse.json({ error: 'bad_request' }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isSameOrigin(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 });

  await unlinkDiscord(session.username);
  return NextResponse.json({ ok: true });
}
