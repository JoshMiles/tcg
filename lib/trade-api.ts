import { NextResponse } from 'next/server';
import { getSession, isSameOrigin, type Session } from './session';
import type { TradeResult } from './trades';
import { recordServerError } from './error-spike';

/** The logged-in viewer for a trade endpoint, or the error response to return. Who they are comes from the signed session only. */
export async function requireViewer(req: Request): Promise<{ session: Session } | { response: NextResponse }> {
  if (!isSameOrigin(req)) return { response: NextResponse.json({ error: 'Bad origin' }, { status: 403 }) };
  const session = await getSession();
  if (!session) return { response: NextResponse.json({ error: 'Log in with Twitch first.' }, { status: 401 }) };
  return { session };
}

/** A 503 for an unexpected failure: the cause goes to the log, the browser gets a fixed friendly sentence. */
export function serverError(e: unknown, where: string, message: string): NextResponse {
  console.error(`[${where}]`, e instanceof Error ? e.message : e);
  recordServerError(); // hourly count for the error spike alert (lib/error-spike.ts)
  return NextResponse.json({ error: message }, { status: 503 });
}

/** The optional `getIds` of an accept body, `{ <collection entry>: [edition ids] }`: undefined when absent, null when it is the wrong shape. */
export function parseGetIds(v: unknown): Record<string, string[]> | undefined | null {
  if (v === undefined || v === null) return undefined;
  const okShape = typeof v === 'object' && !Array.isArray(v) && Object.values(v as object).every(x => Array.isArray(x) && x.every(y => typeof y === 'string'));
  return okShape ? (v as Record<string, string[]>) : null;
}

/** Turns an engine result into a JSON response. */
export function respond<T extends object>(result: TradeResult<T>): NextResponse {
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
