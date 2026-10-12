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

/** The edition line under the engraved number: "Edition #7 of 12 made" (just "Edition #7" when the total is unknown). */
export function editionLine(n: number, total?: number): string {
  const made = madeLine(n, total);
  return `Edition #${n}${made ? ` ${made}` : ''}`;
}
