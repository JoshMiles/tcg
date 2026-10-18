# lib/copy-link.ts

- EventLike · type · L6-L6 — type EventLike = { type: string; uid?: number; copyId?: string; serial?: number; variant?: Variant; cardNumber?: number };
- copyHrefFor · function · L13-L20 — function copyHrefFor(e: EventLike, seasonId: string): string | null
- adminCopyHrefFor · function · L23-L26 — function adminCopyHrefFor(e: EventLike, seasonId: string): string | null
- topPrintHref · function · L32-L39 — function topPrintHref(row: { card: { number: number }; variant: Variant; serial?: number }, seasonId: string, uid?: number | null): string
