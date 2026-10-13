/**
 * The Twitch login of the staff member behind the current request ("password" for the emergency password login), or null when
 * there isn't one (a script, a webhook, or an ordinary viewer). Never throws. It is loaded lazily so the many modules that record
 * what staff did (audit trail, activity log, trades) don't all depend on the request cookies up front.
 */
export async function currentStaffLogin(): Promise<string | null> {
  try {
    const { getStaff } = await import('./staff-guard');
    return (await getStaff())?.login ?? null;
  } catch {
    return null;
  }
}
