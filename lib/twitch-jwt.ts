import { createHmac, timingSafeEqual } from 'crypto';
import { currentSandboxId } from './db';

export interface TwitchJwtPayload {
  opaque_user_id: string;
  user_id?: string;
  channel_id: string;
  role: 'broadcaster' | 'moderator' | 'viewer' | 'external';
  exp: number;
  /** Only on tokens minted by the fake Twitch page (see signMockTwitchJwt): the sandbox they are valid in and who they log in as. */
  mock?: boolean;
  sandbox?: string;
  login?: string;
}

// Vercel uses Node 18+ so base64url encoding is available natively.
export function verifyTwitchJwt(token: string): TwitchJwtPayload | null {
  const secret = process.env.TWITCH_EXTENSION_SECRET;
  if (!secret) return null;

  try {
    const secretBuf = Buffer.from(secret, 'base64');
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, sig] = parts;
    const expected = createHmac('sha256', secretBuf)
      .update(`${header}.${payload}`)
      .digest('base64url');

    const given = Buffer.from(sig), want = Buffer.from(expected);
    if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as TwitchJwtPayload;

    if (decoded.exp < Date.now() / 1000) return null;

    return decoded;
  } catch {
    return null;
  }
}

// ── Sandbox emulation ──
// The fake Twitch page (Admin → Sandbox → Fake Twitch) runs the real panel against a sandbox with a pretend Twitch helper. Its
// tokens are signed with a key derived from SESSION_SECRET (never the extension secret), only an admin can mint one, and the
// token names the sandbox it is for: it is refused anywhere else, so it can't be used against production data.
const mockKey = (): string | null => {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 16 ? `tcg-mock-ext:${s}` : null;
};
const mockSig = (key: string, data: string) => createHmac('sha256', key).update(data).digest('base64url');

export function signMockTwitchJwt(claims: Omit<TwitchJwtPayload, 'exp' | 'mock'> & { sandbox: string }, ttlSeconds = 4 * 3600): string | null {
  const key = mockKey();
  if (!key) return null;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ ...claims, mock: true, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  return `${header}.${payload}.${mockSig(key, `${header}.${payload}`)}`;
}

function verifyMockJwt(token: string): TwitchJwtPayload | null {
  const key = mockKey();
  const parts = token.split('.');
  if (!key || parts.length !== 3) return null;
  try {
    const expected = Buffer.from(mockSig(key, `${parts[0]}.${parts[1]}`));
    const given = Buffer.from(parts[2]);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as TwitchJwtPayload;
    return decoded.mock && decoded.sandbox && decoded.exp >= Date.now() / 1000 ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * What the Extension routes call: a real Twitch token (verifyTwitchJwt), or a fake-Twitch token that is only honoured while
 * the request is inside the sandbox it was minted for.
 */
export async function verifyExtensionAuth(token: string): Promise<TwitchJwtPayload | null> {
  const real = verifyTwitchJwt(token);
  if (real) return real;
  const mock = verifyMockJwt(token);
  if (!mock) return null;
  return (await currentSandboxId()) === mock.sandbox ? mock : null;
}

/** Pulls a Twitch Extension JWT out of an `Authorization: Bearer <jwt>` header. */
export function getBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/**
 * The viewer's numeric Twitch user ID, or undefined if it isn't known.
 *  - Viewers who shared their identity have `user_id` in the JWT.
 *  - Broadcasters can't be prompted (Twitch's requestIdShare is a no-op on your own channel) and
 *    their token carries no `user_id`, but `role: "broadcaster"` is signed by Twitch and means the
 *    viewer owns the channel, so `channel_id` is their user ID.
 */
export function getTwitchUserId(payload: TwitchJwtPayload): string | undefined {
  if (payload.user_id) return payload.user_id;
  if (payload.role === 'broadcaster' && payload.channel_id) return payload.channel_id;
  return undefined;
}
