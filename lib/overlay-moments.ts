// Special moments on the overlay: what a pull can celebrate besides the card itself. Pure, so the widget (public/widget.js
// mirrors pickMoment) and scripts/check-overlay.mts agree.
//
// One moment plays per pull and the highest wins: first-ever print, then a viewer's first pull, then a new card for them.

export const MOMENT_IDS = ['firstEver', 'firstPull', 'newCard'] as const;
export type MomentId = (typeof MOMENT_IDS)[number];

export const MOMENT_LABELS: Record<MomentId, string> = {
  firstEver: 'First-ever print',
  firstPull: "A viewer's first pull",
  newCard: 'A new card for them',
};

export interface MomentFacts {
  /** Edition #1 of that card in that version (the very first print ever made). */
  firstEver: boolean;
  /** The viewer owned nothing in this collection before this pull. */
  firstForViewer: boolean;
  /** The viewer did not own this card before this pull. */
  isNew: boolean;
}

/** Which moment plays, given what happened and which moments are switched on (null = none). */
export function pickMoment(facts: Partial<MomentFacts>, enabled: Record<MomentId, boolean>): MomentId | null {
  if (facts.firstEver && enabled.firstEver) return 'firstEver';
  if (facts.firstForViewer && enabled.firstPull) return 'firstPull';
  if (facts.isNew && enabled.newCard) return 'newCard';
  return null;
}
