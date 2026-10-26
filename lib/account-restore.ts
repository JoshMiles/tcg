// The earlier profile a signed-in Twitch account may have under another login (ROADMAP 47.8): the same ID owns `acct:ids[id]`, but that is not the login
// they signed in with, either because the account was moved aside (`~` login, only its owner may restore it) or because Twitch renamed them and the new
// login already holds cards (staff merge). /account shows it (app/(site)/account/EarlierCollection.tsx).

import { kv } from './db';
import { getUserProfile } from './kv';
import { IDS } from './account-id';
import { cardsOf, getAsideAccount } from './account-move';
import { isTwitchId } from './staff-core';

export interface EarlierAccount {
  /** The login the profile sits under now (a `~` login when moved aside). */
  owner: string;
  /** The login the player knew it by. */
  original: string;
  cards: number;
}

/** What this Twitch account left under another login, or null (nothing, already declined, or not provably theirs). */
export async function findEarlierAccount(login: string, id: string): Promise<EarlierAccount | null> {
  if (!isTwitchId(id)) return null;
  const raw = await kv.hget(IDS, id);
  const owner = typeof raw === 'string' ? raw : '';
  if (!owner || owner === login) return null;
  let original = owner;
  if (owner.includes('~')) {
    const aside = await getAsideAccount(owner);
    if (!aside || aside.id !== id || aside.declined) return null;
    original = aside.login || owner;
  } else if ((await getUserProfile(owner))?.twitchId !== id) return null;
  return { owner, original, cards: await cardsOf(owner) };
}
