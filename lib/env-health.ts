// Which environment variables are set, and what each one unlocks. Pure: give it an env map and it reports presence only,
// never values (they are secrets). Shown on Admin -> Settings -> Environment.

export type EnvLevel = 'required' | 'recommended' | 'optional';
export type EnvGroup = 'Admin' | 'Database' | 'Storage' | 'Twitch Extension' | 'Twitch API' | 'Website login' | 'Bot protection' | 'Legal pages' | 'Notifications' | 'Discord';

export interface EnvSpec { name: string; group: EnvGroup; level: EnvLevel; unlocks: string; minLength?: number }
export interface EnvCheck extends EnvSpec { set: boolean; weak: boolean }

export const ENV_SPECS: EnvSpec[] = [
  { name: 'ADMIN_SECRET', group: 'Admin', level: 'optional', unlocks: 'No longer signs the emergency cookie. It used to be that cookie\'s key and the legacy import URL secret. Rotate it if that URL was ever opened, then you can remove it. A leaked value cannot mint a cookie.', minLength: 12 },
  { name: 'ADMIN_COOKIE_SECRET', group: 'Admin', level: 'recommended', unlocks: 'Signs the emergency password cookie. Not ADMIN_SECRET. Without it the password login cannot start a session. Generate a new one (16+ characters), different from ADMIN_SECRET and SESSION_SECRET. Twitch staff sign-in does not need it.', minLength: 16 },
  { name: 'ADMIN_PASSWORD_LOGIN', group: 'Admin', level: 'optional', unlocks: 'Set to off to switch off the emergency admin password login once staff sign in with Twitch. Left unset, the password still works as a break-glass full-admin login.' },
  { name: 'SUPER_ADMIN_TWITCH_IDS', group: 'Admin', level: 'optional', unlocks: 'Extra super admins, as comma-separated numeric Twitch account IDs. joshmiles is always a super admin (fixed in the code).' },
  { name: 'ADMIN_PASSWORD', group: 'Admin', level: 'required', unlocks: 'The password you type on the admin login page.', minLength: 8 },
  { name: 'KV_REST_API_URL', group: 'Database', level: 'required', unlocks: 'All game data: seasons, packs, cards, collections.' },
  { name: 'KV_REST_API_TOKEN', group: 'Database', level: 'required', unlocks: 'Read and write access to that database.' },
  { name: 'BLOB_READ_WRITE_TOKEN', group: 'Storage', level: 'recommended', unlocks: 'Uploading card art, covers and sounds, and the Assets cleanup tools.' },
  { name: 'BACKUP_ENCRYPTION_KEY', group: 'Storage', level: 'recommended', unlocks: 'Nightly backups: the password the backup file is encrypted with (backups are public files in Blob, so none is written without it). Keep a copy somewhere safe: without it a backup cannot be read.', minLength: 16 },
  { name: 'CRON_SECRET', group: 'Storage', level: 'recommended', unlocks: 'Nightly backups: Vercel sends it to the backup route, which refuses every other caller. Any long random string.', minLength: 16 },
  { name: 'TWITCH_EXTENSION_SECRET', group: 'Twitch Extension', level: 'required', unlocks: 'Verifying viewers in the Twitch panel, so they can log in and upgrade there.' },
  { name: 'VAPID_PUBLIC_KEY', group: 'Notifications', level: 'recommended', unlocks: 'Push alerts on phones and browsers (Settings, Notifications). Generate the pair with: npx web-push generate-vapid-keys. Without the keys the option stays hidden.' },
  { name: 'VAPID_PRIVATE_KEY', group: 'Notifications', level: 'recommended', unlocks: 'The matching private key, which signs the alerts. Keep it secret.' },
  { name: 'VAPID_SUBJECT', group: 'Notifications', level: 'recommended', unlocks: 'Who the push services can contact about the alerts: mailto: and the legal contact address.' },
  { name: 'TWITCH_CLIENT_ID', group: 'Twitch API', level: 'recommended', unlocks: 'Avatars, the LIVE indicator, and finding a viewer from their Twitch ID.' },
  { name: 'TWITCH_CLIENT_SECRET', group: 'Twitch API', level: 'recommended', unlocks: 'The same, and website login (it signs the code exchange).' },
  { name: 'SESSION_SECRET', group: 'Website login', level: 'recommended', unlocks: '"Log in with Twitch" on the website: My Stats, upgrading and trading.', minLength: 16 },
  { name: 'SITE_URL', group: 'Website login', level: 'optional', unlocks: 'The public address used in login redirects and links. Defaults to the production domain.' },
  { name: 'TURNSTILE_SITE_KEY', group: 'Bot protection', level: 'recommended', unlocks: 'The Cloudflare Turnstile check shown before trades and upgrades on the website (the public site key).' },
  { name: 'TURNSTILE_SECRET_KEY', group: 'Bot protection', level: 'recommended', unlocks: 'Verifying that check on the server (needs the site key too). Without both, trades and upgrades skip the check.' },
  { name: 'GITHUB_CHANGELOG_TOKEN', group: 'Storage', level: 'recommended', unlocks: "The What's new page: at each build it reads the merged pull requests (fine-grained token for this repo only, Pull requests: read-only) and turns their Changelog sections into entries. Without it only the hand-written history shows." },
  { name: 'DISCORD_CLIENT_ID', group: 'Discord', level: 'recommended', unlocks: 'Linking a Discord account (Settings, Notifications) and Discord direct message alerts: the application ID from the Discord developer portal. All three Discord variables must be set or the option stays hidden. Add <site>/auth/discord/callback as a redirect there.' },
  { name: 'DISCORD_CLIENT_SECRET', group: 'Discord', level: 'recommended', unlocks: 'The same application\'s OAuth client secret, which signs the Discord link exchange (scope identify only).' },
  { name: 'DISCORD_BOT_TOKEN', group: 'Discord', level: 'recommended', unlocks: 'The bot that sends the direct messages. Discord only delivers them to players who share a server with the bot, so invite it to the Cheesygidds server. Keep it secret.' },
  { name: 'LEGAL_OPERATOR_NAME', group: 'Legal pages', level: 'recommended', unlocks: 'Names who runs the extension on the Privacy Policy and Terms. Set before submitting the extension for review.' },
  { name: 'LEGAL_CONTACT_EMAIL', group: 'Legal pages', level: 'recommended', unlocks: 'The privacy contact address on the Privacy Policy. Set before submitting the extension for review.' },
  { name: 'LEGAL_GOVERNING_LAW', group: 'Legal pages', level: 'optional', unlocks: 'The governing-law line in the Terms.' },
];

export const ENV_GROUPS: EnvGroup[] = ['Admin', 'Database', 'Storage', 'Twitch Extension', 'Twitch API', 'Website login', 'Bot protection', 'Legal pages', 'Notifications', 'Discord'];

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
