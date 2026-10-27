// The Stream Deck webhook (ROADMAP 55.2): POST /api/webhooks/buff. Covers the secret, the per-buff switch, every target, the refusals, the quick
// actions and the cooldown against the mock KV. Run: npx tsx scripts/check-streamdeck.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const core = await import('../lib/buffs-core');
const buffs = await import('../lib/buffs');
const { getWebhookSettings } = await import('../lib/webhooks');
const { recordActivity } = await import('../lib/activity');
const { getStreamBuff } = await import('../lib/pull-limit');
const { getUserAudit } = await import('../lib/audit');
const { POST } = await import('../app/api/webhooks/buff/route');

await kvLib.seedSeason1();
const secret = (await getWebhookSettings()).incomingSecret;
const press = async (body: Record<string, unknown>, withSecret = true) => {
  const res = await POST(new NextRequest('http://localhost/api/webhooks/buff', { method: 'POST', body: JSON.stringify(withSecret ? { secret, ...body } : body) }));
  return { status: res.status, ...(await res.json()) } as { status: number; ok: boolean; message: string };
};
const COOLDOWN_KEYS = ['buff:all:everyone', 'buff:me:bob_1', 'buff:me:cat', 'buff:me:dan_1', 'buff:me:eve_1', 'stream-pulls', 'happy-hour', 'free-pack:fay_1'].map(k => `streamdeck:cd:${k}`);
const clearCooldowns = async () => { for (const k of COOLDOWN_KEYS) await kv.del(k); };

// ── Definitions: the switch is off unless set, and never on for grant-achievement ──
const mk = (o: Record<string, unknown>) => { const r = core.cleanBuffDefInput({ type: 'extra-pulls', magnitude: 1, duration: { unit: 'streams', n: 1 }, stack: 'reject', scope: 'self', ...o }); if (!r.ok) throw new Error(r.message); return r.def; };
ok(mk({ id: 'x', name: 'X' }).streamDeck === undefined, 'the switch is off by default');
ok(mk({ id: 'x', name: 'X', streamDeck: true }).streamDeck === true, 'the switch can be turned on');
ok(core.normalizeBuffDef({ ...mk({ id: 'x', name: 'X' }), streamDeck: true })?.streamDeck === true, 'the switch survives a reload');
ok(core.cleanBuffDefInput({ id: 'a', name: 'A', type: 'grant-achievement', achievementId: 'master', streamDeck: true }).ok === true
  && (core.cleanBuffDefInput({ id: 'a', name: 'A', type: 'grant-achievement', achievementId: 'master', streamDeck: true }) as { def: { streamDeck?: boolean } }).def.streamDeck === undefined, 'grant-achievement never answers');

await buffs.saveBuffDefs([
  mk({ id: 'all', name: 'Everyone pulls', scope: 'community', streamDeck: true }),
  mk({ id: 'me', name: 'Solo pulls', streamDeck: true }),
  mk({ id: 'off', name: 'Switched off', scope: 'community' }),
]);

// ── Secret and switch ──
ok((await press({ buff: 'all' }, false)).status === 401, 'a wrong or missing secret is 401');
let r = await press({ buff: 'off' });
ok(r.ok === false && r.message === '', 'a buff with the switch off answers nothing');
r = await press({ buff: 'nope' });
ok(r.ok === false && r.message === '', 'an unknown buff answers nothing');

// ── Community buff: default and explicit everyone; a viewer target is refused ──
r = await press({ buff: 'all' });
ok(r.ok && r.message === 'Everyone gets +1 pull this stream.', `community default: ${r.message}`);
ok((await buffs.getCommunityBuffs()).some(b => b.buffId === 'all' && b.source === 'streamdeck'), 'the community buff is stored with source streamdeck');
await clearCooldowns();
r = await press({ buff: 'all', target: 'everyone' });
ok(!r.ok && r.message.includes('already active'), `a second application is refused in words: ${r.message}`);
await clearCooldowns();
r = await press({ buff: 'all', target: 'viewer', username: 'bob' });
ok(!r.ok && r.message.includes('goes to everyone'), `a community buff cannot go to one viewer: ${r.message}`);

// ── Self buff: needs a target ──
r = await press({ buff: 'me' });
ok(!r.ok && r.message.includes('needs a viewer'), `a self buff without a target is refused: ${r.message}`);
r = await press({ buff: 'me', target: 'everyone' });
ok(!r.ok && r.message.includes('needs a viewer'), 'a self buff cannot go to everyone');
r = await press({ buff: 'me', target: 'viewer' });
ok(!r.ok && r.message.includes('Say which viewer'), 'target viewer needs a username');
r = await press({ buff: 'me', target: 'viewer', username: '@Bob_1' });
ok(r.ok && r.message === 'bob_1 gets +1 pull this stream.', `target viewer: ${r.message}`);
ok((await buffs.getUserBuffs('bob_1')).length === 1, 'the viewer holds the buff');
r = await press({ buff: 'me', target: 'wat' });
ok(!r.ok && r.message.includes('needs a viewer'), 'an unknown target is refused');

// ── last-pull: refused until someone pulls this stream, then the newest puller ──
await clearCooldowns();
r = await press({ buff: 'me', target: 'last-pull' });
ok(!r.ok && r.message === 'No one has pulled this stream yet.', `no pull yet: ${r.message}`);
const pull = (username: string) => recordActivity({ type: 'pull', username, cardNumber: 1, cardName: 'C', stars: 1, packName: 'P', isNew: true, copies: 1, uniqueOwned: 1 });
await pull('amy'); await pull('cat');
r = await press({ buff: 'me', target: 'last-pull' });
ok(r.ok && r.message.startsWith('cat gets'), `last-pull is the newest puller: ${r.message}`);
ok((await getUserAudit('cat')).some(a => a.action.startsWith('Stream Deck: cat')), 'the press is in the audit log');

// ── Cooldown: a repeat inside the window does nothing; other targets are not held up ──
await clearCooldowns();
const first = await press({ buff: 'me', target: 'viewer', username: 'dan_1' });
const again = await press({ buff: 'me', target: 'viewer', username: 'dan_1' });
ok(first.ok && !again.ok && again.message.includes('just pressed'), `double press: ${again.message}`);
ok((await buffs.getUserBuffs('dan_1')).length === 1, 'the double press applied once');
ok((await press({ buff: 'me', target: 'viewer', username: 'eve_1' })).ok, 'a different viewer is not on cooldown');
ok((await kv.ttl('streamdeck:cd:buff:me:dan_1')) <= 10, 'the cooldown key expires in 10 seconds');

// ── Quick actions ──
await clearCooldowns();
r = await press({ action: 'stream-pulls', amount: 3 });
ok(r.ok && r.message === 'Everyone gets 3 extra pulls this stream.' && (await getStreamBuff())?.amount === 3, `stream-pulls: ${r.message}`);
ok((await press({ action: 'stream-pulls', amount: 0 })).message.includes('just pressed'), 'stream-pulls honours the cooldown');
await clearCooldowns();
r = await press({ action: 'stream-pulls', amount: 0 });
ok(r.ok && r.message.includes('cleared') && (await getStreamBuff()) === null, `amount 0 clears: ${r.message}`);
await clearCooldowns();
ok(!(await press({ action: 'stream-pulls', amount: 'lots' })).ok, 'a bad amount is refused');
ok(!(await press({ action: 'stream-pulls' })).ok, 'a missing amount is refused');

await clearCooldowns();
r = await press({ action: 'free-pack' });
ok(!r.ok && r.message.includes('needs a viewer'), 'free-pack needs a target');
const queued = (await kv.llen('webhooks:queue'));
r = await press({ action: 'free-pack', target: 'viewer', username: 'fay_1' });
ok(r.ok && r.message === 'Opening a free pack for fay_1.', `free-pack: ${r.message}`);
const ev = (await kv.lrange<{ username: string; type: string; paid?: boolean }>('webhooks:queue', 0, 0))[0];
ok((await kv.llen('webhooks:queue')) === queued + 1 && ev.username === 'fay_1' && ev.type === 'pull' && !ev.paid, 'one pull is queued and never charges');
ok(!(await press({ action: 'free-pack', target: 'viewer', username: 'fay_1' })).ok, 'free-pack honours the cooldown');
ok(!(await press({ action: 'nope' })).ok, 'an unknown action answers nothing');

// ── Happy hour (ROADMAP 55.4c) ──
const { getHappyHour } = await import('../lib/happyhour');
await clearCooldowns();
r = await press({ action: 'happy-hour', amount: 30 });
let hhNow = await getHappyHour();
ok(r.ok && r.message === 'Happy hour: free packs for 30 minutes.' && hhNow?.kind === 'free' && hhNow.by === 'Stream Deck' && hhNow.endsAt > Date.now() + 29 * 60_000, `happy-hour with no percent is free: ${r.message}`);
ok((await press({ action: 'happy-hour', amount: 30 })).message.includes('just pressed'), 'happy-hour honours the cooldown');
await clearCooldowns();
r = await press({ action: 'happy-hour', amount: '45', percent: 25 });
hhNow = await getHappyHour();
ok(r.ok && r.message === 'Happy hour: 25% off packs for 45 minutes.' && hhNow?.kind === 'discount' && (hhNow as { percent: number }).percent === 25, `a percent makes a discount and replaces the running one: ${r.message}`);
await clearCooldowns();
ok(!(await press({ action: 'happy-hour', amount: 30, percent: 100 })).ok && !(await press({ action: 'happy-hour', amount: 999 })).ok && !(await press({ action: 'happy-hour' })).ok && !(await press({ action: 'happy-hour', amount: 'x' })).ok, 'a bad percent, minutes or a missing amount is refused');
ok((await getHappyHour())?.kind === 'discount', 'a refused press leaves the running happy hour alone');
await clearCooldowns();
r = await press({ action: 'happy-hour', amount: 0 });
ok(r.ok && r.message.includes('over') && (await getHappyHour()) === null, `amount 0 ends it: ${r.message}`);
const hhAudit = (await getUserAudit('everyone', 20)).filter(e => e.action.startsWith('Happy hour'));
ok(hhAudit.length === 3 && hhAudit.some(e => e.action === 'Happy hour ended'), 'each start and the end wrote one audit entry');
await clearCooldowns();
r = await press({ action: 'happy-hour', amount: 0 });
ok(r.ok && r.message.includes('no happy hour') && (await getUserAudit('everyone', 20)).filter(e => e.action.startsWith('Happy hour')).length === 3, 'ending when none runs says so and logs nothing');

console.log('check-streamdeck: ok');
process.exit(0);
