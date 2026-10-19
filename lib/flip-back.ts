import type { CardBackStyle } from './card-back';
import { ORIGIN_BY, ORIGIN_VERB, isEscrow, type Origin } from './serials-core';
import { VARIANT_LABELS } from './variants';
import type { Variant } from './types';

// The engraved back of a flip card (client-safe, pure): what is printed on it and how dates and history lines are worded.

export interface FlipBack {
  /** The copy's serial number within its card and version ("#7"): the edition. */
  n: number;
  /** The copy's unique number across the whole game ("#1023381"); the engraved number when present. */
  uid?: number;
  /** How many copies of this card and version were ever made. */
  total?: number;
  /** "Shiny Full Art" etc. ('Regular' for plain). */
  variantLabel: string;
  name: string;
  /** Engraved date, from `engravedDate`. */
  date?: string;
  /** Where the copy came from ("Pulled live on stream"). */
  origin?: string;
  /** Who holds it ("@alice"), already masked for private collectors; null = unknown / gone. */
  holder?: string | null;
  /** Numbered after the fact, so the number is an estimate. */
  est?: boolean;
  /** Points multiplier when the number earns a bonus (plated gold). */
  bonus?: number;
  /** Rarity colour for the edge. */
  hex?: string;
  /** The last few things that happened to it (copy page only). */
  history?: { text: string; date: string }[];
  /** The copy's public page, for the link and the QR code (absolute URL for the QR). */
  href?: string;
  qrUrl?: string;
  /** The pack's designed back (lib/card-back.ts); absent = the classic engraved plate. */
  style?: CardBackStyle;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "12 OCT 2026", always in UTC so the server and the browser print the same text. */
export function engravedDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "of 12 made", or '' when the total is unknown. */
export function madeLine(n: number, total?: number): string {
  return total && total >= n ? `of ${total.toLocaleString('en-GB')} made` : '';
}

/** The edition line under the engraved number: "Print #7 of 12 made" (just "Print #7" when the total is unknown). */
export function editionLine(n: number, total?: number): string {
  const made = madeLine(n, total);
  return `Print #${n}${made ? ` ${made}` : ''}`;
}

/** One short line of a print's history ("Traded to @bob"), for the engraved back and the card dialog. Private collectors stay private. */
export function histText(e: { type: string; who?: string; to?: string }, hidden: Set<string>, origin: Origin): string {
  const name = (n?: string) => (!n ? '' : isEscrow(n) ? 'an offer' : hidden.has(n) ? 'a private collector' : `@${n}`);
  switch (e.type) {
    // How it began, by origin: "Pulled by @x", "Given to @x", "Forged by @x" (never just "Created").
    case 'minted': { const by = ORIGIN_BY[origin]; const who = name(e.who); return who ? `${by[0].toUpperCase()}${by.slice(1)} ${who}` : ORIGIN_VERB[origin]; }
    case 'traded': return `Traded to ${name(e.to)}`;
    case 'escrowed': return 'Put up in a trade';
    case 'returned': return 'Back from a trade';
    case 'restored': return 'Restored';
    case 'upgraded': return 'Spent in an upgrade';
    case 'removed': return 'Removed';
    default: return e.type;
  }
}

/** What the one constructor needs: the facts about an edition, in the units the pages already hold (variant id, a timestamp). */
export interface BackPrint {
  n: number;
  uid?: number;
  total?: number;
  variant: Variant;
  name: string;
  /** When the copy was made (ms); printed as the engraved date. */
  at?: number;
  est?: boolean;
  bonus?: number;
  hex?: string;
  origin?: string;
  holder?: string | null;
  history?: { text: string; date: string }[];
  href?: string;
  qrUrl?: string;
}

/**
 * The ONE way to build a FlipBack (ROADMAP 20.3c). Every page, dialog, share image, admin screen and the overlay goes through it, so a
 * edition's back reads the same everywhere; scripts/check-card-back.mts fails when a file builds one by hand. `style` is the pack's
 * designed back (`cardBackFor`); absent = the classic plate.
 */
export function flipBackFor(p: BackPrint, style?: CardBackStyle): FlipBack {
  return {
    n: p.n, uid: p.uid, total: p.total, variantLabel: VARIANT_LABELS[p.variant], name: p.name,
    ...(p.at ? { date: engravedDate(p.at) } : {}), est: p.est, bonus: p.bonus, hex: p.hex, origin: p.origin, holder: p.holder,
    history: p.history, href: p.href, qrUrl: p.qrUrl, style,
  };
}

/** The sample edition the editors and the workspace preview show (edition 7 of 12, pulled on stream). */
export function sampleFlipBack(name: string, hex: string | undefined, style?: CardBackStyle): FlipBack {
  const day = Date.UTC(2026, 9, 12);
  return flipBackFor({
    n: 7, uid: 1023381, total: 12, variant: 'regular', name, at: day, origin: 'Pulled live on stream', holder: '@viewer', hex,
    history: [{ text: 'Pulled by @viewer', date: engravedDate(day) }, { text: 'Traded to @friend', date: engravedDate(Date.UTC(2026, 9, 14)) }],
    qrUrl: 'https://example.com/',
  }, style);
}
