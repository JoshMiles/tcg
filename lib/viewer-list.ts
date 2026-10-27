import { kv } from './db';
import { IDS } from './account-id';

type Row = { username: string; seasons: { id: string; name: string; collectionName: string; cards: number[] }[] };

/** Pure: `all` plus a zero-pull row for each login that has a profile but no collection entry. */
export function withProfileOnly<T extends Row>(all: T[], logins: string[]): Row[] {
  const have = new Set(all.map(u => u.username));
  const extra = [...new Set(logins.map(l => l.toLowerCase()))].filter(l => !have.has(l)).map(username => ({ username, seasons: [] }));
  return [...all, ...extra];
}

/** Logins of everyone who signed in with Twitch: the values of the `acct:ids` hash (one `hgetall`, no key scan). Viewers whose profile has no Twitch ID are not in it. */
export async function getSignedInLogins(): Promise<string[]> {
  try { return Object.values((await kv.hgetall<Record<string, string>>(IDS)) ?? {}).filter(v => typeof v === 'string'); } catch { return []; }
}
