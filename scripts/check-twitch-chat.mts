// Chat commands through TCG Bridge (ROADMAP 58.6a), the site half: a forwarded chat message runs `!pack <name>` and a Commands tab command end to end and the
// reply goes to a fake Helix; badges map to roles; a repeated message id runs once; an unknown first word is ignored; the Mix It Up chat webhooks answer
// from_twitch only while Twitch delivers chat (live channel, fresh connected report, chat subscription) and work with a test account or a stale report;
// reply rate limits (1 a second, 20 in 30 seconds); the bot account (reply as bot, fallback to the channel account with a staff notice); the command-list
// route's guard; the bot OAuth state check and the refusal of the channel's own account. Mock KV (node scripts/mock-kv.cjs) and a faked Twitch and Helix:
// no real Twitch. Run: npx tsx scripts/check-twitch-chat.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
process.env.SESSION_SECRET = 'a-test-secret-that-is-long-enough-123';
process.env.TWITCH_CLIENT_ID = 'test-client'; process.env.TWITCH_CLIENT_SECRET = 'test-secret';
process.env.BACKUP_ENCRYPTION_KEY = 'a-backup-key-that-is-long-enough';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const realFetch = globalThis.fetch;
let twitchUser = { id: '4242', login: 'SpareAccount' };
let grant: string[] = [];
let nextRefresh = 'REFRESH-CHANNEL';
let botRejected = false; // the bot's refresh token is refused by Twitch
let botSendFails = false; // Helix refuses a send made with the bot's token
const sent: { sender: string; broadcaster: string; message: string; parent: string; auth: string }[] = [];
const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = String(input instanceof Request ? input.url : input);
  if (u.startsWith(url)) return realFetch(input, init);
  if (u.endsWith('/oauth2/token')) {
    const body = new URLSearchParams(String(init?.body ?? ''));
    if (body.get('grant_type') === 'refresh_token') {
      const t = body.get('refresh_token') ?? '';
      if (t === 'REFRESH-BOT' && botRejected) return new Response('{}', { status: 400 });
      return new Response(JSON.stringify({ access_token: t === 'REFRESH-BOT' ? 'ACCESS-BOT' : 'ACCESS-CHANNEL', refresh_token: t, expires_in: 14000, scope: grant }), { status: 200 });
    }
    return new Response(JSON.stringify({ access_token: 'ACCESS-NEW', refresh_token: nextRefresh, expires_in: 14000, scope: grant }), { status: 200 });
  }
  if (u.endsWith('/oauth2/revoke')) return new Response('', { status: 200 });
  if (u.endsWith('/helix/users')) return new Response(JSON.stringify({ data: [twitchUser] }), { status: 200 });
  if (u.endsWith('/helix/chat/messages')) {
    const auth = new Headers(init?.headers).get('Authorization') ?? '';
    if (botSendFails && auth === 'Bearer ACCESS-BOT') return new Response('{}', { status: 400 });
    const b = JSON.parse(String(init?.body));
    sent.push({ sender: b.sender_id, broadcaster: b.broadcaster_id, message: b.message, parent: b.reply_parent_message_id, auth });
    return new Response(JSON.stringify({ data: [{ message_id: 'x', is_sent: true }] }), { status: 200 });
  }
  return new Response('{}', { status: 200 });
}) as typeof fetch;
globalThis.fetch = fake;

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const mix = await import('../lib/mixitup');
const ch = await import('../lib/twitch-channel');
const bot = await import('../lib/twitch-bot');
const ev = await import('../lib/twitch-events');
const evCore = await import('../lib/twitch-events-core');
const chat = await import('../lib/twitch-chat');
const chatCore = await import('../lib/twitch-chat-core');
const coreChannel = await import('../lib/twitch-channel-core');
const cmds = await import('../lib/commands');
const b = await import('../lib/bridge');
const { hashToken } = await import('../lib/bridge-core');
const { getWebhookSettings } = await import('../lib/webhooks');
const { CHANNEL_LOGIN } = await import('../lib/site');
const { POST: pullRoute } = await import('../app/api/webhooks/pull/route');
const { POST: showRoute } = await import('../app/api/webhooks/show-card/route');
const { POST: commandRoute } = await import('../app/api/webhooks/command/route');
const listRoute = await import('../app/api/bridge/chat-commands/route');

const SCOPES_ALL = [...coreChannel.CHANNEL_SCOPES];
const SCOPES_OLD = ['channel:read:redemptions', 'bits:read', 'channel:read:subscriptions'];

// ── Pure: badges, shapes, words ──
const bd = (...ids: string[]) => ids.map(set_id => ({ set_id, id: '1', info: '' }));
ok(chatCore.badgeRole(bd('broadcaster', 'subscriber')) === 'broadcaster', 'broadcaster wins');
ok(chatCore.badgeRole(bd('subscriber', 'moderator')) === 'moderator', 'moderator beats subscriber');
ok(chatCore.badgeRole(bd('vip', 'subscriber')) === 'vip', 'vip beats subscriber');
ok(chatCore.badgeRole(bd('subscriber')) === 'subscriber' && chatCore.badgeRole(bd('founder')) === 'subscriber', 'subscriber (a founder too)');
ok(chatCore.badgeRole(bd('premium', 'turbo')) === 'regular' && chatCore.badgeRole([]) === 'regular' && chatCore.badgeRole(undefined) === 'regular' && chatCore.badgeRole('x') === 'regular', 'anything else is regular');
const msg = (id: string, text: string, badges: unknown[] = [], login = 'viewer_a', extra: Record<string, unknown> = {}) =>
  ({ broadcaster_user_id: '4242', message_id: id, chatter_user_login: login, chatter_user_id: '77', message: { text }, badges, ...extra });
ok(chatCore.cleanChatEvent(msg('msg-0000001', '!pack Base', bd('vip')))?.role === 'vip', 'the clean message carries the role from the badges');
ok(chatCore.cleanChatEvent(msg('x', '!pack')) === null && chatCore.cleanChatEvent(msg('msg-0000001', 'a'.repeat(501))) === null, 'a bad id or a text over 500 is refused');
ok(chatCore.cleanChatEvent({ ...msg('msg-0000001', '!pack'), chatter_user_login: 'Bad Name!' }) === null, 'a bad login is refused');
ok(chatCore.splitCommand('  !PACK  Jungle Deluxe ')?.word === '!pack' && chatCore.splitCommand('!pack Jungle Deluxe')?.rest === 'Jungle Deluxe', 'the first word is lowercased, the rest kept');
ok(chatCore.splitCommand('hello !pack') === null && chatCore.splitCommand('') === null, 'a message that does not start with ! has no command');
ok(chatCore.splitCommand('!pack ' + 'x'.repeat(300))!.rest.length === chatCore.CHAT_ARGS_MAX, 'the rest is capped');
const raw = (id: string, event: Record<string, unknown>) => evCore.cleanTwitchEvent({ messageId: id, type: 'channel.chat.message', event });
ok(raw('msg-0000001', msg('msg-0000001', '!pack')) !== null && raw('msg-0000001', msg('bad id', '!pack')) === null, 'cleanTwitchEvent accepts the chat type and checks its shape');
ok(chatCore.commandWords([{ name: 'Hello', aliases: ['Hi'], enabled: true }, { name: 'off', aliases: ['no'], enabled: false }, { name: 'pack', aliases: [], enabled: true }]).join() === '!pack,!showoff,!hello,!hi', 'command words: !pack, !showoff, enabled commands and aliases, lowercased, no repeats');

// ── A season with a pack, a text command, the bridge PCs ──
await kvLib.seedSeason1();
const season = (await kvLib.listSeasons())[0];
await kvLib.setActiveSeason(season.id);
const packName = (await kvLib.getActiveSeasonWithPacks())!.packs[0].pack.name;
await cmds.saveCommands([
  { id: 'hello', name: 'hello', aliases: ['hi'], enabled: true, action: 'text', reply: 'Hello {username}!', errors: {}, cooldownS: 0, userCooldownS: 0, liveOnly: false },
  { id: 'off', name: 'quiet', aliases: [], enabled: false, action: 'text', reply: 'Never', errors: {}, cooldownS: 0, userCooldownS: 0, liveOnly: false },
  { id: 'empty', name: 'silent', aliases: [], enabled: true, action: 'text', reply: '   ', errors: {}, cooldownS: 0, userCooldownS: 0, liveOnly: false },
]);
const queue = () => kv.lrange<{ username: string; type: string }>('webhooks:queue', 0, -1);
const pulls = async (who?: string) => (await queue()).filter(q => q.type !== 'card' && (!who || q.username === who)).length;
const resetRates = async () => { await kv.del('rl:twitch-chat-1s:all'); await kv.del('rl:twitch-chat-30s:all'); };
const runMsg = async (id: string, text: string, opts: { badges?: unknown[]; login?: string; userId?: string } = {}) => {
  await resetRates();
  const clean = evCore.cleanTwitchEvent({ messageId: id, type: 'channel.chat.message', event: msg(id, text, opts.badges ?? [], opts.login ?? 'viewer_a', opts.userId ? { chatter_user_id: opts.userId } : {}) });
  ok(clean, `a good chat body for ${text}`);
  return ev.recordTwitchEvent(clean!, Date.now(), fake);
};

// ── Not connected: nothing runs ──
ok((await ev.recordTwitchEvent(evCore.cleanTwitchEvent({ messageId: 'msg-0000000', type: 'channel.chat.message', event: msg('msg-0000000', '!pack') })!, Date.now(), fake)).status === 'ignored', 'with no channel connected a chat message is ignored');

// ── Connect the channel: an old connection without the chat permissions first ──
grant = SCOPES_OLD;
ok((await ch.connectChannel('code', 'josh', fake)).ok === false, 'a sign-in without the chat scopes is refused as a new connection');
grant = SCOPES_ALL;
twitchUser = { id: '4242', login: 'SpareAccount' };
ok((await ch.connectChannel('code', 'josh', fake)).ok && (await ch.readChannelStatus())?.testing === true, 'a spare account is connected with the chat scopes');
ok(coreChannel.chatScopesOk((await ch.readChannelStatus())!.scopes), 'chat is allowed');
ok(!coreChannel.chatScopesOk(SCOPES_OLD) && coreChannel.missingScopes(SCOPES_OLD).includes('user:write:chat'), 'an old grant is missing the chat scopes ("Reconnect to allow chat")');

// ── The command list route and its guard ──
const admin = await b.mintToken('STREAM-PC', { userId: '1', login: 'josh', role: 'admin', by: 'josh', roleCheckedAt: Date.now() });
const mod = await b.mintToken('Mod PC', { userId: '2', login: 'modder', role: 'mod', by: 'modder', roleCheckedAt: Date.now() });
const oldOff = await b.mintToken('Old PC', { by: 'josh' });
const call = (token?: string) => listRoute.POST(new Request('http://localhost/api/bridge/chat-commands', { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {} }));
ok((await call()).status === 401, 'chat-commands: no token is refused');
ok((await call(mod)).status === 403 && (await call(oldOff)).status === 403, 'chat-commands: a mod PC and an old PC are refused');
const lr = await call(admin);
const lj = await lr.json();
ok(lr.status === 200 && lj.chat === true && lj.commands.join() === '!pack,!showoff,!hello,!hi,!silent', `chat-commands: the words, aliases lowercased, switched-off left out: ${lj.commands}`);
let status = 200;
for (let i = 0; i < 40 && status !== 429; i++) status = (await call(admin)).status;
ok(status === 429, 'chat-commands: rate limited per PC');
await kv.del('rl:bridge-chat-commands:' + hashToken(admin));

// ── !pack <name> end to end, reply to the fake Helix ──
let before = await pulls();
let r = await runMsg('msg-pack-0001', `!pack ${packName}`, { badges: bd('subscriber') });
ok(r.status === 'ran' && r.reply === 'sent', `!pack ran and the reply was sent: ${JSON.stringify(r)}`);
ok((await pulls()) === before + 1 && (await pulls('viewer_a')) >= 1, 'one pack queued for the chatter');
ok(sent.length === 1 && sent[0].message.length > 0 && sent[0].parent === 'msg-pack-0001' && sent[0].broadcaster === '4242' && sent[0].sender === '4242', 'the reply went to Helix as a reply to the message, from the channel account');
ok(sent[0].auth === 'Bearer ACCESS-CHANNEL', 'with the channel account\'s token');
ok((await mix.getMixItUpLog()).some(l => l.detail.includes('from Twitch chat')), 'and the Mix It Up log has a line');
ok((await ev.recentTwitchEvents()).length === 0, 'chat messages are not kept in the recent list');
// a duplicate message id runs once
r = await runMsg('msg-pack-0001', `!pack ${packName}`);
ok(r.status === 'duplicate' && (await pulls()) === before + 1 && sent.length === 1, 'a repeated message id runs once and sends nothing');
// the pack from the rest of the message: an unknown name is refused and said so
r = await runMsg('msg-pack-0002', '!pack Nonexistent Pack');
ok(r.status === 'ran' && sent.length === 2 && /Nonexistent|pack/i.test(sent[1].message) && (await pulls()) === before + 1, `an unknown pack name is answered, nothing queued: ${sent[1]?.message}`);
// no name: a rolled pack
r = await runMsg('msg-pack-0003', '!PACK');
ok(r.status === 'ran' && (await pulls()) === before + 2, 'a bare !pack (any case) opens a rolled pack');

// ── A Commands tab command (and an alias) ──
const n0 = sent.length;
r = await runMsg('msg-hello-0001', '!hello', { login: 'chatty' });
ok(r.status === 'ran' && sent.length === n0 + 1 && sent[n0].message === 'Hello chatty!' && sent[n0].parent === 'msg-hello-0001', `a chat command runs and replies: ${sent[n0]?.message}`);
r = await runMsg('msg-hello-0002', '!Hi there', { login: 'chatty' });
ok(r.status === 'ran' && sent[n0 + 1]?.message === 'Hello chatty!', 'an alias runs it too');
// empty reply: not sent
r = await runMsg('msg-silent-001', '!silent');
ok(r.status === 'ran' && sent.length === n0 + 2, 'a command with an empty reply sends nothing');
// unknown / switched-off / not-first words are ignored
for (const [id, text] of [['msg-ignore-001', 'hello everyone'], ['msg-ignore-002', '!unknown'], ['msg-ignore-003', '!quiet'], ['msg-ignore-004', 'hey !pack'], ['msg-ignore-005', '']] as const) {
  r = await runMsg(id, text);
  ok(r.status === 'ignored', `ignored: ${JSON.stringify(text)}`);
  ok(!(await kv.get('twitch:chat:' + id)), `and not remembered: ${text}`);
}
ok(sent.length === n0 + 2, 'ignored messages send nothing');
// the bot's own message is not a command (when a bot is connected, tested below)

// ── Reply rate limits ──
const afterAll = sent.length;
const quick = async (id: string) => { const c = evCore.cleanTwitchEvent({ messageId: id, type: 'channel.chat.message', event: msg(id, '!hello', [], 'rapid') }); return ev.recordTwitchEvent(c!, Date.now(), fake); };
await resetRates();
const q1 = await quick('msg-rate-00001');
const q2 = await quick('msg-rate-00002'); // within the same second
ok(q1.status === 'ran' && q1.reply === 'sent' && q2.status === 'ran' && q2.reply === 'dropped' && sent.length === afterAll + 1, `1 a second: the second is dropped, not queued: ${JSON.stringify([q1, q2])}`);
ok((await mix.getMixItUpLog()).some(l => l.detail.includes('dropped: over the chat rate limit')), 'a dropped reply leaves a log line');
await new Promise(res => setTimeout(res, 1100));
ok((await quick('msg-rate-00003') as { reply?: string }).reply === 'sent', 'a second later a reply goes out again');
await resetRates();
let okCount = 0, dropped = 0;
for (let i = 0; i < 25; i++) {
  await kv.del('rl:twitch-chat-1s:all'); // only the 30 second window is under test here
  const o = await quick(`msg-win-${String(i).padStart(5, '0')}`) as { reply?: string };
  if (o.reply === 'sent') okCount++; else if (o.reply === 'dropped') dropped++;
}
ok(okCount <= 20 && dropped >= 5 && okCount + dropped === 25, `20 in 30 seconds: ${okCount} sent, ${dropped} dropped`);
const toDirect = sent.length;
ok((await chat.sendChatReply('   ', 'msg-empty-0001', 'x', fake)) === 'sent' ? false : true, 'empty text is never sent through the helper');
ok(sent.length === toDirect, 'and nothing reached Helix');
await resetRates();

// ── The bot account ──
const startOAuth = async (marker: 'channel' | 'bot' | 'plain', state = 'st-1', by = 'josh') =>
  JSON.stringify(marker === 'plain' ? { state, returnTo: '/' } : { state, [marker]: true, by, returnTo: '/admin/mixitup?tab=connection' });
ok(ch.botStateOk(await startOAuth('bot'), 'st-1', 'josh'), 'bot state: the same admin with the bot marker passes');
ok(!ch.botStateOk(await startOAuth('bot'), 'st-1', 'other-admin'), 'bot state: another admin is refused');
ok(!ch.botStateOk(await startOAuth('bot'), 'wrong', 'josh') && !ch.botStateOk(undefined, 'st-1', 'josh') && !ch.botStateOk('not json', 'st-1', 'josh'), 'bot state: a wrong state, no cookie or a broken cookie is refused');
ok(!ch.botStateOk(await startOAuth('plain'), 'st-1', 'josh') && !ch.botStateOk(await startOAuth('channel'), 'st-1', 'josh'), 'bot state: a plain sign-in or the channel marker is not a bot connection');
ok(!ch.channelStateOk(await startOAuth('bot'), 'st-1', 'josh') && ch.channelStateOk(await startOAuth('channel'), 'st-1', 'josh'), 'and the bot marker does not pass the channel check');
ok(!ch.botStateOk(JSON.stringify({ state: 'st-1', bot: true, channel: true, by: 'josh' }), 'st-1', 'josh'), 'both markers at once are refused');

grant = [...coreChannel.BOT_SCOPES];
twitchUser = { id: '4242', login: 'SpareAccount' };
nextRefresh = 'REFRESH-BOT';
const same = await bot.connectBot('code', 'josh', fake);
ok(same.ok === false && same.reason === 'same' && (await bot.readBotStatus()) === null, 'the channel\'s own account is refused as the bot');
twitchUser = { id: '9001', login: 'TcgBotAccount' };
grant = ['user:bot'];
ok((await bot.connectBot('code', 'josh', fake)).ok === false && (await bot.readBotStatus()) === null, 'a bot sign-in missing a scope is refused');
grant = [...coreChannel.BOT_SCOPES];
ok((await bot.connectBot('code', 'josh', fake)).ok === true, 'another account connects as the bot');
const bs = await bot.readBotStatus();
ok(bs?.login === 'tcgbotaccount' || bs?.login === 'TcgBotAccount', 'the bot is read back');
const stored = JSON.stringify(await kv.get('twitch:bot-auth'));
ok(!stored.includes('REFRESH-BOT') && (await kv.get('twitch:bot-auth')) !== null, 'the bot refresh token is stored encrypted');
ok((await bot.getReplyAs()) === 'channel', 'replies still go from the channel account by default');
// the bot's own messages are not commands
r = await runMsg('msg-botown-001', '!hello', { login: 'tcgbotaccount', userId: '9001' });
ok(r.status === 'ignored' && (r as { reason?: string }).reason === 'own_message', 'a message from the bot account itself is ignored');

await bot.setReplyAs('bot');
let n1 = sent.length;
r = await runMsg('msg-bot-000001', '!hello', { login: 'chatty' });
ok(r.status === 'ran' && r.reply === 'sent' && sent.length === n1 + 1 && sent[n1].sender === '9001' && sent[n1].auth === 'Bearer ACCESS-BOT' && sent[n1].broadcaster === '4242', 'reply as bot: the bot is the sender, the channel is the room');

// bot send fails: fall back to the channel account and send one notice
botSendFails = true;
await kv.del('twitch:chat-bot-fallback');
n1 = sent.length;
r = await runMsg('msg-botf-00001', '!hello', { login: 'chatty' });
ok(r.status === 'ran' && r.reply === 'sent' && sent.length === n1 + 1 && sent[n1].sender === '4242' && sent[n1].auth === 'Bearer ACCESS-CHANNEL', 'the bot fails: the channel account sends it instead');
ok((await kv.ttl('twitch:chat-bot-fallback')) > 0, 'and the staff notice was claimed (rate limited to one in 5 minutes)');
r = await runMsg('msg-botf-00002', '!hello', { login: 'chatty' });
ok(r.status === 'ran' && r.reply === 'sent' && sent[sent.length - 1].sender === '4242', 'a second failure also falls back');
botSendFails = false;

// bot token rejected: the bot is disconnected, replies fall back
botRejected = true;
await kv.del('twitch:chat-bot-fallback');
n1 = sent.length;
r = await runMsg('msg-botr-00001', '!hello', { login: 'chatty' });
ok(r.status === 'ran' && r.reply === 'sent' && sent[n1].sender === '4242', 'a rejected bot token falls back to the channel account');
ok((await bot.readBotStatus()) === null, 'and the dead bot connection is removed');
botRejected = false;

// reconnect, then Disconnect bot
nextRefresh = 'REFRESH-BOT';
ok((await bot.connectBot('code', 'josh', fake)).ok && (await bot.readBotStatus()) !== null, 'the bot is connected again');
ok((await bot.disconnectBot(fake)) !== null && (await bot.readBotStatus()) === null && (await kv.get('twitch:bot-auth')) === null, 'Disconnect bot deletes the stored token');
await bot.setReplyAs('bot'); // chosen, but no bot left
n1 = sent.length;
r = await runMsg('msg-nobot-0001', '!hello', { login: 'chatty' });
ok(r.status === 'ran' && r.reply === 'sent' && sent[n1].sender === '4242', 'reply as bot with no bot connected: the channel account sends it');
await bot.setReplyAs('channel');

// ── A channel connected without the chat permissions: chat features off ──
await kv.del('twitch:chat-reply-as');
// an older connection: rewrite the stored scopes
const auth = (await kv.get(coreChannel.CHANNEL_AUTH_KEY)) as Record<string, unknown>;
await kv.set(coreChannel.CHANNEL_AUTH_KEY, { ...auth, scopes: SCOPES_OLD });
ok((await ch.readChannelStatus())!.scopes.join() === SCOPES_OLD.join() && !coreChannel.chatScopesOk((await ch.readChannelStatus())!.scopes), 'the channel shows as connected without the chat permissions');
ok((await (await call(admin)).json()).chat === false, 'the command list says chat is off');
await kv.del('rl:bridge-chat-commands:' + hashToken(admin));
n1 = sent.length;
r = await runMsg('msg-nochat-0001', '!hello', { login: 'chatty' });
ok(r.status === 'ran' && r.reply === 'failed' && sent.length === n1, 'a reply is not sent without the chat permissions (Reconnect to allow chat)');
await kv.set(coreChannel.CHANNEL_AUTH_KEY, auth);

// ── The switch-over: the three Mix It Up chat webhooks ──
const secret = (await getWebhookSettings()).incomingSecret;
type Answer = { ok?: boolean; ignored?: boolean; reason?: string; message?: string };
const hook = async (route: (r: NextRequest) => Promise<Response>, path: string, body: Record<string, unknown>): Promise<Answer> =>
  (await route(new NextRequest('http://localhost' + path, { method: 'POST', body: JSON.stringify({ secret, ...body }) }))).json();
let rid = 0;
const mixPack = () => hook(pullRoute, '/api/webhooks/pull', { username: 'mix_user', requestId: `r-${++rid}-${Date.now()}`, pack: packName });
const mixShow = () => hook(showRoute, '/api/webhooks/show-card', { username: 'mix_user' });
const mixCmd = () => hook(commandRoute, '/api/webhooks/command', { username: 'mix_user', command: 'hello' });
const fromTwitch = (a: Answer) => a.ok === true && a.ignored === true && a.reason === 'from_twitch' && a.message === '';
const subs = Object.values(evCore.TWITCH_EVENT_OF).map(type => ({ type, status: 'enabled' }));
const chatSub = { type: chatCore.CHAT_EVENT, status: 'enabled' };
const report = { state: 'connected' as const, reason: '', login: 'SpareAccount', testing: true, since: Date.now(), subs: [...subs, chatSub] };
const store = (over: Record<string, unknown> = {}, ageMs = 0) => kv.set('twitch:eventsub', { ...report, pc: 'STREAM-PC', at: Date.now() - ageMs, ...over });
const works = async (label: string) => {
  const p0 = await pulls();
  const a = await mixPack();
  ok(a.ok === true && !a.ignored && a.reason !== 'from_twitch' && (await pulls()) === p0 + 1, `${label}: a Mix It Up !pack works (${JSON.stringify(a)})`);
  ok(!fromTwitch(await mixShow()) && !fromTwitch(await mixCmd()), `${label}: the show-card and command webhooks work`);
  ok((await mixCmd()).message === 'Hello mix_user!', `${label}: and the command answers`);
};

ok(evCore.EVENT_TYPES.includes(chatCore.CHAT_EVENT), 'the chat type is an accepted EventSub type');
// a test account with a fresh report: never switched off
await store();
ok((await ch.readChannelStatus())!.testing === true, 'still the test account');
await works('test account');

// the live channel
twitchUser = { id: '4242', login: CHANNEL_LOGIN };
grant = SCOPES_ALL;
nextRefresh = 'REFRESH-CHANNEL';
ok((await ch.connectChannel('code', 'josh', fake)).ok && (await ch.readChannelStatus())?.testing === false, 'the live channel is connected');
const live = { ...report, login: CHANNEL_LOGIN, testing: false };
const storeLive = (over: Record<string, unknown> = {}, ageMs = 0) => kv.set('twitch:eventsub', { ...live, pc: 'STREAM-PC', at: Date.now() - ageMs, ...over });
await kv.del('twitch:eventsub');
await works('live channel, no report');
await storeLive({}, evCore.REPORT_STALE_MS + 5000);
await works('stale report');
await storeLive({ state: 'reconnecting' });
await works('not connected');
await storeLive({ subs });
await works('chat subscription missing');
await storeLive({ subs: [...subs, { ...chatSub, status: 'failed' }] });
await works('chat subscription failed');
await storeLive({ testing: true });
await works('report says testing');

// connected: Twitch handles chat, Mix It Up is ignored
await storeLive();
const p1 = await pulls(); const q0 = (await queue()).length;
ok(fromTwitch(await mixPack()) && fromTwitch(await mixShow()) && fromTwitch(await mixCmd()), 'connected: the three Mix It Up chat webhooks answer from_twitch, silently');
ok((await pulls()) === p1 && (await queue()).length === q0, 'and queued nothing');
const buff = await hook((await import('../app/api/webhooks/buff/route')).POST as never, '/api/webhooks/buff', { username: 'mix_user', event: 'buff' }).catch(() => ({} as Answer));
ok(buff.reason !== 'from_twitch', 'the buff webhook is not part of this switch-over');
const evPull = await hook(pullRoute, '/api/webhooks/pull', { username: 'mix_user', event: 'redeem', amount: 1 });
ok(evPull.reason !== 'from_twitch', 'a pull webhook carrying an event field (paid event rewards) is not the chat switch-over');
// the chat message still runs through Twitch
r = await runMsg('msg-live-000001', `!pack ${packName}`);
ok(r.status === 'ran', 'and the same chat message arriving from Twitch runs');

globalThis.fetch = realFetch;
console.log('check-twitch-chat: ok');
process.exit(0);
