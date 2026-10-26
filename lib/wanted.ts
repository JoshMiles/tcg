import { getUserSettings, saveUserSettings } from './user-settings-store';
import { WANTED_MAX } from './user-settings';

/**
 * Puts a card on `username`'s Looking for list, takes it off, or (with `on` left out) flips it. The website's Look for button and the Twitch
 * panel's both come here; the caller has already authenticated `username`.
 */
export async function setWanted(username: string, cardNumber: number, on?: boolean): Promise<{ ok: true; wanted: number[] } | { ok: false; error: string }> {
  if (!Number.isInteger(cardNumber) || cardNumber < 1 || cardNumber >= 1_000_000) return { ok: false, error: 'Unknown card.' };
  const s = await getUserSettings(username);
  const has = s.wanted.includes(cardNumber);
  const want = on ?? !has;
  if (want === has) return { ok: true, wanted: s.wanted };
  if (want && s.wanted.length >= WANTED_MAX) return { ok: false, error: `Your Looking for list is full (${WANTED_MAX}). Remove one in Settings first.` };
  const wanted = want ? [...s.wanted, cardNumber] : s.wanted.filter(n => n !== cardNumber);
  const saved = await saveUserSettings(username, { ...s, wanted });
  return { ok: true, wanted: saved.wanted };
}
