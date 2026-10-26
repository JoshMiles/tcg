// Mix It Up paid pulls (ROADMAP Track 12): settings cleaning, the message template, reply reading, and the whole reserve / claim /
// charge / refund flow against a fake Mix It Up and the mock KV (node scripts/mock-kv.cjs). Run: npx tsx scripts/check-mixitup.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const c = await import('../lib/mixitup-core');
const m = await import('../lib/mixitup');
const kvLib = await import('../lib/kv');

// ── Pure: settings ──
const d = c.normalizeMixItUp(null);
ok(!d.enabled && d.currency === 'Brie Bucks' && d.cost === 100 && d.limit === 0 && d.message === c.DEFAULT_MESSAGE, 'nothing stored gives the defaults, switched off');
ok(c.normalizeMixItUp({ cost: -5, limit: 'x', currency: '  ' }).cost === 1 && c.normalizeMixItUp({ cost: 'x' }).cost === 100 && c.normalizeMixItUp({ limit: 2.9 }).limit === 2, 'a price is at least 1, junk falls back and decimals are floored');
ok(!c.cleanMixItUpInput({ enabled: true, balanceUrl: '' }).ok, 'switching on needs a balance address');
ok(!c.cleanMixItUpInput({ balanceUrl: 'http://localhost:8911/api/x' }).ok, 'a private address is refused');
ok(!c.cleanMixItUpInput({ balanceUrl: 'https://hook.example/a', cost: 0 }).ok, 'a price below 1 is refused');
const good = c.cleanMixItUpInput({ enabled: 'on', balanceUrl: 'https://hook.example/a', limit: '3', cost: '50' });
ok(good.ok && good.settings.enabled && good.settings.limit === 3 && good.settings.cost === 50 && good.settings.roleLimits.subscriber === 3, 'a good form is cleaned, and a missing role uses the fallback limit');

const setup = await import('../lib/mixitup-setup');
const paid = setup.paidPullSetup({ ...c.DEFAULT_MIXITUP, secret: 's3cret', currency: 'Gouda Coins', cost: 40, balanceUrl: 'https://hook.example/bal', deductUrl: '', message: c.DEFAULT_MESSAGE, balanceField: 'balance' });
ok(paid.balanceBody.includes('Gouda Coins') && paid.deductBody.includes('Gouda Coins') && paid.deductBody.includes('40'), 'the paid-pull bodies use the saved currency and price');
ok(paid.balanceBody.includes('s3cret') && !paid.balanceBody.includes('"secret": ""'), 'a set secret is not printed empty');
ok(paid.sameAddress && paid.deductUrl === 'https://hook.example/bal' && paid.balanceAnswer.includes('"balance"'), 'an empty deduct address is the balance address, and the balance action answers that field');
const blocks = setup.commandSetups([{ name: 'showoff', enabled: true }, { name: 'stats', enabled: false }], 'https://cheesytcg.app/api/webhooks/command', 's3cret');
ok(blocks.length === 1 && blocks[0].command === '!showoff' && blocks[0].body.includes('"command": "showoff"') && blocks[0].body.includes('s3cret') && blocks[0].replyField === 'message', 'only an enabled command is listed, with its name and the secret');

// ── Pure: message, replies, windows ──
ok(c.renderMessage('{username} paid {amount} {currency} {nope}!', { username: 'ann', amount: 100, currency: 'Brie Bucks' }) === 'ann paid 100 Brie Bucks !', 'placeholders fill and unknown ones vanish');
ok(c.renderMessage('x'.repeat(900), {}).length === c.MESSAGE_MAX, 'the message is capped');
ok(c.parseBalance({ balance: 250 }, 'balance') === 250 && c.parseBalance({ balance: '1,250' }, 'balance') === 1250 && c.parseBalance({ coins: 7.9 }, 'coins') === 7, 'balances are read from a number or numeric text');
ok(c.parseBalance({ balance: -1 }, 'balance') === null && c.parseBalance({}, 'balance') === null && c.parseBalance('x', 'balance') === null && c.parseBalance({ balance: 'lots' }, 'balance') === null, 'a missing or bad balance is null');
ok(c.replyApplied(200, null) && c.replyApplied(200, { ok: true }) && !c.replyApplied(200, { success: false }) && !c.replyApplied(200, { applied: 'false' }) && !c.replyApplied(500, {}), 'a reply counts as paid only when 2xx and not false');
ok(c.streamKey(1700000000000) === 's1700000000000' && c.streamKey(null, Date.UTC(2026, 9, 16, 23, 59)) === 'd2026-10-16', 'the window is the stream, else the UTC day');
ok(c.decide({ balance: 200, cost: 100, pending: 2 }) && !c.decide({ balance: 199, cost: 100, pending: 2 }), 'the balance must cover every pull in flight');

// ── A fake Mix It Up ──
const balances: Record<string, number> = { ann: 250, bob: 50, cat: 1000, dan: 1000, eve: 1000 };
const calls: { action: string; username: string; amount?: number; message?: string; secret?: string }[] = [];
let mode: 'ok' | 'down' | 'junk' | 'declines' | 'text' = 'ok';
const fake: typeof fetch = async (_url, init) => {
  const body = JSON.parse(String(init?.body));
  calls.push(body);
  if (mode === 'down') throw new Error('connect ECONNREFUSED');
  if (body.action === 'balance') return new Response(JSON.stringify(mode === 'junk' ? { coins: 5 } : { balance: balances[body.username] ?? 0 }), { status: 200 });
  if (mode === 'declines') return new Response(JSON.stringify({ ok: false }), { status: 200 });
  return new Response(mode === 'text' ? 'Done' : JSON.stringify({ ok: true }), { status: 200 });
};
const settings = c.normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', cost: 100, limit: 2, secret: 's3' });
const reserve = (u: string, id: string) => m.reservePaidPull(settings, u, id, fake);

// ── Reserve: balance, pending, limit ──
const a1 = await reserve('ann', 'p1');
ok(a1.ok && calls[0].action === 'balance' && calls[0].secret === 's3' && calls[0].username === 'ann', 'a reserve asks Mix It Up for the balance, with the secret');
const a2 = await reserve('ann', 'p2');
ok(a2.ok, 'a second pull is allowed while the balance covers both (250 vs 200)');
const a3 = await reserve('ann', 'p3');
ok(!a3.ok && a3.reason === 'limit_reached' && /used all 2/.test(a3.message), 'the third pull is over the limit of 2');
const noLimit = { ...settings, limit: 0, roleLimits: { regular: 0, subscriber: 0, vip: 0, moderator: 0, broadcaster: 0 } };
const a4 = await m.reservePaidPull(noLimit, 'ann', 'p4', fake);
ok(!a4.ok && a4.reason === 'insufficient_balance' && a4.balance === 250 && /costs 100/.test(a4.message), 'in-flight pulls count against the balance (250 does not cover three)');
const b1 = await reserve('bob', 'q1');
ok(!b1.ok && b1.reason === 'insufficient_balance', 'a viewer who cannot afford a pack is refused');
ok(!(await reserve('bob', 'q2')).ok && (await reserve('bob', 'q3')).ok === false, 'a refusal does not use up the limit');
mode = 'down';
const d1 = await reserve('cat', 'r1');
ok(!d1.ok && d1.reason === 'mixitup_unavailable', 'no answer from Mix It Up means no pack');
mode = 'junk';
const d2 = await reserve('cat', 'r2');
ok(!d2.ok && d2.reason === 'bad_balance', 'a reply without the balance field means no pack');
mode = 'ok';
const r3 = await reserve('cat', 'r3'), r4 = await reserve('cat', 'r4'), r5 = await reserve('cat', 'r5');
ok(r3.ok && r4.ok && !r5.ok, 'failed checks gave the allowance back: cat still gets her 2 pulls');

// ── Claim: once, and only for the right viewer ──
ok((await m.claimPaidPull('nope', 'ann')) === null, 'an unknown payment id is refused');
ok((await m.claimPaidPull('p1', 'bob')) === null, 'someone else cannot claim it');
const claim = await m.claimPaidPull('p1', 'ANN');
ok(claim && claim.amount === 100 && claim.username === 'ann', 'the right viewer claims it');
ok((await m.claimPaidPull('p1', 'ann')) === null, 'a second claim of the same payment is refused (no double charge)');

// ── Charge ──
calls.length = 0;
const mix = { ...settings, message: '{username} got {cardName} ({variant}) for {amount} {currency}' };
const res = await m.chargePaidPull(mix, claim!, { cardName: 'Gouda Goat', variant: 'Shiny Full Art', stars: 4, packName: 'Base', cardNumber: 7, serial: 3 }, fake);
ok(res.applied && calls[0].action === 'deduct' && calls[0].amount === 100 && calls[0].message === 'ann got Gouda Goat (Shiny Full Art) for 100 Brie Bucks', 'the charge carries the amount and the custom message');
mode = 'text';
ok((await m.chargePaidPull(mix, claim!, { cardName: 'X', variant: 'Regular', stars: 1, packName: 'B', cardNumber: 1 }, fake)).applied, 'a plain "Done" reply counts as paid');
mode = 'declines';
ok(!(await m.chargePaidPull(mix, claim!, { cardName: 'X', variant: 'Regular', stars: 1, packName: 'B', cardNumber: 1 }, fake)).applied, 'a reply with ok:false is not paid');
mode = 'down';
ok(!(await m.chargePaidPull(mix, claim!, { cardName: 'X', variant: 'Regular', stars: 1, packName: 'B', cardNumber: 1 }, fake)).applied, 'no reply is not paid');
mode = 'ok';
const split = await m.chargePaidPull({ ...mix, deductUrl: 'https://hook.example/take' }, claim!, { cardName: 'X', variant: 'Regular', stars: 1, packName: 'B', cardNumber: 1 }, fake);
ok(split.applied, 'a separate deduct address is used when set');
ok(!(await m.callMixItUp('http://localhost:8911/x', {}, fake)).ok, 'the server never calls a private address');

// ── Refund: a charge with no print behind it is paid back, and the allowance returns ──
const refundMix = { ...mix, addUrl: 'https://hook.example/add' };
const callsBefore = calls.length;
await m.refundPaidPull(refundMix, claim!, 'Gouda Goat', fake);
ok(calls.length === callsBefore + 1 && calls[calls.length - 1].action === 'add' && calls[calls.length - 1].amount === claim!.amount && calls[calls.length - 1].username === 'ann', 'a refund adds the charged amount back through the add address');
await m.refundPaidPull(mix, claim!, 'Gouda Goat', fake);
ok(calls.length === callsBefore + 1, 'no add address: nothing is sent, staff are told instead');
ok((await m.getMixItUpLog()).some(e => e.what === 'revoked' && /refund/.test(e.detail)), 'a refund that could not be made is logged');

// ── Release: a reservation whose pull was never queued gives everything back ──
const lim = c.normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', cost: 100, limit: 1 });
ok((await m.reservePaidPull(lim, 'dan', 'x1', fake)).ok && !(await m.reservePaidPull(lim, 'dan', 'x2', fake)).ok, 'dan used his one pull');
await m.releasePaidPull('x1');
ok((await m.reservePaidPull(lim, 'dan', 'x3', fake)).ok, 'releasing the reservation gave the pull back');
await m.releasePaidPull('x1');
ok(!(await m.reservePaidPull(lim, 'dan', 'x4', fake)).ok, 'releasing twice does not give back more than was taken');

// ── Log ──
const log = await m.getMixItUpLog();
ok(log.length > 0 && log.length <= 20 && log.some(e => e.what === 'refused') && log.some(e => e.what === 'deduct' && !e.ok), 'the log keeps the last 20, refusals and failed charges included');

console.log('mixitup checks passed');
