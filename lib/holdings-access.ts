/**
 * Who may read a viewer's trade holdings (the cards they hold, their Looking for list, and their print ids).
 * Staff may. Any other caller must be signed in, and a private profile is visible only to that viewer.
 */
export function mayReadHoldings(
  subject: string,
  viewer: string | null,
  opts: { privateProfile: boolean; staff: boolean },
): boolean {
  if (opts.staff) return true;
  if (!viewer) return false;
  return !opts.privateProfile || viewer.toLowerCase() === subject.toLowerCase();
}
