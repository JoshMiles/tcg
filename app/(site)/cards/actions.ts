'use server';
import { getSession } from '@/lib/session';
import { setWanted } from '@/lib/wanted';

/** Adds or removes a card on the signed-in viewer's Looking for list. The viewer comes from the session. */
export async function toggleWantedAction(cardNumber: number): Promise<{ ok: true; wanted: number[] } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Log in to keep a Looking for list.' };
  return setWanted(session.username, cardNumber);
}
