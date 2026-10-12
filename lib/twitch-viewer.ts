import { NextResponse } from 'next/server';
import { getTwitchOpaqueUser } from './kv';
import { getBearerToken, verifyExtensionAuth } from './twitch-jwt';

const DEV_OPAQUE_ID = 'dev_mock_opaque';

/**
 * The viewer behind a Twitch Extension request: signed JWT -> opaque ID -> linked username. Never read from the body or query.
 * (Dev mode, no extension secret configured, accepts any bearer, like the other extension routes.)
 */
export async function extensionViewer(req: Request): Promise<{ username: string } | { response: NextResponse }> {
  const token = getBearerToken(req);
  if (!token) return { response: NextResponse.json({ error: 'Missing authorization token' }, { status: 401 }) };
  const payload = await verifyExtensionAuth(token);
  const devMode = !payload && !process.env.TWITCH_EXTENSION_SECRET;
  if (!payload && !devMode) return { response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }) };
  const username = await getTwitchOpaqueUser(payload?.opaque_user_id ?? DEV_OPAQUE_ID);
  if (!username) return { response: NextResponse.json({ error: 'Log in first.' }, { status: 401 }) };
  return { username };
}
