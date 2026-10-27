// Test pulls (ROADMAP 55.14), the pure parts: the steps a simulated chat pull goes through, and when the live list stops polling.
// The server side (trace in KV, lock, undo) is lib/mixitup-test.ts.

/** In the order they really happen. The charge comes after the overlay shows the pull: a paid pull is charged when the card is revealed. */
export const TEST_STEPS = [
  { id: 'received', label: 'Webhook received' },
  { id: 'balance', label: 'Balance read' },
  { id: 'queued', label: 'Queued with a ticket' },
  { id: 'shown', label: 'Shown on the overlay' },
  { id: 'charged', label: 'Charged' },
  { id: 'saved', label: 'Edition saved' },
  { id: 'rules', label: 'Big pull rules fired' },
  { id: 'chat', label: 'Chat reply sent' },
] as const;
export type TestStepId = (typeof TEST_STEPS)[number]['id'];
export type TestStepState = 'ok' | 'failed' | 'skipped';
export interface TestStep { step: TestStepId; state: TestStepState; detail: string; at: number }

/** What the simulate button answers with: the usual message, and the id of the test to follow. */
export interface TestPullState { ok: boolean; message: string; needsForce?: boolean; id?: string; startedAt?: number }

/** The trace expires after an hour. */
export const TRACE_TTL_S = 3600;
/** One simulated pull at a time; the lock is let go when the chain ends, else after this long. */
export const LOCK_TTL_S = 90;

/** Test editions live in their own hash beside the season's, so no reader of the season (leaderboard, binder, dex, profile, Twitch panel) can see them. */
export const testCollectionName = (collectionName: string) => `${collectionName}:test`;
export const isTestCollection = (collectionName: string) => collectionName.endsWith(':test');

/** The live list stops once the pull is saved and 10 seconds have passed, when a step fails, when the chain ends, or after 60 seconds. */
export function traceSettled(steps: TestStep[], startedAt: number, now: number): boolean {
  if (steps.some(s => s.state === 'failed') || steps.some(s => s.step === 'chat')) return true;
  const saved = steps.find(s => s.step === 'saved');
  if (saved && now - saved.at >= 10_000) return true;
  return now - startedAt >= 60_000;
}

/** One line in words for the whole run, for the list's heading. */
export function traceSummary(steps: TestStep[], startedAt: number, now: number): { tone: 'running' | 'ok' | 'failed'; text: string } {
  const failed = steps.find(s => s.state === 'failed');
  if (failed) return { tone: 'failed', text: `It broke at "${TEST_STEPS.find(t => t.id === failed.step)?.label}": ${failed.detail}` };
  if (steps.some(s => s.step === 'chat')) return { tone: 'ok', text: 'Every step went through.' };
  if (now - startedAt >= 60_000) {
    const shown = steps.some(s => s.step === 'shown');
    return { tone: 'failed', text: shown ? 'The overlay started the pull but it was not saved within a minute.' : 'The overlay did not play the pull within a minute. Is the overlay open in OBS?' };
  }
  return { tone: 'running', text: 'Running. The overlay plays the pull on stream, then the rest follow.' };
}
