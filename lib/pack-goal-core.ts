// The community pack goal (ROADMAP 57.5), the pure part: what a goal is, how input becomes one, and the words. The KV side is lib/pack-goal.ts.
import { MAX_LIMIT, streamAmount } from './pull-limit-core';

export const GOAL_TARGET_MAX = 100_000;
export const GOAL_LABEL_MAX = 60;
export const GOAL_LABEL_DEFAULT = 'Pack goal';

/** What reaching the goal gives: nothing, a community buff (an existing buff definition) or extra pulls for everyone this stream. */
export type GoalReward = { type: 'none' } | { type: 'buff'; buffId: string } | { type: 'pulls'; amount: number };

export interface PackGoal {
  target: number;
  label: string;
  reward: GoalReward;
  by: string;
  setAt: number;
  /** The stream key (`currentStreamKey`) it was set for. A goal for an earlier key is no goal. */
  streamKey: string;
}

export type GoalInput = { target?: unknown; label?: unknown; reward?: unknown; buffId?: unknown; amount?: unknown };

/** The goal a form describes, or the reason in words. The buff is not checked here (it needs the buff list). */
export function cleanGoalInput(input: GoalInput): { ok: true; target: number; label: string; reward: GoalReward } | { ok: false; message: string } {
  const t = typeof input.target === 'number' ? input.target : typeof input.target === 'string' && input.target.trim() !== '' ? Number(input.target) : NaN;
  if (!Number.isInteger(t) || t < 1 || t > GOAL_TARGET_MAX) return { ok: false, message: `The target must be a whole number from 1 to ${GOAL_TARGET_MAX.toLocaleString('en-US')}.` };
  const label = (typeof input.label === 'string' ? input.label.trim().replace(/\s+/g, ' ') : '').slice(0, GOAL_LABEL_MAX) || GOAL_LABEL_DEFAULT;
  if (input.reward === 'buff') {
    return typeof input.buffId === 'string' && input.buffId ? { ok: true, target: t, label, reward: { type: 'buff', buffId: input.buffId.slice(0, 80) } } : { ok: false, message: 'Pick the community buff to give.' };
  }
  if (input.reward === 'pulls') {
    const n = streamAmount(input.amount);
    return n !== null && n >= 1 ? { ok: true, target: t, label, reward: { type: 'pulls', amount: n } } : { ok: false, message: `Extra pulls must be a whole number from 1 to ${MAX_LIMIT}.` };
  }
  return { ok: true, target: t, label, reward: { type: 'none' } };
}

/** A stored goal checked, or null when it is not one. */
export function normalizeGoal(raw: unknown): PackGoal | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const c = cleanGoalInput({ target: o.target, label: o.label, ...(o.reward && typeof o.reward === 'object' ? { reward: (o.reward as Record<string, unknown>).type, buffId: (o.reward as Record<string, unknown>).buffId, amount: (o.reward as Record<string, unknown>).amount } : {}) });
  if (!c.ok || typeof o.streamKey !== 'string' || !o.streamKey) return null;
  return { target: c.target, label: c.label, reward: c.reward, by: typeof o.by === 'string' && o.by ? o.by.slice(0, 60) : 'admin', setAt: typeof o.setAt === 'number' && Number.isFinite(o.setAt) ? o.setAt : 0, streamKey: o.streamKey.slice(0, 40) };
}

/** The goal for this stream, or null: a goal set for an earlier stream key is no goal (that is the reset). */
export const goalForStream = (goal: PackGoal | null, streamKey: string): PackGoal | null => (goal && goal.streamKey === streamKey ? goal : null);

/** "Pack goal: 37 / 50" (the count never shows past the target). */
export const goalText = (label: string, count: number, target: number): string => `${label}: ${Math.min(Math.max(0, Math.floor(count)), target)} / ${target}`;

/** The chat line when the goal is reached; `reward` is a finished sentence or ''. */
export const goalChatLine = (label: string, reward: string): string => `Pack goal reached: ${label}!${reward ? ` ${reward}` : ''}`;
