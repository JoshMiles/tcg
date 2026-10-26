import { siteClosedResponse } from '@/lib/access';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, isSameOrigin } from '@/lib/session';
import { addDevice, listDevices, pushConfigured, pushPublicKey, removeDevice, sendTestPush } from '@/lib/push';

// The logged-in viewer's alert devices. Who they are comes from the signed session, never the body.
// GET: the public VAPID key and their devices. POST: { subscription } adds this device, { test: true } sends a test alert.
// DELETE: { endpoint } (this browser) or { id } (a device from the list).
async function who(req: NextRequest | null) {
  if (req && !isSameOrigin(req)) return { res: NextResponse.json({ error: 'Bad origin' }, { status: 403 }) };
  const session = await getSession();
  if (!session) return { res: NextResponse.json({ error: 'Log in with Twitch first.' }, { status: 401 }) };
  return { user: session.username.toLowerCase() };
}

export async function GET() {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  const w = await who(null);
  if (!w.user) return w.res;
  if (!pushConfigured()) return NextResponse.json({ enabled: false, devices: [] });
  return NextResponse.json({ enabled: true, publicKey: pushPublicKey(), devices: await listDevices(w.user) });
}

export async function POST(req: NextRequest) {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  const w = await who(req);
  if (!w.user) return w.res;
  const body = (await req.json().catch(() => null)) as { subscription?: unknown; test?: unknown } | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send JSON.' }, { status: 400 });
  try {
    if (body.test === true) {
      if (!pushConfigured()) return NextResponse.json({ error: 'Alerts are not set up on this site yet.' }, { status: 400 });
      const r = await sendTestPush(w.user);
      return NextResponse.json({ ...r, devices: await listDevices(w.user) });
    }
    const r = await addDevice(w.user, body.subscription, req.headers.get('user-agent') ?? '');
    return r.ok ? NextResponse.json({ id: r.id, devices: r.devices }) : NextResponse.json({ error: r.error }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Could not save right now. Try again.' }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  const closed = await siteClosedResponse();
  if (closed) return closed;
  const w = await who(req);
  if (!w.user) return w.res;
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown; id?: unknown } | null;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Send JSON.' }, { status: 400 });
  try {
    return NextResponse.json({ devices: await removeDevice(w.user, body) });
  } catch {
    return NextResponse.json({ error: 'Could not save right now. Try again.' }, { status: 503 });
  }
}
