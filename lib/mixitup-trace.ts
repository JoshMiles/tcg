// The step list of a test pull (ROADMAP 55.14) and what Undo needs, in KV. Kept apart from lib/mixitup-test.ts so the pull code can write to it without importing the code that starts a pull.
import { kv } from './db';
import { TRACE_TTL_S, type TestStep, type TestStepId, type TestStepState } from './mixitup-test-core';

export const traceKey = (id: string) => `mixitup:test:${id}`;
export const madeKey = (id: string) => `mixitup:test:made:${id}`;
export const LOCK = 'mixitup:test:lock';
export const RECENT = 'mixitup:test:recent';
export const MADE_TTL_S = 7 * 86400;

/** Notes one step of a test pull. Does nothing without a trace id, so a real pull writes nothing extra. Never throws. A failure or the last step lets the lock go. */
export async function traceStep(trace: string | undefined, step: TestStepId, state: TestStepState, detail = ''): Promise<void> {
  if (!trace) return;
  try {
    await kv.rpush(traceKey(trace), { step, state, detail: detail.slice(0, 300), at: Date.now() } satisfies TestStep);
    await kv.expire(traceKey(trace), TRACE_TTL_S);
    if (state === 'failed' || step === 'chat') await releaseLock(trace);
  } catch { /* a trace never breaks a pull */ }
}

export async function readTrace(trace: string): Promise<TestStep[]> {
  try { return (await kv.lrange<TestStep>(traceKey(trace), 0, -1)) ?? []; } catch { return []; }
}

export async function releaseLock(trace: string): Promise<void> {
  if ((await kv.get(LOCK)) === trace) await kv.del(LOCK);
}

/** What Undo needs, written when the edition is saved. */
export interface MadeTest { username: string; collectionName: string; entry: number; cardName: string; paid: boolean; amount: number; at: number; undone?: boolean }
export async function noteMade(trace: string, made: MadeTest): Promise<void> {
  try { await kv.set(madeKey(trace), made, { ex: MADE_TTL_S }); } catch { /* the trace still shows it */ }
}

