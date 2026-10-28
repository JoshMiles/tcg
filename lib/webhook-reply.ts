// Answers for Mix It Up's requests (ROADMAP 55.3): an optional `requestId` makes a retry safe (the first answer is replayed for 10
// minutes and nothing runs again), and every answer is a line on the Mix It Up Log tab (never Discord).
import { NextResponse } from 'next/server';
import { kv } from './db';
import { logMixItUp, type MixItUpLogEntry } from './mixitup';

const TTL_S = 600;
const WAIT_MS = 3000; // a repeat that arrives while the first is still running waits this long for its answer
const WHAT: Record<string, MixItUpLogEntry['what']> = { '/api/webhooks/pull': 'pull', '/api/webhooks/grant-card': 'grant', '/api/webhooks/buff': 'buff' };

interface Stored { status: number; body: Record<string, unknown> }

async function earlier(key: string): Promise<NextResponse> {
  for (let waited = 0; waited < WAIT_MS; waited += 200) {
    const s = await kv.get<Stored | 'pending'>(key).catch(() => null);
    if (s && s !== 'pending') return NextResponse.json(s.body, { status: s.status });
    await new Promise(r => setTimeout(r, 200));
  }
  return NextResponse.json({ ok: true, ignored: true, reason: 'duplicate', message: 'That request is already being handled.' });
}

/**
 * Runs `run` once per `requestId` (any string or number the Mix It Up command makes, up to 100 characters; none = always runs) and logs the
 * answer. A repeat answers what the first one did and does nothing. If `run` throws the claim is dropped, so a retry can try again.
 */
export async function answerOnce(route: string, username: string, requestId: unknown, run: () => Promise<NextResponse>, event?: { name: string; amount?: number }): Promise<NextResponse> {
  const id = typeof requestId === 'string' || typeof requestId === 'number' ? String(requestId).trim().slice(0, 100) : '';
  const key = `webhook:req:${route}:${id}`;
  const repeat = !!id && !(await kv.set(key, 'pending', { nx: true, ex: TTL_S }));
  let res: NextResponse;
  if (repeat) res = await earlier(key);
  else {
    try { res = await run(); } catch (e) { if (id) await kv.del(key).catch(() => {}); throw e; }
    if (id) await kv.set(key, { status: res.status, body: await res.clone().json() } satisfies Stored, { ex: TTL_S }).catch(() => {});
  }
  const body = (await res.clone().json().catch(() => ({}))) as Record<string, unknown>;
  const why = [body.ignored ? body.reason : '', body.message || body.error].filter(Boolean).join(': ');
  await logMixItUp({ username, what: WHAT[route] ?? 'pull', ok: res.status < 400 && body.ok !== false && !body.ignored, detail: `${repeat ? 'repeat of an earlier request, ' : ''}${why || 'ok'}` }, event);
  return res;
}
