import { siteClosedResponse } from '@/lib/access';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, isSameOrigin } from '@/lib/session';
import { deleteEmail, emailConfigured, getEmail, setEmailKinds, startEmail } from '@/lib/email';
import { emailStatus, maskAddress, type EmailRecord } from '@/lib/email-core';

export const dynamic = 'force-dynamic';

// The logged-in viewer's email notifications. Who they are comes from the signed session, never the body.
// GET: whether email is set up here and their record (address masked). POST: { address } starts (or restarts) the double opt-in,
// { kinds } chooses what is sent. DELETE: removes the address. Hidden (enabled: false) until RESEND_API_KEY is set.
async function who(req: NextRequest | null) {
  if (req && !isSameOrigin(req)) return { res: NextResponse.json({ error: 'Bad origin' }, { status: 403 }) };
  const session = await getSession();
  if (!session) return { res: NextResponse.json({ error: 'Log in with Twitch first.' }, { status: 401 }) };
  return { user: session.username.toLowerCase() };
}

const view = (r: EmailRecord | null) => (r ? { address: maskAddress(r.address), status: emailStatus(r), off: r.off ?? null, kinds: r.kinds } : null);

export async function GET() {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  const w = await who(null);
  if (!w.user) return w.res;
  if (!emailConfigured()) return NextResponse.json({ enabled: false, email: null });
  return NextResponse.json({ enabled: true, email: view(await getEmail(w.user)) });
}

export async function POST(req: NextRequest) {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  const w = await who(req);
  if (!w.user) return w.res;
  const body = (await req.json().catch(() => null)) as { address?: unknown; kinds?: unknown; resend?: unknown } | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send JSON.' }, { status: 400 });
  if (!emailConfigured()) return NextResponse.json({ error: 'Email is not set up on this site yet.' }, { status: 400 });
  try {
    if (body.kinds !== undefined) {
      const r = await setEmailKinds(w.user, body.kinds);
      return r ? NextResponse.json({ email: view(r) }) : NextResponse.json({ error: 'Add an email address first.' }, { status: 400 });
    }
    let address = body.address;
    if (body.resend === true) {
      const cur = await getEmail(w.user);
      if (!cur) return NextResponse.json({ error: 'Add an email address first.' }, { status: 400 });
      address = cur.address;
    }
    const r = await startEmail(w.user, address);
    return r.ok ? NextResponse.json({ email: view(r.record) }) : NextResponse.json({ error: r.error }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Could not save right now. Try again.' }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  const w = await who(req);
  if (!w.user) return w.res;
  try {
    await deleteEmail(w.user);
    return NextResponse.json({ email: null });
  } catch {
    return NextResponse.json({ error: 'Could not save right now. Try again.' }, { status: 503 });
  }
}
