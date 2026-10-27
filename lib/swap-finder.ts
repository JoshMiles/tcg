import { decodeEntry } from './variants';

// The swap finder on the trade board (ROADMAP 50.3 trial; pure, client-safe): people who hold a card on the viewer's Looking for list
// and want a card the viewer has a spare of. The server still decides whether a trade is allowed; this only suggests.

export interface SwapPair {
  /** What they hold that the viewer is looking for (a collection entry, see lib/variants.ts). */
  have: number;
  /** What the viewer would give: a spare, so they keep at least one copy. */
  give: number;
  /** They hold more than one copy of `have`; false means it is their only copy. */
  theirSpare: boolean;
}

export interface SwapCandidate {
  username: string;
  /** Best pair first. */
  pairs: SwapPair[];
}

const tally = (entries: number[]) => { const m = new Map<number, number>(); for (const e of entries) m.set(e, (m.get(e) ?? 0) + 1); return m; };

/**
 * `mine`: the viewer's entries. `wanted`: their Looking for list (card numbers). `board`: everyone's entries by login.
 * `watchers`: who wants each card number (Looking for lists plus saved alerts) for the cards the viewer has spares of.
 * `skip`: logins to leave out (the viewer, hidden users). Best candidate first; the caller drops private or blocked people and takes the top few.
 */
export function findSwaps(mine: number[], wanted: number[], board: Record<string, number[]>, watchers: Record<number, string[]>, skip: (username: string) => boolean): SwapCandidate[] {
  const spares = [...tally(mine)].filter(([, n]) => n > 1).map(([e]) => e);
  const spareByCard = new Map<number, number[]>();
  for (const e of spares) { const c = decodeEntry(e).cardNumber; spareByCard.set(c, [...(spareByCard.get(c) ?? []), e]); }
  const wantedSet = new Set(wanted);
  const wantsOf = new Map<string, number[]>(); // login -> spare entries of the viewer that they want
  for (const [card, entries] of spareByCard) for (const u of watchers[card] ?? []) wantsOf.set(u, [...(wantsOf.get(u) ?? []), ...entries]);

  const out: SwapCandidate[] = [];
  for (const [username, wantsMine] of wantsOf) {
    if (skip(username)) continue;
    const theirs = [...tally(board[username] ?? [])].filter(([e]) => wantedSet.has(decodeEntry(e).cardNumber));
    const pairs: SwapPair[] = [];
    for (const [have, n] of theirs) for (const give of wantsMine) pairs.push({ have, give, theirSpare: n > 1 });
    if (pairs.length === 0) continue;
    // Their spares first, then the card that sits earliest on the viewer's list.
    pairs.sort((a, b) => Number(b.theirSpare) - Number(a.theirSpare) || wanted.indexOf(decodeEntry(a.have).cardNumber) - wanted.indexOf(decodeEntry(b.have).cardNumber) || a.have - b.have || a.give - b.give);
    out.push({ username, pairs });
  }
  return out.sort((a, b) => Number(b.pairs[0].theirSpare) - Number(a.pairs[0].theirSpare) || b.pairs.length - a.pairs.length || a.username.localeCompare(b.username));
}
