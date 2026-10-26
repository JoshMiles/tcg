// Pure: what a sign-in means for the profile it lands on. Profiles are keyed by Twitch login, and a login can be freed and
// taken by a different person, so the Twitch account ID is the only proof of who is signing in (see lib/account-bind.ts).

import { isTwitchId } from './staff-core';

/** KV hash: Twitch ID -> the login that holds that account's profile (written once at sign-in, repointed by a move). */
export const IDS = 'acct:ids';

export type SignInKind = 'new' | 'claim' | 'same' | 'conflict';

/**
 * `new`: no profile yet. `claim`: a profile that holds no usable ID (none, or free text from the admin form). `same`: the profile
 * holds this ID. `conflict`: the profile holds a different ID. Only a numeric Twitch ID counts as an ID, on either side; a sign-in
 * with no usable ID (a sandbox session) can only be `new` or `same`, because there is nothing to claim or compare.
 */
export function classifySignIn(profile: { twitchId?: unknown } | null | undefined, id: unknown): SignInKind {
  if (!profile) return 'new';
  if (!isTwitchId(id)) return 'same';
  if (!isTwitchId(profile.twitchId)) return 'claim';
  return profile.twitchId === id ? 'same' : 'conflict';
}
