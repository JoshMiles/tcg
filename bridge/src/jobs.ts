// One job from the site run against Mix It Up. The kinds are fixed; nothing here fetches an address a job names.
import { MixItUpClient, MixItUpDown, MixItUpError, type MixItUpUser } from './mixitup';
import { ObsError, type ObsWatcher } from './obs';
import type { BridgeJob, BridgeResult } from './site';

export const KINDS = ['balance', 'deduct', 'add', 'viewers', 'say', 'obs-refresh', 'run-command', 'pull-event'] as const;
export const isKnownKind = (k: unknown): boolean => typeof k === 'string' && (KINDS as readonly string[]).includes(k);

const LOGIN = /^[a-z0-9_]{1,25}$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class Refused extends Error {}

const DELAY_MAX_MS = 15_000;
const num = (v: unknown, min: number, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);

/** How long to hold a run-command so it lands on the card reveal: the job's delay counted from when the site queued it, at most 15 s. */
export function commandWait(job: BridgeJob, now = Date.now()): number {
  if (job.kind !== 'run-command' || typeof job.delayMs !== 'number' || !Number.isFinite(job.delayMs)) return 0;
  const d = Math.min(job.delayMs, DELAY_MAX_MS);
  return Math.max(0, Math.min(d, (typeof job.at === 'number' ? job.at : now) + d - now));
}

/** Runs a known job and says how it went. Never throws. */
export async function runJob(job: BridgeJob, mix: MixItUpClient, obs: ObsWatcher, commandIds: ReadonlySet<string> = new Set()): Promise<BridgeResult> {
  try {
    if (job.kind === 'run-command') {
      // Only a command this app itself reported to the site, so the site (or anyone holding its token) cannot run just any command id.
      const id = typeof job.commandId === 'string' ? job.commandId.toLowerCase() : '';
      if (!GUID.test(id) || !commandIds.has(id)) throw new Refused('That Mix It Up command is not in the list this app reported');
      const args = Array.isArray(job.args) ? job.args.filter((a): a is string => typeof a === 'string').slice(0, 10).map(a => a.slice(0, 200)) : [];
      await mix.runCommand(id, args);
      return { id: job.id, ok: true };
    }
    if (job.kind === 'pull-event') {
      // The scene and source names are checked against the lists this app reported inside ObsWatcher; the site cannot name anything else.
      const errors: string[] = [];
      const step = async (f: () => Promise<void>) => { try { await f(); } catch (e) { errors.push(e instanceof ObsError ? e.message : 'OBS did not accept that'); } };
      if (job.phase === 'start') {
        if (typeof job.source === 'string') await step(() => obs.showSource(job.source as string, num(job.holdMs, 0, 15_000)));
      } else {
        if (typeof job.scene === 'string') await step(() => obs.switchScene(job.scene as string, num(job.secs, 1, 60)));
        if (job.clip === true) await step(() => obs.saveClip());
      }
      if (errors.length) throw new Refused(errors.join('. '));
      return { id: job.id, ok: true };
    }
    if (job.kind === 'obs-refresh') {
      await obs.refresh();
      return { id: job.id, ok: true };
    }
    return { id: job.id, ok: true, ...(await run(job, mix)) };
  } catch (e) {
    if (e instanceof MixItUpDown) return { id: job.id, ok: false, error: e.message };
    if (e instanceof MixItUpError || e instanceof Refused || e instanceof ObsError) return { id: job.id, ok: false, error: e.message };
    return { id: job.id, ok: false, error: 'TCG Bridge hit an unexpected error' };
  }
}

function need(job: BridgeJob) {
  const username = (job.username ?? '').toLowerCase();
  if (!LOGIN.test(username)) throw new Refused('The job has no valid viewer name');
  if (!job.currencyId || !GUID.test(job.currencyId)) throw new Refused('No currency is chosen on the site');
  return { username, currencyId: job.currencyId };
}
const amountOf = (job: BridgeJob): number => {
  if (typeof job.amount !== 'number' || !Number.isInteger(job.amount) || job.amount < 1) throw new Refused('The job has no valid amount');
  return job.amount;
};
const balanceOf = (u: MixItUpUser | null, currencyId: string): number => {
  if (!u) return 0; // Mix It Up does not know the viewer: they own nothing
  const a = u.amounts.find(x => x.id.toLowerCase() === currencyId.toLowerCase());
  if (!a) throw new Refused('Mix It Up has no currency with that id');
  return a.amount;
};

async function run(job: BridgeJob, mix: MixItUpClient): Promise<Partial<BridgeResult>> {
  if (job.kind === 'viewers') return { users: await mix.chatUsers() };
  if (job.kind === 'say') {
    if (typeof job.text !== 'string' || !job.text.trim()) throw new Refused('The job has no message');
    await mix.say(job.text);
    return {};
  }
  const { username, currencyId } = need(job);
  const user = await mix.twitchUser(username);
  const balance = balanceOf(user, currencyId);
  if (job.kind === 'balance') return { balance };

  const amount = amountOf(job);
  if (!user) {
    if (job.kind === 'deduct') throw new Refused(`Not enough ${mix.currencyName(currencyId)}`);
    throw new Refused('Mix It Up does not know that viewer');
  }
  if (job.kind === 'deduct') {
    if (balance < amount) throw new Refused(`Not enough ${mix.currencyName(currencyId)}`); // never go negative
    try {
      await mix.adjust(user.id, currencyId, -amount);
    } catch (e) {
      if (e instanceof MixItUpError && e.status === 403) throw new Refused(`Not enough ${mix.currencyName(currencyId)}`);
      throw e;
    }
    return {};
  }
  await mix.adjust(user.id, currencyId, amount); // add
  return {};
}

/** The site gave up on a job that already went through (409 late): put it back. Returns what happened, in words. */
export async function undoLate(job: BridgeJob, mix: MixItUpClient): Promise<string> {
  if (job.kind !== 'deduct' && job.kind !== 'add') return '';
  try {
    const { username, currencyId } = need(job);
    const amount = amountOf(job);
    const user = await mix.twitchUser(username);
    if (!user) return 'Late, and the viewer is gone from Mix It Up: not undone';
    await mix.adjust(user.id, currencyId, job.kind === 'deduct' ? amount : -amount);
    return job.kind === 'deduct' ? 'Late: the deduct was given back' : 'Late: the add was taken back';
  } catch (e) {
    return `Late, and the undo failed: ${e instanceof Error ? e.message : 'unknown error'}`;
  }
}
