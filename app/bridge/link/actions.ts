'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { recordAudit } from '@/lib/audit';
import { decideLink, readLink } from '@/lib/bridge-link';
import { getSession } from '@/lib/session';
import { liveRole } from '@/lib/staff';
import { ROLE_LABELS, isTwitchId } from '@/lib/staff-core';

/** Allow or Deny on the link page (58.0). The account comes from the signed-in session, never from the form; Next checks the request's origin for server actions. */
export async function decideLinkAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const back = (result: string) => redirect(`/bridge/link?id=${encodeURIComponent(id)}&result=${result}`);
  const session = await getSession();
  if (!session || session.sandbox || !isTwitchId(session.twitchId)) redirect(`/auth/twitch?returnTo=${encodeURIComponent(`/bridge/link?id=${id}`)}`);
  const allow = formData.get('choice') === 'allow';
  const pc = await readLink(id);
  const role = allow ? await liveRole(session.username, session.twitchId) : null;
  const outcome = await decideLink(id, { userId: session.twitchId, login: session.username, role }, allow);
  const what = `${pc?.name ?? 'a PC'} by ${session.username}`;
  if (outcome === 'allowed') { await recordAudit('everyone', 'TCG Bridge linked with Twitch', `${what} (${ROLE_LABELS[role!]})`); revalidatePath('/admin/mixitup'); }
  else if (outcome === 'no-role') await recordAudit('everyone', 'TCG Bridge link refused, no staff role', what);
  else if (outcome === 'denied') await recordAudit('everyone', 'TCG Bridge link denied', what);
  back(outcome === 'gone' ? 'gone' : outcome);
}
