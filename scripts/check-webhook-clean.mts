// Outgoing webhook addresses and fields are cleaned on the server (lib/webhook-clean.ts), and the sender refuses a private address even if
// one was stored earlier. Pure; also reads the source to make sure the form action and the sender use it. Run: npx tsx scripts/check-webhook-clean.mts
import { readFileSync } from 'node:fs';
import { checkWebhookUrl, cleanWebhookFields, isPrivateHost } from '../lib/webhook-clean';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

for (const h of ['localhost', 'foo.localhost', '127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '172.31.255.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '[::1]', 'fd00::1', 'fe80::1', 'printer.local', 'db.internal', 'intranet']) {
  ok(isPrivateHost(h), `${h} is a private host`);
}
for (const h of ['example.com', 'hooks.zapier.com', '8.8.8.8', '172.32.0.1', '100.128.0.1', '[2606:4700::1111]']) {
  ok(!isPrivateHost(h), `${h} is public`);
}

ok(checkWebhookUrl('').ok && (checkWebhookUrl('  ') as { url: string }).url === '', 'an empty address is allowed (not set up)');
ok(checkWebhookUrl('https://example.com/hook?x=1').ok, 'a public https address is fine');
ok(checkWebhookUrl('http://example.com/hook').ok, 'a public http address is fine');
for (const bad of ['not a url', 'ftp://example.com/x', 'javascript:alert(1)', 'file:///etc/passwd', 'http://localhost:3000/x', 'http://127.0.0.1/x', 'https://169.254.169.254/latest/meta-data', 'https://user:pw@example.com/x', 'https://' + 'a'.repeat(600) + '.com']) {
  ok(!checkWebhookUrl(bad).ok, `${bad.slice(0, 40)} is refused`);
}

ok(JSON.stringify(cleanWebhookFields([{ key: ' user ', value: '{username}' }, { key: '', value: 'x' }, null, 5, { key: 'n', value: 7 }, { value: 'no key' }])) === JSON.stringify([{ key: 'user', value: '{username}' }, { key: 'n', value: '' }]), 'fields keep well-formed rows only');
ok(cleanWebhookFields('nope').length === 0 && cleanWebhookFields({}).length === 0, 'fields that are not a list become empty');
ok(cleanWebhookFields(Array.from({ length: 50 }, (_, i) => ({ key: 'k' + i, value: '' }))).length === 20, 'at most 20 fields');

const actions = readFileSync(new URL('../app/admin/actions/settings.ts', import.meta.url), 'utf8');
const section = actions.slice(actions.indexOf('export async function saveOutgoingWebhook'), actions.indexOf('export async function regenerateWebhookSecret'));
ok(section.includes('checkWebhookUrl(') && section.includes('cleanWebhookFields('), 'the settings form checks the address and the fields');
const lib = readFileSync(new URL('../lib/webhooks.ts', import.meta.url), 'utf8');
ok(lib.includes('checkWebhookUrl(config.url)'), 'the sender checks the address again before calling it');
ok(lib.includes('timingSafeEqual'), 'the incoming secret is compared in constant time');

console.log('webhook-clean checks passed');
