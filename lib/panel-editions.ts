import { ORIGIN_LABELS, entryOf, type Copy } from './serials-core';
import { engravedDate } from './flip-back';

// The viewer's own editions as the Twitch panel's card details list them (GET /api/twitch/me `editions`). Pure.

export interface PanelEdition {
  /** The edition number within its card and version. */
  n: number;
  /** The serial number across the whole game; absent on editions made before serial numbers existed. */
  uid?: number;
  /** When it was made (ms) and the same day worded the way the site engraves it. */
  at: number;
  date: string;
  /** How it came to be ("Pulled live on stream"). */
  origin: string;
  /** How many editions of this card and version were ever made. */
  made?: number;
  /** The number was worked out after the fact. */
  est?: true;
}

/** `copies` (one holder's) grouped by collection entry (card + version), lowest edition first. `minted` is how many of each entry were ever made. */
export function panelEditions(copies: Copy[], minted: ReadonlyMap<number, number> | null): Record<number, PanelEdition[]> {
  const out: Record<number, PanelEdition[]> = {};
  for (const c of copies) {
    const made = minted?.get(entryOf(c));
    (out[entryOf(c)] ??= []).push({
      n: c.n, ...(c.uid ? { uid: c.uid } : {}), at: c.at, date: engravedDate(c.at), origin: ORIGIN_LABELS[c.origin],
      ...(made ? { made } : {}), ...(c.est ? { est: true as const } : {}),
    });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.n - b.n);
  return out;
}
