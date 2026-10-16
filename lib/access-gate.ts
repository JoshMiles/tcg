// The middleware's gate decision for the closed alpha / beta (pure, so scripts/check-access.mts can run the whole table).

import { canEnterTier, isApiPath, isExemptPath, type AccessSettings } from './access-core';
import type { AccessToken } from './access-token';

export type GateOutcome =
  | 'pass'       // let the request through
  | 'refresh'    // signed in but no usable access cookie: /auth/access checks the lists and issues one
  | 'closed'     // nobody signed in: the /closed page
  | 'forbidden'; // an API call: 403 { ok: false, error: 'closed' }

/**
 * `settings` is null when the database could not be read, which fails open. A staff cookie passes in every mode (the layouts re-check the
 * live staff list). An access cookie passes when it was issued at or after the current settings version and its tier is still allowed.
 */
export function gateDecision(input: { pathname: string; settings: AccessSettings | null; access: AccessToken | null; staffCookie: boolean; hasSession: boolean }): GateOutcome {
  const { pathname, settings, access, staffCookie, hasSession } = input;
  if (isExemptPath(pathname)) return 'pass';
  if (!settings || settings.mode === 'open') return 'pass';
  if (staffCookie) return 'pass';
  if (access && access.v >= settings.v && canEnterTier(settings.mode, access.tier)) return 'pass';
  if (isApiPath(pathname)) return 'forbidden';
  return hasSession ? 'refresh' : 'closed';
}
