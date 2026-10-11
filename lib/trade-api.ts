import { NextResponse } from 'next/server';
import { getSession, isSameOrigin, type Session } from './session';
import type { TradeResult } from './trades';

/** The logged-in viewer for a trade endpoint, or the error response to return. Who they are comes from the signed session only. */
export async function requireViewer(req: Request): Promise<{ session: Session } | { response: NextResponse }> {
  if (!isSameOrigin(req)) return { response: NextResponse.json({ error: 'Bad origin' }, { status: 403 }) };
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: 'Log in with Twitch first.' }, { status: 401 }) };
  return { session };
}

/** Turns an engine result into a JSON response. */
export function respond<T extends object>(result: TradeResult<T>): NextResponse {
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
