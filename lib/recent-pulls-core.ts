import type { Copy } from './serials-core';
import { isEscrow } from './serials-core';

// The profile's "Recent pulls" widget: the person's latest pulls, whatever happened to the print since (client-safe, pure).

export type PullFate = 'held' | 'offer' | 'traded' | 'forged' | 'removed';

/** What became of a print for the person who pulled it: still theirs, in an open offer, with someone else, spent in an upgrade or taken out. */
export function pullFate(c: Pick<Copy, 'owner' | 'ev'>, user: string): PullFate {
  if (c.owner === user) return 'held';
  if (isEscrow(c.owner)) return 'offer';
  if (c.owner) return 'traded';
  return [...c.ev].reverse().find(e => e.type === 'upgraded' || e.type === 'removed')?.type === 'upgraded' ? 'forged' : 'removed';
}

/** Prints `user` pulled from a pack (the minted event names them), newest first, each once. Held, traded away and retired prints all count. */
export function pickRecentPulls(candidates: Copy[], user: string, limit = 8): (Copy & { fate: PullFate })[] {
  const seen = new Set<string>();
  return candidates
    .filter(c => c.origin === 'pull' && (c.ev[0]?.who ?? c.owner) === user && !seen.has(c.id) && !!seen.add(c.id))
    .sort((x, y) => y.at - x.at || y.n - x.n)
    .slice(0, limit)
    .map(c => ({ ...c, fate: pullFate(c, user) }));
}
