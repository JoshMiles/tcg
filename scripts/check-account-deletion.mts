// Checks the account deletion request (ROADMAP 11.3): one open request per viewer, cancelling, declining with a notice, and the
// deletion itself removing every key it should (escrowed prints are returned first, a restore point is taken, open offers cancelled,
// settings, notices, other feedback; the deletion record stays). Runs inside a sandbox on the mock KV; refuses anything non-local.
// Run: npx tsx scripts/check-account-deletion.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const kvLib = await import('../lib/kv');
const sbx = await import('../lib/sandbox');
const trades = await import('../lib/trades');
const F = await import('../lib/feedback');
const C = await import('../lib/feedback-core');
const D = await import('../lib/account-deletion');
const admin = await import('../lib/user-admin');
const { runInSandbox, kv } = await import('../lib/db');
const { notify, listNotices } = await import('../lib/trade-notify');
const { saveUserSettings, getUserSettings } = await import('../lib/user-settings-store');
const { encodeEntry } = await import('../lib/variants');
const E = (n: number) => encodeEntry(n, 'regular');

// The words a decline sends, and a finished deletion saying nothing.
ok(/could not delete/.test(C.noticeText({ kind: 'deletion', title: 'Delete my account', status: 'wontfix', reply: 'Open dispute' }, { status: true, reply: true }) ?? ''), 'a decline tells the sender and gives the reason');
eq(C.noticeText({ kind: 'deletion', title: 'Delete my account', status: 'done' }, { status: true, reply: false }), null, 'a finished deletion has no one to tell');
ok(C.DELETION_OVERDUE_DAYS === 30, 'a request is overdue after a month');

await kvLib.seedSeason1();
const box = await sbx.createSandbox({ name: 'Deletion check', source: 'config' });

await runInSandbox(box.id, async () => {
  const season = (await kvLib.listSeasons())[0];
  const coll = season.collectionName;
  await kvLib.saveCollection(coll, { alice: [E(1), E(1), E(2)], bob: [E(3), E(4)] });
  await trades.saveTradeSettings({ enabled: true, expiryHours: 48, maxOpenPerUser: 5, cooldownSeconds: 0, maxStacksPerSide: 8 });
  await kvLib.saveUserProfile({ username: 'alice', displayName: 'Alice', createdAt: 1 });
  await saveUserSettings('alice', { bio: 'hello', wanted: [3] });
  await notify('alice', { kind: 'admin', text: 'hi' });
  const open = await trades.createTrade({ seasonId: season.id, from: 'alice', kind: 'listing', give: [{ cardNumber: 1, variant: 'regular', count: 1 }], get: [{ cardNumber: 3, variant: 'regular', count: 1 }] });
  ok(open.ok, 'alice has an open listing');
  ok((await kvLib.getCollection(coll)).alice.length === 2, 'her offered print is in escrow, so she holds two');
  const idea = C.parseFeedbackInput({ kind: 'idea', title: 'Hello', body: 'Some details here' });
  if (!idea.ok) throw new Error('bad test input');
  await F.submitFeedback('alice', idea.value, undefined);
  await F.submitFeedback('bob', idea.value, undefined);

  // The request
  eq(await F.deletionOf('alice'), null, 'no request yet');
  const r1 = await F.requestDeletion('Alice');
  ok(r1.ok && r1.item.kind === 'deletion' && r1.item.status === 'new', 'a request is made');
  ok(!(await F.requestDeletion('alice')).ok, 'only one open request at a time');
  ok(await F.cancelDeletion('alice'), 'the sender can cancel while it waits');
  eq(await F.deletionOf('alice'), null, 'and it is gone');
  const r2 = await F.requestDeletion('alice');
  if (!r2.ok) throw new Error('request failed');
  const dec = await F.updateFeedback(r2.item.id, { status: 'wontfix', reply: 'Open dispute' }, 'admin_amy');
  ok(dec.ok && (await listNotices('alice')).notices.some(n => n.kind === 'feedback' && /could not delete/.test(n.text) && !n.text.includes('admin_amy')), 'a decline notifies the sender without naming staff');
  ok(!(await F.cancelDeletion('alice')), 'a declined request cannot be cancelled');
  const r3 = await F.requestDeletion('alice');
  ok(r3.ok, 'after a decline they can ask again');
  if (!r3.ok) throw new Error('request failed');

  // The deletion
  const report = await D.deleteViewerAccount('alice');
  ok(report.snapshot && report.tradesCancelled === 1, 'a restore point was taken and the open offer cancelled');
  await F.closeDeletion(r3.item.id, 'admin_amy');
  const snaps = await admin.listUserSnapshots('alice');
  eq(snaps[0]?.collections[0]?.entries.length, 3, 'the restore point holds all three prints (the escrowed one was returned first)');
  ok(!('alice' in (await kvLib.getCollection(coll))), 'her collection is gone');
  ok((await trades.listOpenTrades()).every(t => t.from !== 'alice'), 'no open offer of hers remains');
  eq(await kvLib.getUserProfile('alice'), null, 'the profile is gone');
  eq((await getUserSettings('alice')).bio, '', 'her settings are gone');
  eq((await listNotices('alice')).notices.length, 0, 'her notices are gone');
  eq(await kv.get('user:alice:settings'), null, 'no settings key is left');
  const left = await F.feedbackOf('alice');
  eq(left.map(i => i.kind), ['deletion', 'deletion'], 'only the deletion records (this one and the declined one) are kept, her other feedback is deleted');
  eq(left[0].status, 'done', 'and it is marked done');
  ok((await F.feedbackOf('bob')).length === 1, 'someone else’s feedback is untouched');
  ok(((await kvLib.getCollection(coll)).bob ?? []).length === 2, 'someone else’s collection is untouched');
});

console.log('account deletion checks passed');
