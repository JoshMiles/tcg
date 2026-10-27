// Checks the feedback inbox (ROADMAP 11.2): input validation, the daily limit, the store and its counts, status changes and replies
// with the sender's notice (and their Settings switch), the retention sweep, the Discord category (off by default, escaped text,
// silent in a sandbox) and the export. Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local.
// Run: npx tsx scripts/check-feedback.mts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const hits: { embeds: { title?: string; description?: string; fields?: { name: string; value: string }[] }[]; allowed_mentions: { parse: unknown[] } }[] = [];
const server = createServer((req, res) => {
  let data = '';
  req.on('data', d => (data += d));
  req.on('end', () => { hits.push(JSON.parse(data)); res.statusCode = 204; res.end(); });
});
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const hook = `http://localhost:${(server.address() as AddressInfo).port}/api/webhooks/1/token`;

const C = await import('../lib/feedback-core');
const F = await import('../lib/feedback');
const dc = await import('../lib/discord-config');
const d = await import('../lib/discord');
const { runInSandbox } = await import('../lib/db');
const { listNotices } = await import('../lib/trade-notify');
const { saveUserSettings } = await import('../lib/user-settings-store');
const { DEFAULT_SETTINGS, wantsNotice } = await import('../lib/user-settings');
const { buildExport } = await import('../lib/user-export');

// ── validation ──
const bad = (raw: unknown) => { const r = C.parseFeedbackInput(raw); ok(!r.ok, `refused ${JSON.stringify(raw)}`); };
bad(null);
bad({ kind: 'nope', title: 'abc', body: 'details here' });
bad({ kind: 'idea', title: '', body: 'details here' });
bad({ kind: 'idea', title: 'Cool', body: 'hm' });
bad({ kind: 'bug', body: '' });
{
  const r = C.parseFeedbackInput({ kind: 'idea', title: '  A\u0000 big\nidea  ', body: 'x'.repeat(5000), expected: 'ignored', from: '/cards' });
  ok(r.ok, 'a suggestion is accepted');
  if (r.ok) {
    eq(r.value.title, 'A big idea', 'the title is one clean line');
    eq(r.value.body.length, C.FEEDBACK_LIMITS.body, 'the details are length-capped');
    ok(!r.value.expected && !r.value.from, 'a suggestion drops the problem-only fields');
    ok(!r.value.includeDevice, 'device details are off unless ticked');
  }
}
{
  const r = C.parseFeedbackInput({ kind: 'bug', body: 'The page broke when I clicked', expected: 'It should open', from: '/trade/abc?x=1', includeDevice: true });
  ok(r.ok && r.value.title.startsWith('The page broke') && r.value.from === '/trade/abc?x=1' && r.value.includeDevice, 'a problem report takes its title from the text and keeps the page');
}
for (const from of ['https://evil.example/x', '//evil.example', 'javascript:alert(1)', '/a b', '']) eq(C.cleanFrom(from), '', `page "${from}" is dropped`);
eq(C.cleanFrom('/u/ann?tab=pulls'), '/u/ann?tab=pulls', 'a path on this site is kept');
{
  const m = C.cleanMeta({ ua: 'Mozilla/5.0 '.repeat(60), screen: '390x844', build: 'forged' }, 'v1.0.0 · abc1234');
  ok((m.ua?.length ?? 0) <= C.FEEDBACK_LIMITS.ua && m.screen === '390x844', 'the device details are bounded');
  eq(m.build, 'v1.0.0 · abc1234', 'the build stamp comes from the server, not the request');
  eq(C.cleanMeta({ screen: 'huge' }, '').screen, undefined, 'a malformed screen size is dropped');
}
ok(C.discordText('**bold** [x](http://a.b) @everyone `code`').indexOf('@everyone') === -1 && !/(^|[^\\])\*\*/.test(C.discordText('**bold**')), 'Discord text is escaped and cannot ping');
eq(C.discordText('y'.repeat(900)).length, C.FEEDBACK_LIMITS.discordText, 'Discord text is cut to 500 characters');

// ── the category is off for existing channels, with a preset ──
ok(dc.DEFAULT_CATEGORIES.feedback === false, 'feedback is off by default');
ok(dc.DISCORD_CATEGORIES.some(c => c.key === 'feedback') && dc.DISCORD_PRESETS.some(p => p.key === 'feedback' && p.categories.feedback), 'there is a Feedback category and preset');
eq(d.normalize({ enabled: true, channels: [{ id: 'old', name: 'Old', url: hook, enabled: true, categories: { pulls: true } as never, minStars: 1, newOnly: false }] }).channels[0].categories.feedback, false, 'an existing channel does not get feedback');

// ── submit, limit, counts ──
const now = Date.UTC(2026, 9, 17, 12);
const user = 'fb_ann_' + Math.random().toString(36).slice(2, 6);
const valid = (title: string) => { const r = C.parseFeedbackInput({ kind: 'idea', title, body: 'Some details about it' }); if (!r.ok) throw new Error('bad test input'); return r.value; };
const before = await F.countNewFeedback();
// a channel that wants feedback, and one that does not
await d.saveDiscordSettings({
  enabled: true,
  channels: [
    { ...dc.presetChannel('feedback'), id: 'fb', url: hook, enabled: true },
    { ...dc.presetChannel('pulls'), id: 'pl', url: hook, enabled: true },
  ],
});
const first = await F.submitFeedback(user, { ...valid('Add **dark** mode @everyone'), body: 'Please [click](http://x.y) and <@123> ping' }, undefined, now);
ok(first.ok, 'the first send works');
if (!first.ok) throw new Error('unreachable');
eq(first.item.status, 'new', 'new items start as new');
ok(!first.item.meta, 'no device details unless ticked');
eq(await F.countNewFeedback(), before + 1, 'the new count goes up');
await sleep(300);
eq(hits.length, 1, 'only the channel with Feedback ticked got a post');
ok(hits[0].allowed_mentions.parse.length === 0, 'mentions stay empty');
ok(!hits[0].embeds[0].description?.includes('<@123>') && !hits[0].embeds[0].description?.includes('](http'), 'the posted text is escaped');
ok(hits[0].embeds[0].title?.includes(d.escapeMd(user)), 'the post names the sender');

for (let i = 1; i < C.FEEDBACK_LIMITS.perDay; i++) ok((await F.submitFeedback(user, valid('Idea ' + i), undefined, now)).ok, `send ${i + 1} of the day works`);
{
  const over = await F.submitFeedback(user, valid('One too many'), undefined, now);
  ok(!over.ok && over.status === 429, 'the sixth send in a day is refused');
  ok((await F.submitFeedback(user, valid('Next day'), undefined, now + 86_400_000)).ok, 'the limit resets the next day');
}
{
  const dev = await F.submitFeedback('fb_dev_' + Math.random().toString(36).slice(2, 6), { ...valid('With device'), includeDevice: true }, { ua: 'Test UA', screen: '800x600' }, now);
  ok(dev.ok && dev.item.meta?.ua === 'Test UA' && dev.item.meta.screen === '800x600' && !!dev.item.meta.build, 'ticked device details are kept with the server build stamp');
}

// ── sandbox silence ──
await sleep(500);
const hitsBefore = hits.length;
await runInSandbox('sbx-test', async () => { await d.notifyFeedback(first.item); });
await sleep(200);
eq(hits.length, hitsBefore, 'nothing is posted from a sandbox');

// ── status and reply notify the sender ──
const total = before + C.FEEDBACK_LIMITS.perDay + 2; // the day's sends, the next day's, and the device one
eq(await F.countNewFeedback(), total, 'the new count includes every unanswered item');
const notes = async () => (await listNotices(user)).notices.filter(n => n.kind === 'feedback');
eq((await notes()).length, 0, 'no notice before staff act');
{
  const r = await F.updateFeedback(first.item.id, { status: 'planned' }, 'mod_mia', now + 1000);
  ok(r.ok && r.item.status === 'planned' && r.item.repliedBy === 'mod_mia' && r.item.resolvedAt === now + 1000, 'status changes and records who and when');
  eq(await F.countNewFeedback(), total - 1, 'a handled item leaves the new count');
  const n = await notes();
  eq(n.length, 1, 'the sender gets one notice');
  ok(n[0].feedbackId === first.item.id && /planned/.test(n[0].text) && !n[0].text.includes('mod_mia'), 'the notice links the item and never names the staff member');
}
{
  const same = await F.updateFeedback(first.item.id, { status: 'planned' }, 'mod_mia', now + 2000);
  ok(same.ok, 'saving without a change is fine');
  eq((await notes()).length, 1, 'no notice when nothing changed');
  const r = await F.updateFeedback(first.item.id, { reply: 'Great idea, thanks!' }, 'mod_mia', now + 3000);
  ok(r.ok && r.item.reply === 'Great idea, thanks!' && r.item.resolvedAt === now + 1000, 'a reply is stored and the resolved time is kept');
  const n = await notes();
  eq(n.length, 2, 'a reply sends a notice');
  ok(n[0].text.includes('Great idea, thanks!'), 'the notice carries the reply');
  ok((await F.updateFeedback('missing', { status: 'done' }, null)).ok === false, 'an unknown item is refused');
  ok((await F.updateFeedback(first.item.id, { status: 'bogus' }, 'mod_mia', now + 4000)).ok, 'an unknown status is ignored, not stored');
  eq((await F.getFeedback(first.item.id))?.status, 'planned', 'the status stayed');
}
{
  // The sender's own Settings switch applies.
  await saveUserSettings(user, { ...DEFAULT_SETTINGS, notifyFeedback: false });
  ok(!wantsNotice({ ...DEFAULT_SETTINGS, notifyFeedback: false }, 'feedback') && wantsNotice(DEFAULT_SETTINGS, 'feedback'), 'feedback notices are on by default and can be switched off');
  await F.updateFeedback(first.item.id, { status: 'done' }, 'mod_mia', now + 5000);
  eq((await notes()).length, 2, 'a sender who switched them off hears nothing');
  await saveUserSettings(user, DEFAULT_SETTINGS);
}

// ── the sender sees their own items and replies; the list filters; the export includes them ──
{
  const mine = await F.feedbackOf(user);
  ok(mine.length >= 6 && mine.every(i => i.user === user), 'a viewer sees only their own items');
  ok(mine.find(i => i.id === first.item.id)?.reply === 'Great idea, thanks!', 'and the reply on them');
  const bugs = await F.listFeedback({ kind: 'bug' });
  ok(bugs.every(i => i.kind === 'bug'), 'the kind filter works');
  const planned = await F.listFeedback({ status: 'done', user });
  ok(planned.length === 1 && planned[0].id === first.item.id, 'the status and viewer filters work');
  const exp = await buildExport(user);
  ok(Array.isArray((exp as { feedback?: unknown[] }).feedback) && (exp as { feedback: unknown[] }).feedback.length === mine.length, 'the data export includes the viewer’s own feedback');
}

// ── retention: resolved items go 90 days later, open ones never ──
{
  const old = C.FEEDBACK_LIMITS.keepDaysAfterResolved * 86_400_000;
  ok(C.expired({ status: 'done', resolvedAt: 1 }, old + 2), 'a resolved item past the window is expired');
  ok(!C.expired({ status: 'done', resolvedAt: 1 }, old - 1000), 'one inside the window is kept');
  ok(!C.expired({ status: 'new' }, old * 10), 'an open item is never expired');
  const gone = await F.sweepFeedback(now + 5000 + old + 86_400_000);
  ok(gone >= 1, 'the sweep deletes the resolved items');
  eq(await F.getFeedback(first.item.id), null, 'the done item is gone');
  ok((await F.feedbackOf(user)).length >= 5, 'the open items stay');
  eq(await F.countNewFeedback(), total - 1, 'the new count is untouched by the sweep');
}

// ── user reports (ROADMAP 17.2) ──
{
  const { saveUserProfile } = await import('../lib/kv');
  const tag = crypto.randomUUID().slice(0, 4);
  const reporter = 'rp_ann_' + tag, target = 'rp_bob_' + tag, other = 'rp_cy_' + tag;
  await saveUserProfile({ username: target, displayName: target, createdAt: 1 });
  await saveUserProfile({ username: other, displayName: other, createdAt: 1 });
  const rep = (raw: Record<string, unknown>) => { const r = C.parseReportInput(raw); if (!r.ok) throw new Error('bad test input: ' + r.error); return r.value; };
  // validation
  ok(!C.parseReportInput({ target: 'x', reason: 'scam' }).ok, 'a malformed target is refused');
  ok(!C.parseReportInput({ target, reason: 'nope' }).ok, 'an unknown reason is refused');
  ok(!C.parseReportInput({ target, reason: 'other', details: 'short' }).ok, '"Something else" needs 10 or more characters');
  ok(C.parseReportInput({ target, reason: 'scam' }).ok, 'other reasons need no details');
  eq((C.parseReportInput({ target: '@' + target.toUpperCase(), reason: 'cheating', details: 'x'.repeat(5000) }) as { value: { target: string; details: string } }).value.details.length, C.FEEDBACK_LIMITS.reportDetails, 'details are capped at 1000');
  eq(C.cleanReportLink('/trade/abc123'), '/trade/abc123', 'a trade link is kept');
  eq(C.cleanReportLink('/copy/season1/xyz'), '/copy/season1/xyz', 'a print link is kept');
  for (const l of ['/admin/users', 'https://evil.example/trade/1', '//evil.example', '/trade/a b']) eq(C.cleanReportLink(l), '', `link "${l}" is dropped`);
  // self-report, unknown target
  const selfR = await F.submitReport(target, rep({ target, reason: 'scam' }), now);
  ok(!selfR.ok && selfR.status === 400, 'reporting yourself is refused');
  const ghost = await F.submitReport(reporter, rep({ target: 'rp_nobody_' + tag, reason: 'scam' }), now);
  ok(!ghost.ok && ghost.status === 404, 'an unknown collector is refused');
  // Discord gating: only a channel that includes Reports, and the post has no details or reporter
  hits.length = 0;
  await d.saveDiscordSettings({
    enabled: true,
    channels: [
      { ...dc.presetChannel('feedback'), id: 'fb2', url: hook, enabled: true },
      { ...dc.presetChannel('requests'), id: 'rq', url: hook, enabled: true },
    ],
  });
  const first = await F.submitReport(reporter, rep({ target, reason: 'offensive', details: 'SECRET-DETAILS in the bio', link: '/trade/abc' }), now);
  ok(first.ok, 'a report is filed');
  if (!first.ok) throw new Error('unreachable');
  eq(first.item.kind, 'report', 'it is a report item');
  ok(first.item.target === target && first.item.reason === 'offensive' && first.item.from === '/trade/abc' && first.item.user === reporter, 'it keeps target, reason, link and the reporter (staff only)');
  await sleep(300);
  eq(hits.length, 1, 'only the channel that includes Reports got a post');
  const text = JSON.stringify(hits[0]);
  ok(!!hits[0].embeds[0].title?.includes(d.escapeMd(target)) && !!hits[0].embeds[0].description?.includes('Offensive'), 'the post names the target and the reason');
  ok(!text.includes('SECRET-DETAILS') && !text.includes(reporter) && !text.includes(d.escapeMd(reporter)), 'the post has neither the details nor the reporter');
  // one open report per target, and a different target is fine
  const dup = await F.submitReport(reporter, rep({ target, reason: 'scam' }), now);
  ok(!dup.ok && dup.status === 409, 'a second open report on the same person is refused');
  ok((await F.submitReport(reporter, rep({ target: other, reason: 'scam' }), now)).ok, 'another person can be reported');
  // closing it: outcome only, never the staff note
  await F.updateFeedback(first.item.id, { status: 'done', reply: 'banned them for 3 days' }, 'mod_mia', now + 1000);
  const n = (await listNotices(reporter)).notices.filter(x => x.kind === 'feedback');
  eq(n.length, 1, 'the reporter gets a notice when it is closed');
  ok(!/banned|mod_mia|3 days/.test(n[0].text) && /report/i.test(n[0].text), 'the notice is the outcome only');
  ok((await F.submitReport(reporter, rep({ target, reason: 'scam' }), now + 2000)).ok, 'after it is closed, the same person can be reported again');
  // the daily limit (own counter, apart from feedback sends)
  const spam = 'rp_spam_' + tag;
  for (let i = 0; i < C.FEEDBACK_LIMITS.reportsPerDay; i++) {
    const t = `rp_t${i}_${tag}`; await saveUserProfile({ username: t, displayName: t, createdAt: 1 });
    ok((await F.submitReport(spam, rep({ target: t, reason: 'scam' }), now)).ok, `report ${i + 1} of the day works`);
  }
  const over = await F.submitReport(spam, rep({ target: other, reason: 'scam' }), now);
  ok(!over.ok && over.status === 429, 'the sixth report in a day is refused');
  ok((await F.submitFeedback(spam, valid('Still can send feedback'), undefined, now)).ok, 'reports do not use up the feedback limit');
  // the reported person's export has no reports about them; the reporter's does
  const expT = JSON.stringify(await buildExport(target)), expR = JSON.stringify(await buildExport(reporter));
  ok(!expT.includes('SECRET-DETAILS') && !expT.includes(reporter), "the reported person's export has nothing about reports on them");
  ok(expR.includes('SECRET-DETAILS'), "the reporter's export includes their own sent reports");
  eq((await F.listFeedback({ kind: 'report', status: 'new' })).every(i => i.kind === 'report'), true, 'the Reports filter works');
}

// ── items about staff (ROADMAP 51.6) ──
{
  const tag = crypto.randomUUID().slice(0, 4);
  const [modA, modB, adm, viewer] = [`fbma_${tag}`, `fbmb_${tag}`, `fbad_${tag}`, `fbv_${tag}`];
  const { addStaff } = await import('../lib/staff');
  const { saveUserProfile } = await import('../lib/kv');
  const actor = { login: 'joshmiles', role: 'super' as const };
  for (const [l, r] of [[modA, 'mod'], [modB, 'mod'], [adm, 'admin']] as const) ok((await addStaff(actor, l, r)).ok, `${l} added as staff`);
  const logins = [modA, modB, adm];
  eq(C.staffNamedIn({ user: viewer, title: 'x', body: `${modA.toUpperCase()} was rude, not ${modA}x`, target: undefined }, logins), [modA], 'a whole-word, case-insensitive mention counts; a longer word does not');
  eq(C.staffNamedIn({ user: viewer, title: 'x', body: 'nothing', target: modB }, logins), [modB], 'a report target counts');
  eq(C.staffNamedIn({ user: modA, title: 'x', body: `I am ${modA}`, target: undefined }, logins), [], 'the sender is never about themselves');
  await saveUserProfile({ username: modA, displayName: modA, createdAt: 1 });
  await saveUserProfile({ username: adm, displayName: adm, createdAt: 1 });
  const now2 = Date.UTC(2026, 9, 20, 12);
  const rep1 = await F.submitReport(viewer, { target: modA, reason: 'other', details: 'SECRET about the mod' }, now2);
  const fb1 = await F.submitFeedback(viewer, { kind: 'idea', title: 'Idea', body: `${modA} should do X`, includeDevice: false }, undefined, now2);
  const rep2 = await F.submitReport(viewer, { target: adm, reason: 'other', details: 'about the admin, long enough' }, now2);
  const plain = await F.submitFeedback(viewer, { kind: 'idea', title: 'Plain', body: 'about nobody here', includeDevice: false }, undefined, now2);
  if (!rep1.ok || !fb1.ok || !rep2.ok || !plain.ok) throw new Error('setup failed');
  const ids = (reader?: { login: string; admin: boolean }) => F.listFeedback({ user: viewer }, reader).then(l => l.map(i => i.id));
  const [all, forA, forB, forAdm] = await Promise.all([ids(), ids({ login: modA, admin: false }), ids({ login: modB, admin: false }), ids({ login: adm, admin: true })]);
  eq(all.length, 4, 'no reader sees everything');
  ok(!forA.includes(rep1.item.id) && !forA.includes(fb1.item.id) && forA.includes(rep2.item.id) && forA.includes(plain.item.id), 'a mod does not see items naming them, only those');
  eq(forB.length, 4, 'another mod sees all four');
  eq(forAdm.length, 4, 'an admin sees all four, including the one about themselves');
  eq((await F.listFeedback({ user: viewer })).filter(i => i.aboutStaff).map(i => i.id).sort(), [rep1.item.id, fb1.item.id, rep2.item.id].sort(), 'the three staff items carry aboutStaff');
  ok((await F.getFeedbackFor(rep1.item.id, { login: modA, admin: false })) === null, 'a mod cannot fetch an item about them by id');
  ok((await F.getFeedbackFor(rep1.item.id, { login: modB, admin: false }))?.aboutStaff?.[0] === modA, 'another mod can');
  const cA = await F.countNewFeedback({ login: modA, admin: false }), cB = await F.countNewFeedback({ login: modB, admin: false });
  eq(cB - cA, 2, 'the mod count leaves out the two items about that mod');
  eq(await F.countNewFeedback({ login: adm, admin: true }), await F.countNewFeedback(), 'the admin count is the full count');

  // Discord routing (ROADMAP 54.6): an item naming staff goes to the admin log channel only; no admin log channel means no post at all
  const v2 = `fbw_${tag}`, titleOf = () => hits.map(h => h.embeds[0]?.title ?? '');
  let day = 10; const send = async (body: string) => { hits.length = 0; const r = await F.submitFeedback(v2, { kind: 'idea', title: 'Routing', body, includeDevice: false }, undefined, now2 + 86_400_000 * day++); ok(r.ok, 'sent'); await sleep(300); };
  const chans = (...keys: string[]) => d.saveDiscordSettings({ enabled: true, channels: keys.map((k, i) => ({ ...dc.presetChannel(k), id: `rt${i}`, url: hook, enabled: true })) } as never);
  await chans('feedback');
  await send(`${modB} again`); eq(hits.length, 0, 'staff feedback with no admin log channel is not posted, and the send still works');
  await send('about nobody'); eq(hits.length, 1, 'other feedback still reaches the feedback channel');
  await chans('feedback', 'admin');
  await send('about nobody'); eq(titleOf().filter(t => t.startsWith('Staff report')).length, 0, 'other feedback is not marked as a staff report');
  eq(hits.length, 1, 'other feedback reaches only the feedback channel');
  await send(`${modB} again`); eq(hits.length, 1, 'staff feedback reaches one channel (the admin log)');
  ok(titleOf()[0].startsWith('Staff report | '), 'and is marked as a staff report');
}

server.close();
console.log('feedback checks passed');
