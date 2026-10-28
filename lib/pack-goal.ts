// The community pack goal (ROADMAP 57.5): KV `packgoal:goal` holds the goal (set for one stream key), `packgoal:n:<setAt>` counts the real pulls
// since it was set and `packgoal:done:<setAt>` is the once-only flag taken by whoever reaches the target. Setting a goal again starts a new
// count (new setAt), so nothing needs clearing. A goal for an earlier stream key reads as no goal: that is the reset, no cron.
import { kv, inSandbox } from './db';
import { recordAudit } from './audit';
import { bridgeSay } from './bridge';
import { applyBuff, currentBuffStreamKey, getBuffDef } from './buffs';
import { currentStreamKey } from './mixitup';
import { getStreamBuff, setStreamPullBuff } from './pull-limit';
import { MAX_LIMIT, streamBuffAmount } from './pull-limit-core';
import { phrase } from './streamdeck';
import { cleanGoalInput, goalChatLine, goalForStream, goalText, normalizeGoal, type GoalInput, type PackGoal } from './pack-goal-core';

const GOAL_KEY = 'packgoal:goal';
const countKey = (g: PackGoal) => `packgoal:n:${g.setAt}`;
const doneKey = (g: PackGoal) => `packgoal:done:${g.setAt}`;
const TTL_S = 2 * 24 * 3600;
const BY = 'Pack goal';

/** The goal for this stream (null = none) and how many pulls it has counted. One read when no goal is set. */
export async function readPackGoal(): Promise<{ goal: PackGoal; count: number } | null> {
  const stored = normalizeGoal(await kv.get(GOAL_KEY).catch(() => null));
  if (!stored) return null;
  const goal = goalForStream(stored, await currentStreamKey());
  if (!goal) return null;
  const n = Number(await kv.get(countKey(goal)).catch(() => 0));
  return { goal, count: Number.isFinite(n) && n > 0 ? n : 0 };
}

/** "<label>: 37 / 50" for the app's OBS text source and the overlay bar; null when no goal is set for this stream. */
export async function packGoalText(): Promise<string | null> {
  const g = await readPackGoal();
  return g ? goalText(g.goal.label, g.count, g.goal.target) : null;
}

const rewardWords = (g: PackGoal): string => (g.reward.type === 'pulls' ? `${g.reward.amount} extra pull${g.reward.amount === 1 ? '' : 's'} for everyone this stream` : g.reward.type === 'buff' ? 'a community buff' : 'no reward');

/** Sets the goal for this stream (replacing one, and starting again from 0). Audit line. */
export async function setPackGoal(input: GoalInput, by: string): Promise<{ ok: true; goal: PackGoal; message: string } | { ok: false; message: string }> {
  const c = cleanGoalInput(input);
  if (!c.ok) return c;
  if (c.reward.type === 'buff') {
    const def = await getBuffDef(c.reward.buffId);
    if (!def || def.scope !== 'community' || def.type === 'grant-achievement') return { ok: false, message: 'That is not a community buff.' };
  }
  const goal: PackGoal = { target: c.target, label: c.label, reward: c.reward, by: by.slice(0, 60) || 'admin', setAt: Date.now(), streamKey: await currentStreamKey() };
  await kv.set(GOAL_KEY, goal);
  await recordAudit('everyone', `Pack goal set: ${goal.label}`, `${goal.target} packs this stream, reward: ${rewardWords(goal)}, by ${goal.by}`);
  return { ok: true, goal, message: `Pack goal set: ${goal.target} packs.` };
}

/** Clears the goal. `wasOn` = there was one for this stream. */
export async function clearPackGoal(by: string): Promise<{ wasOn: boolean; message: string }> {
  const cur = await readPackGoal();
  await kv.del(GOAL_KEY);
  if (cur) await recordAudit('everyone', `Pack goal cleared: ${cur.goal.label}`, `At ${cur.count} of ${cur.goal.target}, by ${by}`);
  return { wasOn: !!cur, message: cur ? 'The pack goal is cleared.' : 'There was no pack goal.' };
}

/**
 * A real pull was saved: counts it toward the goal. Call it for real pulls only (never a test pull); a sandbox counts nothing. The pull that
 * brings the count to the target takes the once-only flag, then applies the reward, posts one chat line and writes the audit line.
 * Never throws: a pull must not fail over this.
 */
export async function countPackGoalPull(): Promise<void> {
  try {
    if (await inSandbox()) return;
    const stored = normalizeGoal(await kv.get(GOAL_KEY));
    if (!stored) return; // the only cost when no goal is set
    const goal = goalForStream(stored, await currentStreamKey());
    if (!goal) return;
    const n = await kv.incr(countKey(goal));
    if (n === 1) await kv.expire(countKey(goal), TTL_S);
    if (n !== goal.target || !(await kv.set(doneKey(goal), 1, { nx: true, ex: TTL_S }))) return;
    const said = await applyReward(goal);
    await bridgeSay(goalChatLine(goal.label, said.chat));
    await recordAudit('everyone', `Pack goal reached: ${goal.label}`, `${goal.target} packs. ${said.audit}`);
  } catch (e) {
    console.error('[pack-goal] failed:', e instanceof Error ? e.message : e);
  }
}

/** Gives the reward once. `chat` is the sentence for chat ('' = none), `audit` says what happened, including a failure. */
async function applyReward(g: PackGoal): Promise<{ chat: string; audit: string }> {
  if (g.reward.type === 'pulls') {
    const key = await currentStreamKey();
    const total = Math.min(MAX_LIMIT, streamBuffAmount(await getStreamBuff(), key) + g.reward.amount);
    await setStreamPullBuff(total, key, BY);
    return { chat: `Everyone gets ${g.reward.amount} extra pull${g.reward.amount === 1 ? '' : 's'} this stream.`, audit: `Everyone +${g.reward.amount} pulls this stream.` };
  }
  if (g.reward.type === 'buff') {
    const def = await getBuffDef(g.reward.buffId);
    if (!def) return { chat: '', audit: 'The community buff no longer exists, so nothing was given.' };
    const r = await applyBuff(BY, def.id, { source: 'pack goal', streamKey: await currentBuffStreamKey().catch(() => undefined) });
    return r.ok ? { chat: `Everyone gets ${phrase(def)}.`, audit: `Community buff ${def.name} applied.` } : { chat: '', audit: `Community buff ${def.name} could not be applied (${r.reason}).` };
  }
  return { chat: '', audit: 'No reward.' };
}
