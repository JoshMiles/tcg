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

server.close();
console.log('feedback checks passed');
