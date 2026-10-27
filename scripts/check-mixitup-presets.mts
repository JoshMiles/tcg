// Mix It Up command files (ROADMAP 55.5): the generated file has the sample's shape, new IDs each call, and the secret and address.
// Pure, no KV. Importing into real Mix It Up cannot be checked here. Run: npx tsx scripts/check-mixitup-presets.mts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const p = await import('../lib/mixitup-presets');
const setup = await import('../lib/mixitup-setup');
const root = join(import.meta.dirname, '..');

/** Keys in order with value types; arrays by their first item; dictionaries (free keys) by their $type only. */
function shape(v: unknown): unknown {
  if (Array.isArray(v)) return v.length ? [shape(v[0])] : [];
  if (v === null) return 'null';
  if (typeof v !== 'object') return typeof v;
  const o = v as Record<string, unknown>;
  if (String(o.$type ?? '').startsWith('System.Collections.Generic.Dictionary')) return { $type: 'string' };
  return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, shape(x)]));
}
const types = (v: unknown, out: string[] = []): string[] => {
  if (Array.isArray(v)) v.forEach(x => types(x, out));
  else if (v && typeof v === 'object') { const o = v as Record<string, unknown>; if (o.$type) out.push(String(o.$type)); Object.values(o).forEach(x => types(x, out)); }
  return out;
};
const ids = (s: string) => s.match(/"ID":"[0-9a-f-]{36}"/g) ?? [];

const fixture = JSON.parse(readFileSync(join(root, 'scripts/fixtures/mixitup-chat-command.miucommand'), 'utf8'));
const url = 'https://cheesytcg.app/api/webhooks/pull';
const body = setup.incomingSetup(url, 's3cret-value', { username: '$username', requestId: setup.REQUEST_ID }).body;
const args = { name: 'pack', url, body, replyKeys: ['message', 'left'], chatText: '$reply' };

const a = p.chatCommandFile(args);
const b = p.chatCommandFile(args);
const f = JSON.parse(a);
ok(JSON.stringify(shape(f)) === JSON.stringify(shape(fixture)), 'a chat file has the same keys, order and value types as the sample');
ok(JSON.stringify(types(f)) === JSON.stringify(types(fixture)), 'a chat file has the same $types, in the same order as the sample');
ok(JSON.stringify(f.Requirements) === JSON.stringify(fixture.Requirements), 'the requirements are the sample\'s');
ok(ids(a).length === 3 && new Set([...ids(a), ...ids(b)]).size === 6, 'three IDs per file, all new on the next call');
const web = f.Actions[0];
ok(web.Url === url && web.RequestBody === body && web.RequestBody.includes('s3cret-value') && !web.RequestBody.includes('{{'), 'the address and a body with the secret and Mix It Up identifiers (no {{...}})');
ok(web.RequestBody.includes('"requestId": "$randomnumber1:2000000000"') && web.HttpMethod === 1 && web.ResponseType === 1, 'POST, JSON, and a requestId that Mix It Up draws again on every run');
ok(web.JSONToSpecialIdentifiers.message === 'reply' && web.JSONToSpecialIdentifiers.left === 'tcgleft', 'every reply key is a special identifier');
ok(f.Actions[1].ChatText === '$reply' && f.Triggers.length === 1 && f.Triggers[0] === 'pack', 'the Chat Message says $reply and the trigger has no !');
ok(JSON.parse(p.chatCommandFile({ ...args, aliases: ['p', 'open'] })).Triggers.join() === 'pack,p,open', 'aliases are more triggers');

// event and Stream Deck (action group) files: same layout with the other model classes
const ev = JSON.parse(p.eventCommandFile({ name: 'Stream Start', url, body, eventType: 200 }));
ok(ev.$type.includes('EventCommandModel') && ev.Type === 2 && ev.EventType === 200 && ev.Actions.length === 1 && ev.Actions[0].Type === 11, 'an event file has an EventType and one Web Request');
const gr = JSON.parse(p.actionGroupFile({ name: 'Free pack', url, body, replyKeys: ['message'], chatText: '$reply' }));
ok(gr.$type.includes('ActionGroupCommandModel') && gr.Type === 4 && gr.Actions.length === 2, 'a Stream Deck file is an action group with a Web Request and a Chat Message');
for (const x of [ev, gr]) ok(JSON.stringify(Object.keys(x).filter(k => !['EventType', 'RunOneRandomly'].includes(k))) === JSON.stringify(Object.keys(fixture).filter(k => !['IncludeExclamation', 'Wildcards'].includes(k))), 'event and group files keep the base keys in the sample\'s order');

// the link: spec -> file with the real secret and address; junk is refused
const make = (s: object) => p.presetFile(JSON.stringify(s), 'https://cheesytcg.app', 'real-secret');
const pack = make({ kind: 'chat', name: 'pack', path: 'pull', fields: { username: '$username' }, reply: ['message', 'left', 'balance'] });
ok(pack && pack.filename === 'pack.miucommand' && pack.text.includes('real-secret') && pack.text.includes('https://cheesytcg.app/api/webhooks/pull'), 'the file holds the real secret and site address');
const live = make({ kind: 'event', name: 'Stream Start', path: 'stream', fields: { event: 'live' }, event: 'live' });
ok(live && JSON.parse(live.text).EventType === 200 && live.filename === 'stream-start.miucommand' && JSON.parse(live.text).Actions.length === 1, 'stream start is event 200 with no chat message');
ok(JSON.parse(make({ kind: 'event', name: 'Stream End', path: 'stream', fields: { event: 'offline' }, event: 'offline' })!.text).EventType === 201, 'stream end is event 201');
ok(JSON.parse(make({ kind: 'group', name: 'Free pack', path: 'buff', fields: { action: 'free-pack' }, reply: ['message'] })!.text).Type === 4, 'a Stream Deck link makes an action group');
const href = p.presetHref({ kind: 'chat', name: 'pack', path: 'pull', fields: { username: '$username' } });
ok(href.startsWith('/api/admin/mixitup/preset?spec=') && !href.includes('secret'), 'the link carries no secret');
for (const bad of [null, '', 'x', '{}', JSON.stringify({ kind: 'chat', name: 'x', path: '../x', fields: {} }), JSON.stringify({ kind: 'chat', name: 'x', path: 'pull', fields: { a: 1 } }),
  JSON.stringify({ kind: 'event', name: 'x', path: 'stream', fields: {} }), JSON.stringify({ kind: 'nope', name: 'x', path: 'pull', fields: {} })]) ok(p.presetFile(bad, 'https://x', 's') === null, `a bad spec is refused: ${bad}`);

// the commands the Commands tab lists carry their aliases and every variable of their action
const cs = setup.commandSetups([{ name: 'showoff', enabled: true, aliases: ['flex'], action: 'showoff' }], 'https://x/api/webhooks/command', 's')[0];
ok(cs.preset.aliases?.join() === 'flex' && cs.preset.reply![0] === 'message' && cs.preset.reply!.length > 1 && cs.preset.path === 'command', 'a command card knows its aliases and reply fields');

// the route: staff only, and nothing is built before the check
const route = readFileSync(join(root, 'app/api/admin/mixitup/preset/route.ts'), 'utf8');
ok(/isAuthenticated\(\)/.test(route) && route.indexOf('isAuthenticated()') < route.indexOf('getWebhookSettings()') && route.includes("'Cache-Control': 'no-store'"), 'the download route checks staff before it reads the secret, and is never cached');

console.log('mixitup presets ok');
