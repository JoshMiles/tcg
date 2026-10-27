// Mix It Up paid pulls (ROADMAP Track 12): settings cleaning, the message template, reply reading, and the whole reserve / claim /
// charge / refund flow against a fake Mix It Up and the mock KV (node scripts/mock-kv.cjs). Run: npx tsx scripts/check-mixitup.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const c = await import('../lib/mixitup-core');
const m = await import('../lib/mixitup');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');

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
ok(c.renderReply('{username}: {cost} {nope} left {left}.', { username: 'ann', cost: '100' }) === 'ann: 100 left.', 'renderReply drops a placeholder with no value and tidies the gap');
ok(c.renderReply('  hi   {username} !', { username: 'ann' }) === 'hi ann!' && c.renderReply('{username}', { username: 0 }) === '0', 'renderReply tidies spaces and keeps a zero');
ok(c.renderReply('x'.repeat(900), {}).length === c.REPLY_MAX, 'a reply is capped at 400 characters');
const rep = c.normalizeMixItUp({ replies: { queued: ' Go {username} ', bogus: 'x', no_packs: 'y'.repeat(900) }, reply_limit_reached: 'No more.', reply_queued: '' });
ok(!('queued' in rep.replies) && rep.replies.limit_reached === 'No more.' && rep.replies.no_packs?.length === c.REPLY_MAX && !('bogus' in rep.replies), 'replies are trimmed, capped and keyed; a blank form field clears a saved one');
ok(c.refusalMessage('limit_reached', { cost: 1, currency: 'x', limit: 2, replies: {} }, 'ann') === 'ann, you have used all 2 pulls for this stream.' && c.normalizeMixItUp(null).replies && Object.keys(c.normalizeMixItUp(null).replies).length === 0, 'blank replies keep the default text');
ok(c.parseBalance({ balance: 250 }, 'balance') === 250 && c.parseBalance({ balance: '1,250' }, 'balance') === 1250 && c.parseBalance({ coins: 7.9 }, 'coins') === 7, 'balances are read from a number or numeric text');
ok(c.parseBalance({ balance: -1 }, 'balance') === null && c.parseBalance({}, 'balance') === null && c.parseBalance('x', 'balance') === null && c.parseBalance({ balance: 'lots' }, 'balance') === null, 'a missing or bad balance is null');
ok(c.replyApplied(200, null) && c.replyApplied(200, { ok: true }) && !c.replyApplied(200, { success: false }) && !c.replyApplied(200, { applied: 'false' }) && !c.replyApplied(500, {}), 'a reply counts as paid only when 2xx and not false');
ok(c.streamKey(1700000000000) === 's1700000000000' && c.streamKey(null, Date.UTC(2026, 9, 16, 23, 59)) === 'd2026-10-16', 'the window is the stream, else the UTC day');
ok(c.decide({ balance: 200, owed: 200 }) && !c.decide({ balance: 199, owed: 200 }), 'the balance must cover every pull in flight');

// ── A fake Mix It Up ──
const balances: Record<string, number> = { ann: 250, bob: 50, cat: 1000, dan: 1000, eve: 1000, hal: 1000, jon: 1000, kim: 1000 };
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

// ── Price per role (ROADMAP 55.4b) ──
const rp = c.normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', cost: 100, limit: 0, priceByRole: { subscriber: 60, vip: 0, bogus: 5 } });
ok(rp.priceByRole.subscriber === 60 && rp.priceByRole.vip === 0 && !('bogus' in rp.priceByRole), 'role prices are kept, and 0 is a price');
ok(c.normalizeMixItUp({ ...rp, priceByRole_subscriber: '', priceByRole_vip: ' 25 ' }).priceByRole.vip === 25 && !('subscriber' in c.normalizeMixItUp({ ...rp, priceByRole_subscriber: '' }).priceByRole), 'a blank form field clears a role price');
ok(!c.cleanMixItUpInput({ priceByRole_vip: '-1' }).ok && !c.cleanMixItUpInput({ priceByRole_subscriber: '2.5' }).ok && c.cleanMixItUpInput({ priceByRole_subscriber: '' }).ok, 'a role price must be a whole number, 0 or more, or blank');
ok(c.pullPrice(rp, { role: 'regular' }) === 100 && c.pullPrice(rp, { role: 'subscriber' }) === 60 && c.pullPrice(rp, { role: ['subscriber', 'vip'] }) === 0 && c.pullPrice(rp, { role: ['subscriber', 'moderator'] }) === 60 && c.pullPrice({ cost: 100, priceByRole: {} }, { role: 'vip' }) === 100, 'pullPrice: role price, else base, the lower when a viewer has both');
const sub1 = await m.reservePaidPull(rp, 'eve', 'rp1', fake, 'subscriber');
ok(sub1.ok && sub1.price === 60 && sub1.balance === 1000, 'a subscriber is quoted the subscriber price');
const subClaim = await m.claimPaidPull('rp1', 'eve');
ok(subClaim && subClaim.amount === 60, 'the claim carries the stored price');
calls.length = 0;
await m.chargePaidPull(rp, subClaim!, { cardName: 'X', variant: 'Regular', stars: 1, packName: 'B', cardNumber: 1 }, fake);
ok(calls.length === 1 && calls[0].action === 'deduct' && calls[0].amount === 60, 'the subscriber price is what is charged');
// A price change after queueing changes nothing: the reservation holds its own price, and so does a refund.
const sub2 = await m.reservePaidPull(rp, 'eve', 'rp2', fake, 'subscriber');
const claim2 = await m.claimPaidPull('rp2', 'eve');
const repriced = { ...rp, cost: 500, priceByRole: { subscriber: 300 } };
calls.length = 0;
await m.chargePaidPull(repriced, claim2!, { cardName: 'X', variant: 'Regular', stars: 1, packName: 'B', cardNumber: 1 }, fake);
ok(sub2.ok && claim2!.amount === 60 && calls[0].amount === 60, 'a price change after queueing does not change what is charged');
await m.refundPaidPull({ ...repriced, addUrl: 'https://hook.example/add' }, claim2!, 'X', fake);
ok(calls[calls.length - 1].action === 'add' && calls[calls.length - 1].amount === 60, 'a refund pays back the stored price');
// In-flight pulls add their own prices: eve has 1000, subscriber 400, regular 100.
const mixed = { ...rp, priceByRole: { subscriber: 400 } };
ok((await m.reservePaidPull(mixed, 'eve', 'if1', fake, 'subscriber')).ok && (await m.reservePaidPull(mixed, 'eve', 'if2', fake, 'subscriber')).ok && (await m.reservePaidPull(mixed, 'eve', 'if3', fake)).ok, 'two 400 pulls and a 100 pull (900) fit a 1000 balance');
const if4 = await m.reservePaidPull(mixed, 'eve', 'if4', fake, 'subscriber');
ok(!if4.ok && if4.reason === 'insufficient_balance' && /costs 400/.test(if4.message), 'the next one is refused using its own price, and the reply shows it');
for (const id of ['if1', 'if2', 'if3']) await m.releasePaidPull(id);
ok(Number((await kv.get('mixitup:pending:eve')) ?? 0) <= 0, 'releasing returns each pull\'s own price to the in-flight sum');
// A price of 0: no balance check, no deduct, and the pull still counts toward the limit.
const freeVip = { ...rp, roleLimits: { ...rp.roleLimits, vip: 1 }, priceByRole: { vip: 0 } };
calls.length = 0;
const v1 = await m.reservePaidPull(freeVip, 'zed', 'z1', fake, 'vip');
ok(v1.ok && v1.price === 0 && v1.left === 0 && calls.length === 0, 'a price of 0 asks nobody for a balance and counts toward the limit');
const v1c = await m.claimPaidPull('z1', 'zed');
const v1r = await m.chargePaidPull(freeVip, v1c!, { cardName: 'X', variant: 'Regular', stars: 1, packName: 'B', cardNumber: 1 }, fake);
ok(v1r.applied && calls.length === 0, 'a price of 0 sends no deduct');
const v2 = await m.reservePaidPull(freeVip, 'zed', 'z2', fake, 'vip');
ok(!v2.ok && v2.reason === 'limit_reached', 'a free pull still used the viewer\'s limit');
// A reservation stored before role prices has no price and uses the current base price.
await kv.set('mixitup:pay:old1', { username: 'eve', stream: 'x', at: Date.now() });
const old = await m.claimPaidPull('old1', 'eve');
ok(old && old.amount === (await m.getMixItUpSettings()).cost, 'an old reservation without a price uses the current cost');

// ── Happy hour (ROADMAP 55.4c) ──
const hh = await import('../lib/happyhour');
const T = Date.now();
const disc = (percent: number) => ({ kind: 'discount' as const, percent, endsAt: T + 60_000, by: 't' });
ok(c.pullPrice(rp, { role: 'regular', happyHour: disc(25), now: T }) === 75 && c.pullPrice({ cost: 30, priceByRole: {} }, { happyHour: disc(10), now: T }) === 27 && c.pullPrice({ cost: 33, priceByRole: {} }, { happyHour: disc(50), now: T }) === 17 && c.pullPrice({ cost: 1, priceByRole: {} }, { happyHour: disc(99), now: T }) === 1, 'a discount rounds up to a whole number');
ok(c.pullPrice(rp, { role: 'subscriber', happyHour: disc(50), now: T }) === 30 && c.pullPrice(rp, { happyHour: { kind: 'free', endsAt: T + 1, by: 't' }, now: T }) === 0, 'the discount applies after the role price, and free is 0');
ok(c.pullPrice(rp, { happyHour: disc(50), now: T + 60_000 }) === 100 && c.pullPrice(rp, { happyHour: null, now: T }) === 100, 'an expired or missing happy hour charges full price');
ok(!c.cleanHappyHourInput({ minutes: 0, kind: 'free' }).ok && !c.cleanHappyHourInput({ minutes: 241, kind: 'free' }).ok && !c.cleanHappyHourInput({ minutes: 30, kind: 'discount', percent: 100 }).ok && !c.cleanHappyHourInput({ minutes: 30, kind: 'discount' }).ok && !c.cleanHappyHourInput({ minutes: 1.5, kind: 'free' }).ok && c.cleanHappyHourInput({ minutes: '240', kind: 'discount', percent: '99' }).ok, 'the happy hour form is validated');
const hhMix = c.normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', cost: 100, limit: 0 });
ok((await hh.getHappyHour()) === null, 'no happy hour at first');
ok(!(await hh.startHappyHour({ minutes: 0, kind: 'free' }, 'amy')).ok && (await hh.getHappyHour()) === null, 'a bad start changes nothing');
await hh.startHappyHour({ minutes: 30, kind: 'discount', percent: 30 }, 'amy');
const h1 = await m.reservePaidPull(hhMix, 'hal', 'hh1', fake);
ok(h1.ok && h1.price === 70, 'a pull queued in a happy hour is quoted the discounted price');
const refused = await m.reservePaidPull({ ...hhMix, cost: 100 }, 'poor', 'hh0', fake);
ok(!refused.ok && /costs 70/.test(refused.message), 'the reply {cost} shows the happy hour price');
await hh.startHappyHour({ minutes: 30, kind: 'free' }, 'amy'); // replaces the running one
ok((await hh.getHappyHour())?.kind === 'free', 'starting a new happy hour replaces the running one');
calls.length = 0;
const hhLim = { ...hhMix, roleLimits: { ...hhMix.roleLimits, regular: 1 } };
const f1 = await m.reservePaidPull(hhLim, 'ivy', 'hf1', fake);
const f1c = await m.claimPaidPull('hf1', 'ivy');
await m.chargePaidPull(hhLim, f1c!, { cardName: 'X', variant: 'Regular', stars: 1, packName: 'B', cardNumber: 1 }, fake);
ok(f1.ok && f1.price === 0 && f1.left === 0 && calls.length === 0, 'a free happy hour asks for no balance and sends no deduct');
ok(!(await m.reservePaidPull(hhLim, 'ivy', 'hf2', fake)).ok, 'a free pull still counts toward the limit');
// The price stored during the happy hour is still charged after it ends.
await hh.startHappyHour({ minutes: 30, kind: 'discount', percent: 50 }, 'amy');
await m.reservePaidPull(hhMix, 'jon', 'hs1', fake);
await hh.endHappyHour('amy');
ok((await hh.getHappyHour()) === null && (await m.reservePaidPull(hhMix, 'jon', 'hs2', fake)).price === 100, 'ending it puts the full price back');
const hs1 = await m.claimPaidPull('hs1', 'jon');
calls.length = 0;
await m.chargePaidPull(hhMix, hs1!, { cardName: 'X', variant: 'Regular', stars: 1, packName: 'B', cardNumber: 1 }, fake);
ok(hs1!.amount === 50 && calls[0].amount === 50, 'a price stored during the happy hour is still charged after it ends');
// A stored happy hour whose time has passed is off even if the key is still there.
await kv.set('mixitup:happyhour', { kind: 'free', endsAt: Date.now() - 1000, by: 'amy' });
ok((await hh.getHappyHour()) === null && (await m.reservePaidPull(hhMix, 'kim', 'he1', fake)).price === 100, 'an expired happy hour charges full price');
ok(!(await hh.endHappyHour('amy')).wasOn, 'ending an expired one says nothing was running');
await kv.del('mixitup:happyhour');

// ── Cooldown between paid pulls (ROADMAP 55.4d) ──
const { CHANNEL_LOGIN } = await import('../lib/site');
Object.assign(balances, { zed: 1000, yan: 50, [CHANNEL_LOGIN]: 1000 });
const cdMix = c.normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', cost: 100, limit: 0, cooldownSeconds: 30 });
ok(cdMix.cooldownSeconds === 30 && c.normalizeMixItUp({ cooldownSeconds: 99999 }).cooldownSeconds === c.COOLDOWN_MAX && c.normalizeMixItUp({ cooldownSeconds: 'x' }).cooldownSeconds === 0 && d.cooldownSeconds === 0 && !c.cleanMixItUpInput({ cooldownSeconds: '1.5' }).ok, 'the cooldown is a whole number of seconds, 0 to 3600, off by default');
const z1 = await m.reservePaidPull(cdMix, 'zed', 'cd1', fake);
const z2 = await m.reservePaidPull(cdMix, 'zed', 'cd2', fake);
ok(z1.ok && !z2.ok && z2.reason === 'cooldown' && /wait (\d+) seconds/.test(z2.message) && Number(/wait (\d+)/.exec(z2.message)![1]) >= 1 && Number(/wait (\d+)/.exec(z2.message)![1]) <= 30, 'a second pull inside the window is refused with cooldown and the seconds left');
ok(Number(await kv.ttl('mixitup:cd:zed')) > 0 && (await kv.get('mixitup:pay:cd2')) === null, 'the refused pull reserved nothing and left the first cooldown running');
ok(c.refusalMessage('cooldown', { cost: 1, currency: 'x', limit: 0, replies: { cooldown: 'Hold on {username}: {wait}s' } }, 'ann', undefined, 7) === 'Hold on ann: 7s' && c.REPLY_VARS.includes('wait') && c.REFUSAL_LABELS.cooldown && c.REPLY_LABELS.cooldown, 'the cooldown reply is editable and fills {wait}');
// A pull refused for balance starts no cooldown.
const y1 = await m.reservePaidPull(cdMix, 'yan', 'cd3', fake);
ok(!y1.ok && y1.reason === 'insufficient_balance' && (await kv.get('mixitup:cd:yan')) === null, 'a pull refused for balance leaves no cooldown');
balances.yan = 1000;
ok((await m.reservePaidPull(cdMix, 'yan', 'cd4', fake)).ok, 'so the next try goes straight through');
// A refusal for the limit does not start one either, and its own refusal leaves no limit count.
const limCd = c.normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', cost: 100, limit: 1, cooldownSeconds: 30 });
balances.lim = 1000;
ok((await m.reservePaidPull(limCd, 'lim', 'cd5', fake)).ok, 'lim pulls once');
await kv.del('mixitup:cd:lim');
const lim2 = await m.reservePaidPull(limCd, 'lim', 'cd6', fake);
ok(!lim2.ok && lim2.reason === 'limit_reached' && (await kv.get('mixitup:cd:lim')) === null, 'over the limit: refused and no cooldown started');
await m.reservePaidPull(limCd, 'lim', 'cd7', fake).then(r => ok(r.ok === false, 'still over'));
await m.releasePaidPull('cd5');
ok((await kv.get('mixitup:cd:lim')) === null && (await m.reservePaidPull(limCd, 'lim', 'cd8', fake)).ok, 'releasing a reservation also drops its cooldown, and the limit count was not left raised by refusals');
await m.releasePaidPull('cd8');
// Mix It Up down: no cooldown.
mode = 'down';
balances.kay = 1000;
ok(!(await m.reservePaidPull(cdMix, 'kay', 'cd9', fake)).ok && (await kv.get('mixitup:cd:kay')) === null, 'Mix It Up down leaves no cooldown');
mode = 'ok';
// The broadcaster is exempt; 0 = off.
ok((await m.reservePaidPull(cdMix, CHANNEL_LOGIN, 'cd10', fake)).ok && (await m.reservePaidPull(cdMix, CHANNEL_LOGIN, 'cd11', fake)).ok && (await kv.get(`mixitup:cd:${CHANNEL_LOGIN}`)) === null, 'the broadcaster is never held up');
const offMix = c.normalizeMixItUp({ enabled: true, balanceUrl: 'https://hook.example/mix', cost: 100, cooldownSeconds: 0 });
ok((await m.reservePaidPull(offMix, 'zed', 'cd12', fake)).ok && (await m.reservePaidPull(offMix, 'zed', 'cd13', fake)).ok, '0 = off: back-to-back pulls both go through');

// ── Log ──
const log = await m.getMixItUpLog();
ok(log.length > 0 && log.length <= 50 && log.some(e => e.what === 'refused') && log.some(e => e.what === 'deduct' && !e.ok), 'the log keeps the last 50, refusals and failed charges included');

console.log('mixitup checks passed');
