import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin-guard';
import { currentSandboxId } from '@/lib/db';
import { cleanTestUsername } from '@/lib/sandbox-tools';
import { signMockTwitchJwt } from '@/lib/twitch-jwt';

export const dynamic = 'force-dynamic';

// POST /api/admin/sandbox/ext-token — used by the fake Twitch page's pretend extension helper (public/twitch-panel/mock-twitch-ext.js).
// Mints a token that looks like what Twitch hands the panel, for a viewer of the sandbox you are in. Admin only, and the token
// is only honoured inside that same sandbox (lib/twitch-jwt.ts verifyExtensionAuth).
//   body: { as?: string (the viewer's login; empty = not logged in to Twitch), share?: boolean (shared their identity), role?: 'viewer' | 'broadcaster' }
export async function POST(req: NextRequest) {
  try { await requireAdmin(); } catch { return NextResponse.json({ error: 'Admin only' }, { status: 401 }); }
  const sandbox = await currentSandboxId();
  if (!sandbox) return NextResponse.json({ error: 'Enter a sandbox first (Admin → Sandbox).' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { as?: unknown; share?: unknown; role?: unknown };
  const login = typeof body.as === 'string' ? cleanTestUsername(body.as) : '';
  const share = body.share === true && !!login;
  const role = body.role === 'broadcaster' && login ? 'broadcaster' : 'viewer';
  // Twitch opaque IDs: "U…" for a viewer logged in to Twitch, "A…" for an anonymous one. Stable per login so mappings persist.
  const opaque = login ? `Umock${login}` : `Amock${sandbox}`;
  // A made-up numeric Twitch ID, stable per login.
  let n = 7;
  for (const c of login) n = (n * 31 + c.charCodeAt(0)) % 900_000_000;
  const userId = String(100_000_000 + n);

  const token = signMockTwitchJwt({
    opaque_user_id: opaque,
    ...(share ? { user_id: userId } : {}),
    channel_id: '1',
    role,
    sandbox,
    ...(login ? { login } : {}),
  });
  if (!token) return NextResponse.json({ error: 'SESSION_SECRET is not set, so a fake token cannot be signed.' }, { status: 500 });
  return NextResponse.json({ token, opaqueId: opaque, userId: share ? userId : undefined, login: login || null, role, sandbox });
}
