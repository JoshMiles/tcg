// Twitch EventSub in the app (58.2): the pure parts, the client against a fake EventSub WebSocket server and a fake Helix (fake-eventsub.ts) and a
// fake site, and the alert / connection rules for the Twitch part. Nothing here reaches the real Twitch or a real site.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Alerts, DOWN_FOR_MS, snapshotOf } from '../src/alerts';
import { fixPlan, rowFor, testingLine, twitchProblem, type ConnFacts } from '../src/connections';
import { CHAT_SUBSCRIPTION, EventSubClient, SUBSCRIPTIONS, chatLine, chatWord, failureText, keepaliveLimitMs, parseMessage, subscriptionBody, twitchReconnectUrl, type EsStatus } from '../src/eventsub';
import { SiteClient } from '../src/site';
import { attentionItems } from '../src/status';
import { FakeTwitch } from './fake-eventsub';

const waitFor = async (what: string, cond: () => boolean, ms = 5000) => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise(r => setTimeout(r, 10));
  }
};
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

interface FakeSite { status: number; testing: boolean; issued: number; events: { messageId: string; type: string; event: unknown }[]; reports: Record<string, unknown>[]; eventStatus: number; chat: { status: number; on: boolean; commands: string[]; calls: number } }

/** A fake site with the three routes the client uses. Every token it hands out is numbered: tok-1, tok-2 ... */
async function startSite() {
  const site: FakeSite = { status: 200, testing: true, issued: 0, events: [], reports: [], eventStatus: 200, chat: { status: 404, on: false, commands: [], calls: 0 } };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const json = body ? JSON.parse(body) : {};
      const send = (status: number, o: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/api/bridge/twitch-token') {
        if (site.status !== 200) return send(site.status, {});
        return send(200, { accessToken: `tok-${++site.issued}`, expiresAt: Date.now() + 3_600_000, userId: '4242', login: 'spare_account', clientId: 'client-abc', testing: site.testing });
      }
      if (req.url === '/api/bridge/twitch-event') { if (site.eventStatus === 200) site.events.push(json); return send(site.eventStatus, {}); }
      if (req.url === '/api/bridge/chat-commands') { site.chat.calls++; return send(site.chat.status, site.chat.status === 200 ? { commands: site.chat.commands, chat: site.chat.on } : {}); }
      if (req.url === '/api/bridge/report') { site.reports.push(json); return send(200, {}); }
      return send(404, {});
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { site, client: new SiteClient(url, 'pair-token', '0.0.0'), close: () => new Promise<void>(r => server.close(() => r())) };
}

function pureChecks(): void {
  assert.equal(SUBSCRIPTIONS.length, 6, 'the six types of 58.2');
  assert.deepEqual(SUBSCRIPTIONS.map(s => s.type), [
    'channel.channel_points_custom_reward_redemption.add', 'channel.cheer', 'channel.subscription.gift', 'channel.raid', 'stream.online', 'stream.offline',
  ]);
  const raid = SUBSCRIPTIONS.find(s => s.type === 'channel.raid')!;
  assert.deepEqual(subscriptionBody(raid, '77', 'S1'), { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: '77' }, transport: { method: 'websocket', session_id: 'S1' } }, 'a raid is one coming TO the channel');
  assert.deepEqual(subscriptionBody(SUBSCRIPTIONS[1], '77', 'S1').condition, { broadcaster_user_id: '77' });
  assert.deepEqual(subscriptionBody(CHAT_SUBSCRIPTION, '77', 'S1'), { type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: '77', user_id: '77' }, transport: { method: 'websocket', session_id: 'S1' } }, 'the chat subscription listens as the channel');

  const msg = (text: unknown) => ({ message: { text } });
  assert.equal(chatWord(msg('  !PACK  somebody ')), '!pack', 'first word, lowercased, spaces ignored');
  assert.equal(chatWord(msg('!showoff\tx')), '!showoff');
  for (const bad of [msg(''), msg('   '), msg(5), {}, null, undefined, 'x']) assert.equal(chatWord(bad), '', 'no word');
  const on = { state: 'connected' as const, chat: { on: true, commands: 3 }, subs: [{ type: 'channel.chat.message', status: 'enabled' as const }] };
  assert.equal(chatLine(on), 'Chat commands: 3 commands, through TCG Bridge');
  assert.equal(chatLine({ ...on, chat: { on: true, commands: 1 } }), 'Chat commands: 1 command, through TCG Bridge');
  assert.equal(chatLine({ ...on, chat: { on: false, commands: 0 }, subs: [] }), 'Chat commands: reconnect the channel on the site to allow chat');
  assert.equal(chatLine({ ...on, subs: [] }), '', 'allowed but not subscribed (failed): the subscription list says so');
  assert.equal(chatLine({ ...on, chat: null }), '');
  assert.equal(chatLine({ ...on, state: 'reconnecting' }), '');
  assert.equal(chatLine(null), '');

  assert.deepEqual(parseMessage(JSON.stringify({ metadata: { message_id: 'm1', message_type: 'session_keepalive' }, payload: {} })), { type: 'session_keepalive', id: 'm1', payload: {} });
  for (const bad of ['not json', '{}', '[]', 'null', JSON.stringify({ metadata: { message_id: 1, message_type: 'x' } }), JSON.stringify({ metadata: { message_type: 'x' } })]) assert.equal(parseMessage(bad), null, `not a message: ${bad}`);
  assert.deepEqual(parseMessage(JSON.stringify({ metadata: { message_id: 'm', message_type: 't' }, payload: 5 }))?.payload, {}, 'a payload that is not an object becomes empty');

  assert.equal(keepaliveLimitMs(10, 10), 20_000, 'timeout plus margin');
  assert.equal(keepaliveLimitMs(undefined, 10), 20_000, 'no timeout given: Twitch default of 10 s');
  assert.equal(keepaliveLimitMs(0, 5), 15_000);
  assert.equal(keepaliveLimitMs('x', 0), 10_000);

  assert.match(failureText(401), /token/);
  assert.match(failureText(403), /connect the channel again/);
  assert.match(failureText(429), /limiting/);
  assert.equal(failureText(500), 'Twitch answered 500');

  assert.equal(twitchReconnectUrl('wss://eventsub.wss.twitch.tv/ws?challenge=1'), 'wss://eventsub.wss.twitch.tv/ws?challenge=1');
  assert.equal(twitchReconnectUrl('wss://eventsub.wss.twitch.tv?challenge=1'), 'wss://eventsub.wss.twitch.tv/?challenge=1');
  for (const bad of ['ws://eventsub.wss.twitch.tv/ws', 'wss://eventsub.wss.twitch.tv:8443/ws', 'wss://twitch.tv/x', 'wss://evil.example/ws', 'wss://eventsub.wss.twitch.tv.evil.example/ws', 'wss://user@evil.example/ws', 'nope', '']) assert.equal(twitchReconnectUrl(bad), null, `refused: ${bad}`);
}

/** Short timers so a whole session takes well under a second. */
const FAST = { keepaliveMarginS: 0, recheckMs: 60, refreshLeadMs: 120_000, backoffMs: { min: 20, max: 80 }, reportMs: 60_000, retryMs: 20 };

async function withClient(fake: FakeTwitch, { prep, ...opts }: Partial<ConstructorParameters<typeof EventSubClient>[1]> & { prep?: (site: FakeSite) => void }, run: (c: { es: EventSubClient; site: FakeSite; log: string[] }) => Promise<void>): Promise<void> {
  const s = await startSite();
  prep?.(s.site);
  const log: string[] = [];
  const secrets: string[] = [];
  const es = new EventSubClient(s.client, { ...FAST, wsUrl: fake.wsUrl, helixUrl: fake.helixUrl, reconnectTo: () => `${fake.wsUrl}?reconnected=1`, log: l => log.push(l), secret: t => secrets.push(t), ...opts });
  try {
    es.start();
    await run({ es, site: s.site, log });
  } finally {
    await es.stop();
    await s.close();
  }
  assert.ok(secrets.length > 0 && secrets.every(t => t.startsWith('tok-')), 'the tokens were handed to the log redaction');
  for (const t of secrets) assert.ok(!log.some(l => l.includes(t)), 'a token never appears in the log');
}

async function clientChecks(): Promise<void> {
  // 1. Welcome, the six subscriptions with the session id and the headers, the report, and a notification with its message id.
  {
    const fake = new FakeTwitch();
    await fake.listen();
    await withClient(fake, {}, async ({ es, site }) => {
      await waitFor('connected with six subscriptions', () => es.state.state === 'connected' && es.state.subs.length === 6);
      assert.deepEqual(es.state.subs.map(s => s.status), Array(6).fill('enabled'));
      assert.equal(es.state.login, 'spare_account');
      assert.equal(es.state.testing, true, 'the site says it is a test account');
      assert.equal(es.state.why, '');
      assert.equal(fake.calls.length, 6, 'one POST per type');
      assert.deepEqual(fake.calls.map(c => c.body.type).sort(), SUBSCRIPTIONS.map(s => s.type).sort());
      for (const c of fake.calls) {
        assert.equal(c.body.transport.session_id, fake.sessionId, 'created with the session id from the welcome');
        assert.equal(c.body.transport.method, 'websocket');
        assert.equal(c.clientId, 'client-abc');
        assert.equal(c.token, 'tok-1');
        if (c.body.type === 'channel.raid') assert.deepEqual(c.body.condition, { to_broadcaster_user_id: '4242' }); else assert.deepEqual(c.body.condition, { broadcaster_user_id: '4242' });
      }
      await waitFor('a connected report', () => site.reports.some(r => r.state === 'connected' && Array.isArray(r.subs) && r.subs.length === 6));
      const rep = site.reports.find(r => r.state === 'connected' && Array.isArray(r.subs) && r.subs.length === 6)!;
      assert.equal(rep.type, 'twitch');
      assert.equal(rep.login, 'spare_account');
      assert.equal(rep.testing, true);
      assert.equal(JSON.stringify(rep).includes('tok-'), false, 'no token in a report');

      fake.notify('channel.cheer', { bits: 100, user_name: 'Someone' }, 'msg-cheer-1');
      await waitFor('the notification at the site', () => site.events.length === 1);
      assert.deepEqual(site.events[0], { messageId: 'msg-cheer-1', type: 'channel.cheer', event: { bits: 100, user_name: 'Someone' } });
      assert.ok(es.state.lastEventAt !== null, 'last event time is kept');
      fake.notify('channel.cheer', { bits: 100 }, 'msg-cheer-1'); // Twitch can repeat a message: the app hands it over once
      fake.notify('stream.online', { type: 'live' }, 'msg-online');
      await waitFor('the second event', () => site.events.length === 2);
      assert.deepEqual(site.events.map(e => e.messageId), ['msg-cheer-1', 'msg-online'], 'in order, the repeat dropped');
      assert.equal(fake.calls.length, 6, 'no new subscriptions without a new session');
    });
    await fake.close();
  }

  // 2. A Helix 401 renews the token (a new call to the site) and the subscriptions are created with the new one.
  {
    const fake = new FakeTwitch();
    fake.rejectTokens.add('tok-1');
    await fake.listen();
    await withClient(fake, {}, async ({ es, site }) => {
      await waitFor('six subscriptions after the renewal', () => es.state.subs.length === 6);
      assert.deepEqual(es.state.subs.map(s => s.status), Array(6).fill('enabled'), 'all on after the retry');
      assert.ok(site.issued >= 2, 'the site was asked for a fresh token');
      const good = fake.calls.filter(c => c.status === 202);
      assert.equal(good.length, 6);
      assert.ok(good.every(c => c.token !== 'tok-1'), 'the rejected token is not used again');
      assert.ok(fake.calls.some(c => c.status === 401 && c.token === 'tok-1'));
      assert.equal(es.state.why, '');
    });
    await fake.close();
  }

  // 3. A refused subscription is shown (state connected, why subs) and a 409 "already exists" is retried.
  {
    const fake = new FakeTwitch();
    fake.statusFor['channel.raid'] = 403;
    await fake.listen();
    await withClient(fake, {}, async ({ es, site }) => {
      await waitFor('the subscriptions answered', () => es.state.subs.length === 6);
      assert.equal(es.state.state, 'connected');
      assert.equal(es.state.why, 'subs');
      const raid = es.state.subs.find(s => s.type === 'channel.raid')!;
      assert.equal(raid.status, 'failed');
      assert.match(raid.error ?? '', /connect the channel again/);
      assert.match(es.state.reason, /1 of 6 subscriptions failed/);
      assert.match(twitchProblem(es.state), /1 of 6/, 'the pill hears about it');
      await waitFor('the report with a failed one', () => site.reports.some(r => Array.isArray(r.subs) && (r.subs as { status: string }[]).some(s => s.status === 'failed')));
    });
    await fake.close();
    const again = new FakeTwitch();
    again.statusFor['channel.cheer'] = 409;
    await again.listen();
    await withClient(again, {}, async ({ es }) => {
      await waitFor('the retries to end', () => es.state.subs.length === 6);
      assert.equal(es.state.subs.find(s => s.type === 'channel.cheer')!.status, 'failed');
      assert.equal(again.calls.filter(c => c.body.type === 'channel.cheer').length, 3, 'a 409 is tried three times in all');
    });
    await again.close();
  }

  // 4. Keepalives keep the connection; silence past the timeout reconnects with a new session and new subscriptions.
  {
    const fake = new FakeTwitch();
    fake.keepaliveSec = 1;
    fake.keepaliveEvery = 250;
    await fake.listen();
    await withClient(fake, {}, async ({ es }) => {
      await waitFor('connected', () => es.state.subs.length === 6);
      await pause(1600); // longer than the 1 s limit: only the keepalives hold it
      assert.equal(fake.connections, 1, 'keepalives hold the connection');
      assert.equal(es.state.state, 'connected');
    });
    await fake.close();

    const quiet = new FakeTwitch();
    quiet.keepaliveSec = 1; // and it never sends one
    await quiet.listen();
    await withClient(quiet, {}, async ({ es, log }) => {
      await waitFor('connected', () => es.state.subs.length === 6);
      await waitFor('a second connection after the silence', () => quiet.connections >= 2, 6000);
      assert.ok(log.some(l => l.includes('no message in time')), 'the silence was noticed');
      await waitFor('subscriptions again on the new session', () => quiet.calls.length >= 12);
      assert.ok(quiet.calls.slice(6, 12).every(c => c.body.transport.session_id === quiet.sessionId));
    });
    await quiet.close();
  }

  // 5. session_reconnect: the old connection stays until the new one says welcome, nothing is lost in between, and no subscriptions are made again.
  {
    const fake = new FakeTwitch();
    fake.holdReconnectWelcome = true;
    await fake.listen();
    await withClient(fake, {}, async ({ es, site }) => {
      await waitFor('first session', () => es.state.subs.length === 6);
      fake.reconnect();
      await waitFor('the second connection', () => fake.connections === 2);
      assert.equal(fake.open, 2, 'both are open while the new one has not said welcome');
      fake.notify('channel.raid', { from_broadcaster_user_login: 'raider' }, 'msg-old-socket', 'oldest');
      await waitFor('an event on the old connection', () => site.events.length === 1);
      assert.equal(es.state.state, 'connected', 'still connected during the switch');
      fake.releaseWelcome();
      await waitFor('the old connection closed', () => fake.open === 1);
      fake.notify('channel.cheer', { bits: 1 }, 'msg-new-socket', 'newest');
      await waitFor('an event on the new connection', () => site.events.length === 2);
      assert.deepEqual(site.events.map(e => e.messageId), ['msg-old-socket', 'msg-new-socket']);
      assert.equal(fake.calls.length, 6, 'no duplicate subscriptions: they moved with the session');
      assert.equal(es.state.state, 'connected');
      assert.equal(es.state.why, '');
    });
    await fake.close();

    // A reconnect address the app does not trust is not followed: it starts over instead.
    const strict = new FakeTwitch();
    await strict.listen();
    await withClient(strict, { reconnectTo: twitchReconnectUrl }, async ({ es, log }) => {
      await waitFor('first session', () => es.state.subs.length === 6);
      strict.reconnect('ws://127.0.0.1:1/evil');
      await waitFor('a fresh connection', () => strict.connections >= 2);
      assert.ok(log.some(l => l.includes('refused a reconnect address')));
    });
    await strict.close();
  }

  // 6. A revocation marks that one subscription and says so.
  {
    const fake = new FakeTwitch();
    await fake.listen();
    await withClient(fake, {}, async ({ es, site }) => {
      await waitFor('subscriptions', () => es.state.subs.length === 6);
      fake.revoke('channel.cheer', 'authorization_revoked');
      await waitFor('the revocation', () => es.state.why === 'subs');
      assert.equal(es.state.subs.find(s => s.type === 'channel.cheer')!.status, 'revoked');
      assert.equal(es.state.subs.filter(s => s.status === 'enabled').length, 5);
      assert.match(es.state.reason, /channel\.cheer/);
      assert.equal(es.state.state, 'connected', 'the rest still work');
      await waitFor('the report', () => site.reports.some(r => (r.subs as { type: string; status: string }[] | undefined)?.some(s => s.type === 'channel.cheer' && s.status === 'revoked')));
    });
    await fake.close();
  }

  // 7. What the site says about the channel: 404 quiet, 403 not allowed, 409 ended; a channel connected later is picked up; one ended later closes the socket.
  {
    const fake = new FakeTwitch();
    await fake.listen();
    await withClient(fake, {}, async ({ es, site }) => {
      site.status = 404;
      await waitFor('off, nothing connected', () => es.state.state === 'off' && es.state.why === 'none');
      assert.equal(fake.connections, 0, 'no socket without a channel');
      assert.equal(site.reports.length, 0, 'a PC that never listened says nothing');
      assert.equal(twitchProblem(es.state), '', 'quiet');
      assert.equal(rowFor('twitch', facts(es.state)).tone, 'off');

      site.status = 403;
      await waitFor('not allowed', () => es.state.why === 'forbidden');
      assert.equal(rowFor('twitch', facts(es.state)).line, 'Not allowed on this PC');
      assert.equal(twitchProblem(es.state), '', 'not allowed stays out of the pill');

      site.status = 409;
      await waitFor('ended', () => es.state.why === 'ended');
      assert.match(es.state.reason, /Connect the channel again on the site/);
      assert.equal(rowFor('twitch', facts(es.state)).tone, 'bad');
      assert.ok(twitchProblem(es.state).length > 0);

      site.status = 500;
      await waitFor('site trouble', () => es.state.why === 'site');

      site.status = 200;
      await waitFor('connected once a channel is there', () => es.state.state === 'connected' && es.state.subs.length === 6, 6000);
      assert.equal(fake.connections, 1);

      site.status = 409; // Twitch ended it while we listen: the next check hangs up
      await waitFor('off after the channel ended', () => es.state.state === 'off' && es.state.why === 'ended', 6000);
      await waitFor('the socket closed', () => fake.open === 0);
      await waitFor('an off report', () => site.reports.some(r => r.state === 'off'));
    });
    await fake.close();
  }

  // 8. The site refuses or fails an event: it is not retried forever, and later events still go.
  {
    const fake = new FakeTwitch();
    await fake.listen();
    await withClient(fake, {}, async ({ es, site, log }) => {
      await waitFor('subscriptions', () => es.state.subs.length === 6);
      site.eventStatus = 400;
      fake.notify('channel.cheer', { bits: 1 }, 'msg-refused');
      await waitFor('the refusal in the log', () => log.some(l => l.includes('the site refused channel.cheer')));
      site.eventStatus = 500;
      fake.notify('channel.cheer', { bits: 2 }, 'msg-failing');
      await waitFor('given up after three tries', () => log.some(l => l.includes('could not give channel.cheer')));
      site.eventStatus = 200;
      fake.notify('channel.cheer', { bits: 3 }, 'msg-fine');
      await waitFor('a later event goes through', () => site.events.some(e => e.messageId === 'msg-fine'));
      assert.deepEqual(site.events.map(e => e.messageId), ['msg-fine']);
    });
    await fake.close();
  }

  // 9. Twitch dropping the connection: reconnecting, then connected again with new subscriptions.
  {
    const fake = new FakeTwitch();
    await fake.listen();
    await withClient(fake, {}, async ({ es }) => {
      await waitFor('subscriptions', () => es.state.subs.length === 6);
      fake.dropAll();
      await waitFor('reconnecting or connected again', () => fake.connections >= 2);
      await waitFor('connected again', () => es.state.state === 'connected' && fake.calls.length >= 12);
    });
    await fake.close();
  }

  await chatChecks();
}

const chatEvent = (text: string) => ({ chatter_user_login: 'viewer', chatter_user_id: '9', message: { text }, badges: [] });
const chatCalls = (fake: FakeTwitch) => fake.calls.filter(c => c.body.type === 'channel.chat.message');
const chatSent = (site: FakeSite) => site.events.filter(e => e.type === 'channel.chat.message');

/** Chat commands through the app (58.6b): the subscription only with chat on, the filter, and the list refresh. */
async function chatChecks(): Promise<void> {
  // 1. chat: true. Seven subscriptions, the chat one with the channel as listener; only known commands go on, any case; other chat is dropped and never logged.
  {
    const fake = new FakeTwitch();
    await fake.listen();
    await withClient(fake, { prep: s => { s.chat = { status: 200, on: true, commands: ['!pack', '!showoff'], calls: 0 }; } }, async ({ es, site, log }) => {
      await waitFor('seven subscriptions', () => es.state.subs.length === 7);
      assert.deepEqual(es.state.subs.map(s => s.status), Array(7).fill('enabled'));
      assert.equal(es.state.why, '');
      assert.deepEqual(es.state.chat, { on: true, commands: 2 });
      const c = chatCalls(fake);
      assert.equal(c.length, 1);
      assert.deepEqual([c[0].body.version, c[0].body.condition], ['1', { broadcaster_user_id: '4242', user_id: '4242' }]);
      assert.equal(chatLine(es.state), 'Chat commands: 2 commands, through TCG Bridge');

      fake.notify('channel.chat.message', chatEvent('!PACK  Some Name'), 'chat-1');
      fake.notify('channel.chat.message', chatEvent('hello there stream secret-words'), 'chat-2');
      fake.notify('channel.chat.message', chatEvent('!unknown thing'), 'chat-3');
      fake.notify('channel.chat.message', chatEvent('   '), 'chat-4');
      fake.notify('channel.chat.message', { message: {} }, 'chat-5');
      fake.notify('channel.chat.message', chatEvent('!showoff'), 'chat-6');
      fake.notify('channel.cheer', { bits: 5 }, 'cheer-after'); // a marker: it comes after the chat messages, in order
      await waitFor('the marker', () => site.events.some(e => e.messageId === 'cheer-after'));
      assert.deepEqual(site.events.map(e => e.messageId), ['chat-1', 'chat-6', 'cheer-after'], 'only the two commands, in order');
      assert.deepEqual(site.events[0], { messageId: 'chat-1', type: 'channel.chat.message', event: chatEvent('!PACK  Some Name') }, 'the event goes on unchanged');
      assert.ok(log.some(l => l.includes('command !pack') && l.includes('chat-1')), 'the command word and message id are logged');
      assert.ok(!log.some(l => l.includes('secret-words') || l.includes('Some Name') || l.includes('hello there')), 'no chat text in the log');
    });
    await fake.close();
  }

  // 2. The list refreshes, keeps the old list when a fetch fails, and chat going off hangs up and does not subscribe again.
  {
    const fake = new FakeTwitch();
    await fake.listen();
    await withClient(fake, { chatMs: 40, prep: s => { s.chat = { status: 200, on: true, commands: ['!pack'], calls: 0 }; } }, async ({ es, site, log }) => {
      await waitFor('seven subscriptions', () => es.state.subs.length === 7);
      fake.notify('channel.chat.message', chatEvent('!hello'), 'late-1');
      fake.notify('channel.cheer', { bits: 1 }, 'm-1');
      await waitFor('the marker', () => site.events.some(e => e.messageId === 'm-1'));
      assert.equal(chatSent(site).length, 0, '!hello is not known yet');

      site.chat.commands = ['!pack', '!hello'];
      await waitFor('the new list', () => es.state.chat?.commands === 2);
      fake.notify('channel.chat.message', chatEvent('!Hello'), 'late-2');
      await waitFor('the new command goes on', () => chatSent(site).some(e => e.messageId === 'late-2'));

      site.chat.status = 500; // a failing fetch keeps the last good list
      const before = site.chat.calls;
      await waitFor('failed fetches', () => site.chat.calls >= before + 2);
      assert.ok(log.some(l => l.includes('keeping the last one')));
      assert.equal(es.state.chat?.commands, 2);
      fake.notify('channel.chat.message', chatEvent('!pack x'), 'kept-1');
      await waitFor('still forwarded', () => chatSent(site).some(e => e.messageId === 'kept-1'));
      assert.equal(fake.connections, 1, 'no reconnect for a failed fetch');

      site.chat.status = 403; // the site now says chat is off: hang up, subscribe again without chat
      await waitFor('a new session', () => fake.connections >= 2);
      await waitFor('six subscriptions', () => es.state.state === 'connected' && es.state.subs.length === 6);
      assert.equal(chatCalls(fake).length, 1, 'no chat subscription in the new session');
      assert.deepEqual(es.state.chat, { on: false, commands: 0 });
      assert.match(chatLine(es.state), /reconnect the channel on the site/);
      fake.notify('channel.chat.message', chatEvent('!pack y'), 'off-1'); // even if Twitch still sent one
      fake.notify('channel.cheer', { bits: 2 }, 'm-2');
      await waitFor('the marker', () => site.events.some(e => e.messageId === 'm-2'));
      assert.ok(!site.events.some(e => e.messageId === 'off-1'), 'chat off: nothing forwarded');
    });
    await fake.close();
  }

  // 3. chat: false. No chat subscription and nothing reported as failed; the six others work. Then chat turns on: a new session subscribes to chat.
  {
    const fake = new FakeTwitch();
    await fake.listen();
    await withClient(fake, { chatMs: 40, prep: s => { s.chat = { status: 200, on: false, commands: ['!pack'], calls: 0 }; } }, async ({ es, site }) => {
      await waitFor('six subscriptions', () => es.state.subs.length === 6);
      assert.equal(chatCalls(fake).length, 0, 'no chat subscription');
      assert.equal(es.state.why, '', 'not a failure');
      assert.deepEqual(es.state.subs.map(s => s.status), Array(6).fill('enabled'));
      assert.match(chatLine(es.state), /reconnect the channel on the site/);
      fake.notify('channel.chat.message', chatEvent('!pack z'), 'nochat-1');
      fake.notify('channel.cheer', { bits: 3 }, 'cheer-ok');
      await waitFor('the other types still go', () => site.events.some(e => e.messageId === 'cheer-ok'));
      assert.ok(!site.events.some(e => e.messageId === 'nochat-1'));

      site.chat.on = true; // the streamer reconnected the channel on the site
      await waitFor('a new session with chat', () => fake.connections >= 2 && es.state.subs.length === 7 && es.state.subs.every(s => s.status === 'enabled'));
      assert.equal(chatCalls(fake).length, 1);
      fake.notify('channel.chat.message', chatEvent('!pack z'), 'chat-ok');
      await waitFor('now forwarded', () => chatSent(site).some(e => e.messageId === 'chat-ok'));
    });
    await fake.close();
  }

  // 4. A site that cannot give the list at first: no chat subscription, the others work; the first good answer with chat on brings the chat session.
  {
    const fake = new FakeTwitch();
    await fake.listen();
    await withClient(fake, { chatMs: 40, prep: s => { s.chat.status = 500; } }, async ({ es, site }) => {
      await waitFor('six subscriptions', () => es.state.subs.length === 6);
      assert.equal(es.state.chat ?? null, null, 'no answer yet');
      assert.equal(chatLine(es.state), '', 'no line while unknown');
      site.chat.status = 200; site.chat.on = true; site.chat.commands = ['!pack'];
      await waitFor('chat subscribed', () => es.state.subs.length === 7);
    });
    await fake.close();
  }
}

const base: ConnFacts = { paired: true, pairedAs: 'Josh', site: 'connected', siteError: '', mixFound: true, obsEnabled: true, obsConnected: true, obsStreaming: false, obsError: '', deckInstalled: true, deckOn: true, deckConnected: true, deckError: '', deckSeen: true };
const facts = (t: EsStatus): ConnFacts => ({ ...base, twitch: t });
const status = (o: Partial<EsStatus> = {}): EsStatus => ({ state: 'connected', why: '', reason: '', login: 'spare_account', testing: false, subs: [], lastEventAt: null, since: 1, ...o });

function ruleChecks(): void {
  // Rows: the testing flag, the quiet states, the problem states.
  assert.equal(testingLine('spare_account'), 'Testing on spare_account, not the live channel');
  const live = rowFor('twitch', facts(status({ login: 'joshtcg' })));
  assert.deepEqual([live.tone, live.line, live.sentence], ['ok', 'Listening as joshtcg', 'Listening to Twitch events for joshtcg']);
  const test = rowFor('twitch', facts(status({ testing: true })));
  assert.deepEqual([test.tone, test.line, test.sentence], ['ok', 'Listening as spare_account (testing)', 'Testing on spare_account, not the live channel']);
  assert.deepEqual([rowFor('twitch', base).tone, rowFor('twitch', base).line], ['off', 'No channel connected'], 'no data = quiet');
  assert.equal(rowFor('twitch', facts(status({ state: 'connecting', why: '' }))).tone, 'warn');
  assert.equal(rowFor('twitch', facts(status({ state: 'reconnecting' }))).tone, 'warn');
  const subs = status({ why: 'subs', reason: '1 of 6 subscriptions failed', subs: [{ type: 'channel.cheer', status: 'revoked' }, { type: 'stream.online', status: 'enabled' }] });
  assert.equal(rowFor('twitch', facts(subs)).tone, 'warn');
  assert.match(rowFor('twitch', facts(subs)).line, /1 subscription/);

  // Fix steps: none when fine, numbered steps when it needs the streamer, and none for a quiet "no channel".
  assert.deepEqual(fixPlan('twitch', facts(status())).steps, []);
  assert.deepEqual(fixPlan('twitch', base).steps, []);
  assert.deepEqual(fixPlan('twitch', facts(status({ state: 'off', why: 'none' }))).steps, []);
  for (const t of [status({ state: 'off', why: 'ended', reason: 'Twitch ended the channel connection.' }), status({ state: 'off', why: 'site' }), status({ state: 'off', why: 'forbidden' }), subs])
    assert.ok(fixPlan('twitch', facts(t)).steps.length >= 1, `${t.why}: has steps`);

  // The status pill: an item only for a real problem, and only while the site link is up.
  const items = (t: EsStatus) => attentionItems({ ...attFacts(), twitchProblem: twitchProblem(t) }).map(i => i.id);
  assert.ok(items(status({ state: 'off', why: 'ended', reason: 'Twitch ended it' })).includes('twitch'));
  assert.ok(items(subs).includes('twitch'));
  assert.ok(!items(status()).includes('twitch'), 'listening: no item');
  assert.ok(!items(status({ state: 'off', why: 'none' })).includes('twitch'), 'nothing connected: no item');
  assert.ok(!items(status({ state: 'off', why: 'forbidden' })).includes('twitch'), 'not allowed: no item');
  assert.ok(!items(status({ state: 'reconnecting' })).includes('twitch'), 'a moment of reconnecting: no item');

  // Alerts: the same rules as the other parts (15 s down, only while live, a "back" notice, repeat limit).
  const snap = (twitch: boolean | null, extra: Partial<Parameters<Alerts['update']>[0]> = {}) => ({ site: true, mix: true, obs: true, streaming: true, twitch, ...extra });
  const a = new Alerts();
  let t0 = 1_000_000;
  assert.deepEqual(a.update(snap(true), t0), []);
  assert.deepEqual(a.update(snap(false), t0 += 1000), [], 'a blip is not an alert');
  assert.deepEqual(a.update(snap(false), t0 + DOWN_FOR_MS - 2000), []);
  const drop = a.update(snap(false), t0 + DOWN_FOR_MS + 1);
  assert.deepEqual(drop.map(n => [n.part, n.kind, n.title]), [['twitch', 'drop', 'TCG Bridge lost Twitch events']], 'down 15 s while live: one alert');
  assert.deepEqual(a.update(snap(false), t0 + DOWN_FOR_MS + 5000), [], 'once');
  const back = a.update(snap(true), t0 + DOWN_FOR_MS + 6000);
  assert.deepEqual(back.map(n => [n.part, n.kind, n.title]), [['twitch', 'back', 'The Twitch event link is back']]);

  const idle = new Alerts(); // not live: no drop alert
  idle.update(snap(true, { streaming: false }), 0);
  idle.update(snap(false, { streaming: false }), 1000);
  assert.deepEqual(idle.update(snap(false, { streaming: false }), 60_000), [], 'not streaming: no alert');
  const none = new Alerts(); // nothing connected on the site: never tracked
  for (let i = 0; i < 5; i++) assert.deepEqual(none.update(snap(null), i * 60_000), []);
  const noObs = new Alerts(); // without OBS every drop counts
  noObs.update(snap(true, { obs: null, streaming: null }), 0);
  noObs.update(snap(false, { obs: null, streaming: null }), 1000);
  assert.equal(noObs.update(snap(false, { obs: null, streaming: null }), 20_000)[0]?.part, 'twitch');

  // snapshotOf: quiet states are untracked, listening is up, everything else is down.
  const of = (t: EsStatus) => snapshotOf({ site: 'connected', mix: { found: true }, obs: { enabled: true, connected: true, streaming: true }, twitch: t } as unknown as Parameters<typeof snapshotOf>[0]).twitch;
  assert.equal(of(status({ state: 'off', why: 'none' })), null);
  assert.equal(of(status({ state: 'off', why: 'forbidden' })), null);
  assert.equal(of(status()), true);
  assert.equal(of(status({ state: 'reconnecting' })), false);
  assert.equal(of(status({ state: 'off', why: 'ended' })), false);
  assert.equal(of(status({ state: 'off', why: 'site' })), false);
}

function attFacts(): Parameters<typeof attentionItems>[0] {
  // The healthy facts the other pill checks use; the Twitch part is the only thing that varies here.
  return { paired: true, updateVersion: '', startNote: '', site: 'connected', mixFound: true, obsEnabled: true, obsConnected: true, deckReason: '', twitchProblem: '' };
}

export async function eventSubChecks(): Promise<void> {
  pureChecks();
  ruleChecks();
  await clientChecks();
}
