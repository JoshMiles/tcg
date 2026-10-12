'use server';
import { getSession } from '@/lib/session';
import { getUserSettings, saveUserSettings } from '@/lib/user-settings-store';
import { WANTED_MAX } from '@/lib/user-settings';

/** Adds or removes a card on the signed-in viewer's Looking for list. The viewer comes from the session. */
export async function toggleWantedAction(cardNumber: number): Promise<{ ok: true; wanted: number[] } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: 'Log in to keep a Looking for list.' };
  if (!Number.isInteger(cardNumber) || cardNumber < 1 || cardNumber >= 1_000_000) return { ok: false, error: 'Unknown card.' };
  const s = await getUserSettings(session.username);
  const has = s.wanted.includes(cardNumber);
  if (!has && s.wanted.length >= WANTED_MAX) return { ok: false, error: `Your Looking for list is full (${WANTED_MAX}). Remove one in Settings first.` };
  const wanted = has ? s.wanted.filter(n => n !== cardNumber) : [...s.wanted, cardNumber];
  const saved = await saveUserSettings(session.username, { ...s, wanted });
  return { ok: true, wanted: saved.wanted };
}
