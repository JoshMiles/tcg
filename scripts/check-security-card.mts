// The Security card shows set/unset and lengths only. Needs the mock KV for the last-login part. Run: npx tsx scripts/check-security-card.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
process.env.VERCEL_ENV = 'development';
const ok = (c: unknown, m: string) => { if (!c) throw new Error('FAILED: ' + m); };

const { securityCard } = await import('../lib/security-card');
const env = { ADMIN_PASSWORD: 'Zq7xK9mPw2Lr', ADMIN_COOKIE_SECRET: 'Qx8vN3bYt5Rj1Hc6Wd', SESSION_SECRET: 'Vk4Jp', TWITCH_EXTENSION_SECRET: 'Gm9Bz2Xs7Tn4' };
const card = securityCard(env);
const json = JSON.stringify(card);
for (const v of Object.values(env)) ok(!json.includes(v) && !json.includes(v.slice(0, 4)), `the result never contains a value or prefix (${v.length} chars)`);
const row = (n: string) => card.secrets.find(s => s.name === n)!;
ok(row('ADMIN_COOKIE_SECRET').length === env.ADMIN_COOKIE_SECRET.length && row('ADMIN_COOKIE_SECRET').set && !row('ADMIN_COOKIE_SECRET').short, 'length and set are reported');
ok(row('SESSION_SECRET').short, 'a short secret is flagged');
ok(!row('CRON_SECRET').set && row('CRON_SECRET').length === 0, 'unset reads as not set, length 0');
ok(card.passwordLoginOn && card.passwordLoginUsable, 'password login on and usable');
ok(!securityCard({ ...env, ADMIN_PASSWORD_LOGIN: 'off' }).passwordLoginOn, 'ADMIN_PASSWORD_LOGIN=off reads as off');
ok(!securityCard({ ...env, ADMIN_COOKIE_SECRET: 'tooshort' }).passwordLoginUsable, 'a short cookie secret makes the login unusable');

const { recordEmergencyLogin, lastEmergencyLogin } = await import('../lib/admin-cookie');
const { prodKv } = await import('../lib/db');
await prodKv.del('admin:last-login:development');
ok((await lastEmergencyLogin()) === null, 'no login recorded yet');
await recordEmergencyLogin(1_700_000_000_000);
ok((await lastEmergencyLogin()) === 1_700_000_000_000, 'the last login time is stored and read back');
await prodKv.del('admin:last-login:development');
console.log('security card checks passed');
