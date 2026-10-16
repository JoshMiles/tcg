import type { ActivityEvent } from './activity';
import { copyHrefFor } from './copy-link';
import { VARIANTS } from './variants';
import type { Variant } from './types';

// The end-of-stream recap: a pure summary of the activity log between two times. Client-safe (no server imports) so the admin
// dashboard widget and the Discord embed share the same shape. Posting and storing it is in lib/twitch-live.ts.
// Left out on purpose: "biggest rank climb". Ranks come from the whole-season leaderboard, which the activity log cannot
// replay cheaply (it would need a before and after leaderboard for the stream), so it is not part of the recap.

export interface RecapPull { username: string; cardName: string; stars: number; variant?: Variant; packName: string; /** Site path of the print, when the pull has one. */ href: string | null; serial?: number }

export interface StreamRecap {
  from: number;
  to: number;
  /** Packs opened (one pull is one pack). */
  packs: number;
  /** Different cards among those pulls. */
  distinctCards: number;
  /** Viewers who opened at least one pack. */
  pullers: number;
  /** Viewers whose very first card came in this stream. */
  newCollectors: string[];
  /** Pulls that were the first print of their card ever. */
  firstEver: RecapPull[];
  rarest: RecapPull | null;
  topPuller: { username: string; packs: number } | null;
  tradesCompleted: number;
  /** True when the activity log (capped) no longer reaches back to the start of the stream, so the numbers are a floor. */
  partial: boolean;
}

const variantRank = (v?: Variant) => Math.max(0, VARIANTS.indexOf(v ?? 'regular'));

/**
 * Summarises what happened between `from` and `to` (ms). `events` is the activity log in any order; `logIsFull` says the log was
 * at its cap, which together with an oldest event after `from` means the start of the stream has rolled out of it.
 */
export function buildStreamRecap(events: ActivityEvent[], from: number, to: number, opts: { seasonId?: string; logIsFull?: boolean } = {}): StreamRecap {
  const inWindow = events.filter(e => e.at >= from && e.at <= to);
  const pulls = inWindow.filter((e): e is ActivityEvent & { type: 'pull' } => e.type === 'pull');
  const oldest = events.reduce((m, e) => Math.min(m, e.at), Infinity);

  const counts = new Map<string, number>();
  for (const p of pulls) counts.set(p.username, (counts.get(p.username) ?? 0) + 1);
  let topPuller: StreamRecap['topPuller'] = null;
  for (const [username, packs] of counts) if (!topPuller || packs > topPuller.packs || (packs === topPuller.packs && username < topPuller.username)) topPuller = { username, packs };

  const asPull = (p: ActivityEvent & { type: 'pull' }): RecapPull => ({
    username: p.username, cardName: p.cardName, stars: p.stars, variant: p.variant, packName: p.packName,
    href: copyHrefFor(p, opts.seasonId ?? ''), ...(p.serial ? { serial: p.serial } : {}),
  });
  let rarest: (ActivityEvent & { type: 'pull' }) | null = null;
  for (const p of pulls) {
    const better = !rarest || p.stars > rarest.stars || (p.stars === rarest.stars && (variantRank(p.variant) > variantRank(rarest.variant) || (variantRank(p.variant) === variantRank(rarest.variant) && p.at < rarest.at)));
    if (better) rarest = p;
  }

  return {
    from, to,
    packs: pulls.length,
    distinctCards: new Set(pulls.map(p => p.cardNumber)).size,
    pullers: counts.size,
    newCollectors: [...new Set(pulls.filter(p => p.isNew && p.uniqueOwned === 1).map(p => p.username))],
    firstEver: pulls.filter(p => p.serial === 1).map(asPull),
    rarest: rarest ? asPull(rarest) : null,
    topPuller,
    tradesCompleted: inWindow.filter(e => e.type === 'trade' && e.action === 'accepted').length,
    partial: !!opts.logIsFull && Number.isFinite(oldest) && oldest > from,
  };
}

/** A stream with no pulls gets no recap. */
export const recapWorthPosting = (r: StreamRecap) => r.packs > 0;

/** Made-up numbers for the Discord channel card's test button when no real recap exists yet. */
export function sampleRecap(now = Date.now()): StreamRecap {
  return {
    from: now - 2 * 3_600_000 - 15 * 60_000, to: now, packs: 42, distinctCards: 27, pullers: 9, newCollectors: ['sample_viewer'],
    firstEver: [], tradesCompleted: 2, partial: false, topPuller: { username: 'sample_viewer', packs: 11 },
    rarest: { username: 'sample_viewer', cardName: 'Sample Card', stars: 5, variant: 'shiny', packName: 'Sample Pack', href: null, serial: 1 },
  };
}
