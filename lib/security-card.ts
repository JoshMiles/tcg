// What Admin -> Settings -> Environment shows on its Security card. Pure: give it an env map and it returns set/unset and
// lengths only. A secret's value, or any part of it, is never copied into the result.
import { adminCookieKey, isPasswordLoginEnabled } from './admin-token';

type Env = Record<string, string | undefined>;

/** The secrets the code signs or checks with, each with the shortest length it accepts. */
const SECRETS: { name: string; what: string; min?: number }[] = [
  { name: 'ADMIN_PASSWORD', what: 'emergency password', min: 8 },
  { name: 'ADMIN_COOKIE_SECRET', what: 'signs the emergency cookie', min: 16 },
  { name: 'SESSION_SECRET', what: 'website login, staff, sandbox and access cookies', min: 16 },
  { name: 'TWITCH_EXTENSION_SECRET', what: 'verifies Twitch panel viewers' },
  { name: 'CRON_SECRET', what: 'guards the nightly backup route', min: 16 },
  { name: 'BACKUP_ENCRYPTION_KEY', what: 'encrypts backups', min: 16 },
];

export interface SecretRow { name: string; what: string; set: boolean; length: number; short: boolean }
export interface SecurityCard {
  /** ADMIN_PASSWORD_LOGIN is not off. */
  passwordLoginOn: boolean;
  /** On, with a password and a long enough cookie key, so the login can really start a session. */
  passwordLoginUsable: boolean;
  secrets: SecretRow[];
}

export function securityCard(env: Env): SecurityCard {
  const len = (n: string) => (env[n] ?? '').trim().length;
  const passwordLoginOn = isPasswordLoginEnabled(env);
  return {
    passwordLoginOn,
    passwordLoginUsable: passwordLoginOn && len('ADMIN_PASSWORD') > 0 && adminCookieKey(env) !== null,
    secrets: SECRETS.map(s => ({ name: s.name, what: s.what, set: len(s.name) > 0, length: len(s.name), short: len(s.name) > 0 && !!s.min && len(s.name) < s.min })),
  };
}
