import { VARIANTS } from './variants';
import type { Variant } from './types';

// Where a pull / grant / upgrade event's print lives. Client-safe (no server imports), so feeds on the server and in the browser share it.

type EventLike = { type: string; uid?: number; copyId?: string; serial?: number; variant?: Variant; cardNumber?: number };

/**
 * The page of the print an activity event made: `/c/<print number>` when the event carries one; for older pull events that only have
 * an edition (`serial`) the print's id is derived (`<card>.<version index>.<n>`) and opened as `/copy/<season>/<id>`; otherwise null
 * (the caller falls back to the card dex link). The season id is the one the event's collection belongs to.
 */
export function copyHrefFor(e: EventLike, seasonId: string): string | null {
  if (e.uid) return `/c/${e.uid}`;
  if (e.type === 'pull' && e.serial && e.cardNumber && seasonId) {
    const v = VARIANTS.indexOf(e.variant ?? 'regular');
    if (v >= 0) return `/copy/${encodeURIComponent(seasonId)}/${e.cardNumber}.${v}.${e.serial}`;
  }
  return null;
}

/** The admin page of the same print. Uses the event's copy id, or derives it for older pull events. */
export function adminCopyHrefFor(e: EventLike, seasonId: string): string | null {
  const id = e.copyId ?? (e.type === 'pull' && e.serial && e.cardNumber ? `${e.cardNumber}.${Math.max(0, VARIANTS.indexOf(e.variant ?? 'regular'))}.${e.serial}` : null);
  return id && seasonId ? `/admin/serials/${encodeURIComponent(seasonId)}/${id}` : null;
}

/**
 * Where a "Most valuable prints" row goes (15.4): one numbered print opens its print page (`/c/<uid>`, or the derived `/copy/...` link
 * when the print has no unique number yet); a row that groups several prints of a card and version opens the card dex dialog.
 */
export function topPrintHref(row: { card: { number: number }; variant: Variant; serial?: number }, seasonId: string, uid?: number | null): string {
  if (row.serial) {
    if (uid) return `/c/${uid}`;
    const v = VARIANTS.indexOf(row.variant);
    if (v >= 0 && seasonId) return `/copy/${encodeURIComponent(seasonId)}/${row.card.number}.${v}.${row.serial}`;
  }
  return `/cards?card=${row.card.number}`;
}
