// Which environment variables are set, and what each one unlocks. Pure: give it an env map and it reports presence only,
// never values (they are secrets). Shown on Admin -> Settings -> Environment.

export type EnvLevel = 'required' | 'recommended' | 'optional';
export type EnvGroup = 'Admin' | 'Database' | 'Storage' | 'Twitch Extension' | 'Twitch API' | 'Website login' | 'Bot protection' | 'Legal pages';

export interface EnvSpec { name: string; group: EnvGroup; level: EnvLevel; unlocks: string; minLength?: number }
export interface EnvCheck extends EnvSpec { set: boolean; weak: boolean }

export const ENV_SPECS: EnvSpec[] = [
  { name: 'ADMIN_SECRET', group: 'Admin', level: 'required', unlocks: 'The admin panel itself: with it unset nobody can log in.', minLength: 12 },
  { name: 'ADMIN_PASSWORD_LOGIN', group: 'Admin', level: 'optional', unlocks: 'Set to off to switch off the emergency admin password login once staff sign in with Twitch. Left unset, the password still works as a break-glass full-admin login.' },
  { name: 'SUPER_ADMIN_TWITCH_IDS', group: 'Admin', level: 'optional', unlocks: 'Extra super admins, as comma-separated numeric Twitch account IDs. joshmiles is always a super admin (fixed in the code).' },
  { name: 'ADMIN_PASSWORD', group: 'Admin', level: 'required', unlocks: 'The password you type on the admin login page.', minLength: 8 },
  { name: 'KV_REST_API_URL', group: 'Database', level: 'required', unlocks: 'All game data: seasons, packs, cards, collections.' },
  { name: 'KV_REST_API_TOKEN', group: 'Database', level: 'required', unlocks: 'Read and write access to that database.' },
  { name: 'BLOB_READ_WRITE_TOKEN', group: 'Storage', level: 'recommended', unlocks: 'Uploading card art, covers and sounds, and the Assets cleanup tools.' },
  { name: 'BACKUP_ENCRYPTION_KEY', group: 'Storage', level: 'recommended', unlocks: 'Nightly backups: the password the backup file is encrypted with (backups are public files in Blob, so none is written without it). Keep a copy somewhere safe: without it a backup cannot be read.', minLength: 16 },
  { name: 'CRON_SECRET', group: 'Storage', level: 'recommended', unlocks: 'Nightly backups: Vercel sends it to the backup route, which refuses every other caller. Any long random string.', minLength: 16 },
  { name: 'TWITCH_EXTENSION_SECRET', group: 'Twitch Extension', level: 'required', unlocks: 'Verifying viewers in the Twitch panel, so they can log in and upgrade there.' },
  { name: 'TWITCH_CLIENT_ID', group: 'Twitch API', level: 'recommended', unlocks: 'Avatars, the LIVE indicator, and finding a viewer from their Twitch ID.' },
  { name: 'TWITCH_CLIENT_SECRET', group: 'Twitch API', level: 'recommended', unlocks: 'The same, and website login (it signs the code exchange).' },
  { name: 'SESSION_SECRET', group: 'Website login', level: 'recommended', unlocks: '"Log in with Twitch" on the website: My Stats, upgrading and trading.', minLength: 16 },
  { name: 'SITE_URL', group: 'Website login', level: 'optional', unlocks: 'The public address used in login redirects and links. Defaults to the production domain.' },
  { name: 'TURNSTILE_SITE_KEY', group: 'Bot protection', level: 'recommended', unlocks: 'The Cloudflare Turnstile check shown before trades and upgrades on the website (the public site key).' },
  { name: 'TURNSTILE_SECRET_KEY', group: 'Bot protection', level: 'recommended', unlocks: 'Verifying that check on the server (needs the site key too). Without both, trades and upgrades skip the check.' },
  { name: 'LEGAL_OPERATOR_NAME', group: 'Legal pages', level: 'recommended', unlocks: 'Names who runs the extension on the Privacy Policy and Terms. Set before submitting the extension for review.' },
  { name: 'LEGAL_CONTACT_EMAIL', group: 'Legal pages', level: 'recommended', unlocks: 'The privacy contact address on the Privacy Policy. Set before submitting the extension for review.' },
  { name: 'LEGAL_GOVERNING_LAW', group: 'Legal pages', level: 'optional', unlocks: 'The governing-law line in the Terms.' },
];

export const ENV_GROUPS: EnvGroup[] = ['Admin', 'Database', 'Storage', 'Twitch Extension', 'Twitch API', 'Website login', 'Bot protection', 'Legal pages'];

/** Presence of each variable; a value that is set but shorter than its minimum is flagged weak (its length is the only thing inspected). */
export function checkEnv(env: Record<string, string | undefined>, specs: EnvSpec[] = ENV_SPECS): EnvCheck[] {
  return specs.map(s => {
    const v = (env[s.name] ?? '').trim();
    return { ...s, set: v.length > 0, weak: v.length > 0 && !!s.minLength && v.length < s.minLength };
  });
}

export interface EnvSummary { requiredMissing: number; recommendedMissing: number; weak: number; ready: boolean }

export function summarizeEnv(checks: EnvCheck[]): EnvSummary {
  const requiredMissing = checks.filter(c => c.level === 'required' && !c.set).length;
  return {
    requiredMissing,
    recommendedMissing: checks.filter(c => c.level === 'recommended' && !c.set).length,
    weak: checks.filter(c => c.weak).length,
    ready: requiredMissing === 0,
  };
}

/** The Blob token can arrive under either of two names (see lib/assets.ts). */
export function readEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  return { ...env, BLOB_READ_WRITE_TOKEN: env.BLOB_READ_WRITE_TOKEN || env.VERCEL_BLOB_RW_TOKEN };
}
