import { createHmac } from 'crypto';

export interface TwitchJwtPayload {
  opaque_user_id: string;
  user_id?: string;
  channel_id: string;
  role: 'broadcaster' | 'moderator' | 'viewer' | 'external';
  exp: number;
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

    if (sig !== expected) return null;

    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    ) as TwitchJwtPayload;

    if (decoded.exp < Date.now() / 1000) return null;

    return decoded;
  } catch {
    return null;
  }
}

/** Pulls a Twitch Extension JWT out of an `Authorization: Bearer <jwt>` header. */
export function getBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}
