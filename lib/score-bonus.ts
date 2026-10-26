import { kv } from './db';
import { withLock } from './kv';

// Flat leaderboard points from the score-bonus buff, kept per season collection at `scorebonus:<collectionName>` as
// { username: points }. They are not derived from cards, so a score recompute never touches them.
const key = (collectionName: string) => `scorebonus:${collectionName}`;

export async function getScoreBonuses(collectionName: string): Promise<Record<string, number>> {
  try {
    const raw = await kv.get<Record<string, number>>(key(collectionName));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

/** Adds `points` to each viewer's bonus for that season. */
export async function addScoreBonus(collectionName: string, usernames: string[], points: number): Promise<void> {
  await withLock(`scorebonus:${collectionName}`, async () => {
    const all = await getScoreBonuses(collectionName);
    for (const u of usernames) all[u.toLowerCase()] = (all[u.toLowerCase()] ?? 0) + points;
    await kv.set(key(collectionName), all);
  });
}

/** A viewer's bonus follows the account to a new login (lib/account-move.ts). Safe to repeat. */
export async function moveScoreBonus(collectionName: string, from: string, to: string): Promise<void> {
  await withLock(`scorebonus:${collectionName}`, async () => {
    const all = await getScoreBonuses(collectionName);
    if (!(from in all)) return;
    all[to] = (all[to] ?? 0) + all[from];
    delete all[from];
    await kv.set(key(collectionName), all);
  });
}
