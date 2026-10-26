// Checks the account move ("Move aside", ROADMAP 47.8): everything under a login goes to `<login>~<n>`, the copy ledger stays consistent,
// open offers are refunded, and a move that fails part way carries on from its journal to the same end state.
// Needs the mock KV (node scripts/mock-kv.cjs); refuses anything non-local.  Run: npx tsx scripts/check-account-move.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';

let checks = 0;
const ok = (cond: unknown, msg: string) => { checks++; if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const { kv, prodKv } = await import('../lib/db');
const kvLib = await import('../lib/kv');
const ser = await import('../lib/serials');
const trades = await import('../lib/trades');
const tradeCore = await import('../lib/trade-core');
const { encodeEntry } = await import('../lib/variants');
const move = await import('../lib/account-move');
const { getHiddenUsers, setHidden, listUserSnapshots } = await import('../lib/user-admin');
const { saveUserSettings, loadUserSettings } = await import('../lib/user-settings-store');
const { getDiscordLink, getTwitchUserByDiscordId } = await import('../lib/discord-user');
const { addScoreBonus, getScoreBonuses } = await import('../lib/score-bonus');
const { setTester, getTester } = await import('../lib/access');
const { getStaffRecord } = await import('../lib/staff');
const E = (n: number) => encodeEntry(n, 'regular');

await kvLib.seedSeason1();
const s1 = (await kvLib.listSeasons())[0];
await kvLib.saveSeason({ ...s1, id: 'season2', name: 'Second Deck', collectionName: 'SecondDeck', active: false });
const seasons = await kvLib.listSeasons();
ok(seasons.length === 2, 'two seasons are seeded');
const C = seasons.map(s => s.collectionName);
await trades.saveTradeSettings({ ...tradeCore.DEFAULT_TRADE_SETTINGS, cooldownSeconds: 0, maxOpenPerUser: 3 });

// A bystander holds cards in both seasons, then every season is numbered (tracking on).
await kvLib.saveCollection(C[0], { pal: [E(3), E(9), E(9)] });
await kvLib.saveCollection(C[1], { pal: [E(1)] });
for (const c of C) await ser.backfillSerials(c, await kvLib.getCollection(c));
ok((await ser.isTracking(C[0])) && (await ser.isTracking(C[1])), 'both seasons are numbered');

async function allKeys(pattern: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | number = 0;
  for (let i = 0; i < 100; i++) {
    const [next, keys] = (await kv.scan(cursor, { match: pattern, count: 1000 })) as [string | number, string[]];
    out.push(...keys); cursor = next;
    if (String(cursor) === '0') break;
  }
  return out;
}

interface Before { idx: number[]; minted: string[]; ret: number[]; owned: string[][]; total: number; notices?: number; version?: number }
let n = 0;

/** A viewer with a bit of everything: cards in two seasons, offers (one finished, two open), settings, notices, a staff record, a Discord link... */
/** `plain`: not private and not hidden, so a rename that does not force anything can be told from one that does. */
async function seed(login: string, plain = false): Promise<{ id: string; before: Before }> {
  const id = `4242${n++}`;
  for (const [i, c] of C.entries()) {
    const data = await kvLib.getCollection(c);
    data[login] = i === 0 ? [E(1), E(1), E(1), E(2), E(2)] : [E(4), E(5), E(5)];
    if (i === 0) data.pal = [...(data.pal ?? []), E(3), E(9)]; // the friend can always cover the trades below
    await kvLib.saveCollection(c, data);
  }
  await kvLib.saveUserProfile({ username: login, displayName: 'Mover', twitchId: id, createdAt: 1, tags: ['vip'] });
  await saveUserSettings(login, { bio: 'hi', privateProfile: !plain, wanted: [3], watches: [{ card: 5, variant: null }] });
  if (!plain) await setHidden(login, true);
  const stack = (cardNumber: number) => [{ cardNumber, variant: 'regular' as const, count: 1 }];
  const mk = (from: string, to: string, give: number, get: number) => trades.createTrade({ seasonId: seasons[0].id, from, kind: 'direct', to, give: stack(give), get: stack(get) });
  const done = await mk(login, 'pal', 2, 3);
  ok(done.ok && (await trades.acceptTrade(done.trade.id, 'pal')).ok, 'a trade is finished before the move');
  ok((await mk(login, 'pal', 1, 9)).ok, 'an offer from the viewer is open');
  ok((await mk('pal', login, 9, 2)).ok, 'an offer to the viewer is open');
  await kv.lpush(`notif:${login}`, { id: 'n1', kind: 'offer', at: 1, text: 'hello' });
  await kv.set(`notif:${login}:v`, 3); await kv.set(`notif:${login}:seen`, 2);
  await kv.hset(`push:${login}`, { dev1: { endpoint: 'https://push.example/x', ua: 'test', addedAt: 1, lastOkAt: 1 } });
  await kv.lpush(`audit:user:${login}`, { at: 1, username: login, action: 'Seeded' });
  await kv.lpush(`user:${login}:scorehist:${seasons[0].id}`, { at: 1, score: 5, rank: 1 });
  await addScoreBonus(C[0], [login], 5);
  await kv.set(`user:${login}:pulllimit`, { base: 5 });
  await kv.set(`user:${login}:buffs`, [{ id: 'b1' }]);
  await kv.set(`user:${login}:discord`, { id: `d${id}`, username: 'disc', linkedAt: 1, dmStatus: 'ok', kinds: [] });
  await kv.set(`discord:user:d${id}`, login);
  await kv.hset('stats:last', { [login]: 123 });
  const ranks = (await kv.get<Record<string, unknown>>(`digest:ranks:${seasons[0].id}`)) ?? {};
  await kv.set(`digest:ranks:${seasons[0].id}`, { ...ranks, [login]: [1, 5] });
  await kv.hset('twitch:avatars', { [login]: { url: 'u', at: 1 } });
  await kv.set(`showoff:cd:${login}`, 1); await kv.set(`pronouns:${login}`, 'x'); await kv.set(`trade:cd:${login}`, '1');
  await kv.set(`twitch_opaque:U${id}`, login);
  ok((await setTester('admin', login, 'alpha')).ok, 'a tester record is added');
  await prodKv.hset('staff:members', { [login]: { login, role: 'mod', addedBy: 'x', addedAt: 1 } });
  ok((await getStaffRecord(login))?.twitchId === undefined, 'the staff record starts without a bound Twitch ID');

  // What must survive: every live copy (an offer's escrow goes back to its owner), per season.
  const owned: string[][] = [];
  const open = await trades.listOpenTrades();
  for (const c of C) {
    const ids = (await ser.getOwnerCopies(c, login)).map(x => x.id);
    for (const t of open) if (t.from === login) ids.push(...(await ser.getOwnerCopies(c, `escrow:${t.id}`)).map(x => x.id));
    owned.push(ids.sort());
  }
  // Cancelling the open offers during the move adds notices of its own, so these are lower bounds.
  const notices = ((await kv.lrange(`notif:${login}`, 0, -1)) ?? []).length;
  return { id, before: { ...(await baseline(owned)), notices, version: Number(await kv.get(`notif:${login}:v`)) } };
}

async function baseline(owned: string[][]): Promise<Before> {
  const idx: number[] = [], minted: string[] = [], ret: number[] = [];
  for (const c of C) {
    idx.push(Number(await kv.hlen(`copies:${c}:idx`)));
    minted.push(JSON.stringify([...(await ser.mintedCounts(c)).entries()].sort()));
    ret.push(Number(await kv.hlen(`copies:${c}:ret`)));
  }
  let total = 0;
  for (const c of C) {
    total += Object.values(await kvLib.getCollection(c)).reduce((s, l) => s + l.length, 0);
    for (const k of await allKeys(`copies:${c}:o:escrow:*`)) total += Number(await kv.hlen(k)); // copies held in an open offer still count
  }
  return { idx, minted, ret, owned, total };
}

/** Everything the move promises, checked the same way after a clean move and after a resumed one. */
async function assertMoved(login: string, to: string, id: string, before: Before, label: string, o: { mode?: 'aside' | 'rename'; hidden?: boolean } = {}) {
  const mode = o.mode ?? 'aside', wantHidden = o.hidden ?? true;
  const at = (m: string) => `${label}: ${m}`;
  // The ledger: same number of prints, same minted counts, nothing retired, no escrow left, idx and the owner hashes agree.
  for (const [i, c] of C.entries()) {
    const idx = ((await kv.hgetall(`copies:${c}:idx`)) ?? {}) as Record<string, string>;
    ok(Object.keys(idx).length === before.idx[i], at(`print count unchanged in ${c}`));
    eq(JSON.stringify([...(await ser.mintedCounts(c)).entries()].sort()), before.minted[i], at(`minted counts unchanged in ${c}`));
    ok(Number(await kv.hlen(`copies:${c}:ret`)) === before.ret[i], at(`nothing retired in ${c}`));
    let inHashes = 0;
    for (const k of await allKeys(`copies:${c}:o:*`)) {
      const owner = k.slice(`copies:${c}:o:`.length);
      const h = ((await kv.hgetall(k)) ?? {}) as Record<string, { owner: string }>;
      if (Object.keys(h).length === 0) continue; // the mock keeps a hash it has emptied, real Redis drops it
      ok(!owner.startsWith('escrow:'), at('no escrow is left'));
      ok(owner !== login, at('the old login holds no copies'));
      for (const [cid, copy] of Object.entries(h)) { inHashes++; ok(idx[cid] === owner && copy.owner === owner, at(`idx agrees with the owner hash for ${cid}`)); }
    }
    ok(inHashes === before.idx[i], at(`every print sits in exactly one owner hash in ${c}`));
    eq((await ser.getOwnerCopies(c, to)).map(x => x.id).sort(), before.owned[i], at(`the new login holds exactly the prints the old one had in ${c}`));
    const data = await kvLib.getCollection(c);
    ok(!(login in data), at(`no collection entry left in ${c}`));
    ok((data[to]?.length ?? 0) === before.owned[i].length, at(`collection entries match prints in ${c}`));
  }
  ok((await baseline(before.owned)).total === before.total, at('the cards in collections add up (escrow refunded)'));

  // Per-user keys: only the audit line about the move stays on the old login.
  const left = (await allKeys(`*${login}*`)).filter(k => !k.includes(`${login}~`));
  eq(left, [`audit:user:${login}`], at('the old login keeps nothing but its audit line'));
  ok(!(await kvLib.getUserProfile(login)), at('no profile under the old login'));

  // The new login has it all.
  const p = await kvLib.getUserProfile(to);
  ok(p?.username === to && p.twitchId === id && p.tags?.[0] === 'vip', at('the profile moved, renamed, ID kept'));
  eq(p?.displayName, mode === 'aside' ? 'Mover (former)' : 'Mover', at('the display name is tagged (former) only when moved aside'));
  const st = await loadUserSettings(to);
  ok(st.bio === 'hi' && st.privateProfile === wantHidden && st.wanted[0] === 3, at('settings moved, private as expected'));
  ok(((await kv.smembers('users:hidden:self')) as string[]).includes(to) === wantHidden && !((await kv.smembers('users:hidden:self')) as string[]).includes(login), at('the private set follows'));
  ok(Object.keys(((await kv.hgetall(`user:${to}:ach`)) ?? {})).length > 0, at('achievements moved'));
  const notices = ((await kv.lrange(`notif:${to}`, 0, -1)) ?? []) as { id?: string }[];
  ok(notices.length >= before.notices! && notices.some(x => x.id === 'n1'), at('notifications moved'));
  ok(Number(await kv.get(`notif:${to}:v`)) >= before.version! && Number(await kv.get(`notif:${to}:seen`)) === 2, at('notice counters moved'));
  ok(Object.keys(((await kv.hgetall(`push:${to}`)) ?? {})).length === 1, at('alert devices moved'));
  ok(((await kv.lrange(`audit:user:${to}`, 0, -1)) ?? []).length >= 2, at('the audit trail moved and notes the move'));
  ok((((await kv.lrange(`user:${to}:scorehist:${seasons[0].id}`, 0, -1)) ?? []).length) === 1, at('score history moved'));
  ok((await getScoreBonuses(C[0]))[to] === 5 && !((await getScoreBonuses(C[0]))[login]), at('score bonus moved'));
  ok(!!(await kv.get(`user:${to}:pulllimit`)) && !!(await kv.get(`user:${to}:buffs`)), at('pull limit and buffs moved'));
  ok((await getDiscordLink(to))?.id === `d${id}` && (await getTwitchUserByDiscordId(`d${id}`)) === to, at('the Discord link moved and points at the new login'));
  ok((await kv.hget('stats:last', to)) !== null, at('last seen moved'));
  const ranks = ((await kv.get<Record<string, unknown>>(`digest:ranks:${seasons[0].id}`)) ?? {});
  ok(to in ranks && !(login in ranks), at('the digest rank moved'));
  const snaps = await listUserSnapshots(to);
  ok(snaps.length >= 1 && snaps.every(s => !s.profile || s.profile.username === to), at('restore points moved, with the profile renamed'));
  ok(((await kv.smembers('watch:idx:3')) as string[]).includes(to) && !((await kv.smembers('watch:idx:3')) as string[]).includes(login), at('the watch index follows'));

  // Hidden, trades, registry, access.
  const hidden = await getHiddenUsers();
  ok(hidden.has(to) === wantHidden && !hidden.has(login), at('the new login is hidden as expected, the old one is not'));
  const open = await trades.listOpenTrades();
  ok(!open.some(t => t.from === login || t.to === login || t.from === to || t.to === to), at('open offers were cancelled'));
  const history = await trades.tradeHistory();
  ok(!history.some(t => t.from === login || t.to === login || t.resolvedBy === login), at('trade history no longer names the old login'));
  ok(history.filter(t => t.from === to || t.to === to).length === 3, at('trade history names the new login in all three offers'));
  ok((await kv.hget('acct:ids', id)) === to, at('acct:ids points the Twitch ID at the new login'));
  const aside = ((await kv.hget('acct:aside', to)) as { id: string; login: string; reason: string } | null);
  if (mode === 'aside') ok(aside?.id === id && aside.login === login && aside.reason.length > 0, at('acct:aside records the move'));
  else ok(aside === null && (await kv.hget('acct:aside', login)) === null, at('a rename leaves no aside record, and a restore deletes it'));
  if (!login.includes('~')) ok(((await prodKv.hget('staff:ids', login)) as { id?: string } | null)?.id === id, at('the staff record is pinned to the Twitch ID'));
  ok(!(await getTester(login)), at('the old login has no tester record'));
  eq((await getTester(to))?.tier ?? null, mode === 'aside' ? null : 'alpha', at('the tester record follows a rename, never a move aside'));
  ok((await allKeys('twitch_opaque:*')).length === 0 || (await kv.get(`twitch_opaque:U${id}`)) === null, at('the extension link is gone'));
  ok((await kv.hget('acct:moves', login)) === null && !(await move.listUnfinishedMoves()).some(m => m.from === login), at('the journal is cleared'));
}

// ── A clean move ──
{
  const login = 'mover0';
  const { id, before } = await seed(login);
  const r = await move.moveAside(login, 'a second person used the login');
  ok(r.ok && r.to === `${login}~1`, `moveAside picks ~1 (${JSON.stringify(r)})`);
  if (r.ok) ok(r.cards === before.owned.reduce((s, l) => s + l.length, 0), 'the report counts the cards that moved');
  await assertMoved(login, `${login}~1`, id, before, 'clean');
  ok((await move.listAsideAccounts()).some(a => a.to === `${login}~1` && a.login === login), 'the aside list shows it');
  // The login is now empty, so a repeat has nothing to move.
  ok(!(await move.moveAside(login, 'again')).ok, 'a second move of an emptied login is refused');
}

// ── A move that fails after each step carries on to the same end state ──
const points = ['trades', 'snapshot', 'staff', 'collections:blob', 'collections', 'history', 'user', 'shared', 'registry'];
for (const [i, point] of points.entries()) {
  const login = `resume${i}`;
  const { id, before } = await seed(login);
  const to = `${login}~1`;
  const first = await move.moveAccount(login, to, { reason: 'resume check', failAfter: point });
  ok(!first.ok, `the move stops after ${point}`);
  const open = (await move.listUnfinishedMoves()).find(m => m.from === login);
  ok(open && open.to === to, `${point}: the journal is left behind`);
  // A different target is ignored while a journal exists; half the runs resume through finishMove, half through moveAside.
  const second = i % 2 === 0 ? await move.finishMove(login) : await move.moveAside(login, 'resume check');
  ok(second.ok && second.to === to, `${point}: the move finishes (${JSON.stringify(second)})`);
  await assertMoved(login, to, id, before, `after ${point}`);
}

// ── Moving aside makes the account hidden, private and tagged "(former)"; restoring it (a rename back) hands back what it was ──
{
  const login = 'plain0';
  const { id, before } = await seed(login, true);
  ok((await move.moveAside(login, 'plain')).ok, 'a plain account moves aside');
  await assertMoved(login, `${login}~1`, id, before, 'plain aside', { mode: 'aside', hidden: true });
  eq(((await kv.hget('acct:aside', `${login}~1`)) as { flags: unknown }).flags, { adminHidden: false, selfHidden: false }, 'the flags it had are saved in the aside record');
  ok(((await move.getAsideAccount(`${login}~1`))?.tester?.tier) === 'alpha', 'its dropped tester record is saved there too');
  // The owner returns under another login that holds a blank profile (no cards): the restore replaces it and clears the forced flags.
  await kvLib.saveUserProfile({ username: 'plainnew', displayName: 'Blank New', twitchId: id, createdAt: 2 });
  const back = await move.moveAccount(`${login}~1`, 'plainnew', { mode: 'rename', replaceBlank: true, reason: 'Restored by its owner' });
  ok(back.ok && back.to === 'plainnew', `the restore works (${JSON.stringify(back)})`);
  await assertMoved(`${login}~1`, 'plainnew', id, before, 'plain restore', { mode: 'rename', hidden: false });
  ok(!(await move.getAsideAccount(`${login}~1`)) && !(await move.listAsideAccounts()).some(a => a.to === `${login}~1`), 'the aside record is deleted');
}
{
  const login = 'recl1'; // private and admin-hidden before it was moved aside: both come back
  const { id, before } = await seed(login);
  ok((await move.moveAside(login, 'again')).ok, 'a hidden, private account moves aside');
  eq(((await kv.hget('acct:aside', `${login}~1`)) as { flags: unknown }).flags, { adminHidden: true, selfHidden: true }, 'its flags are saved');
  const back = await move.moveAccount(`${login}~1`, 'back1', { mode: 'rename', replaceBlank: true, reason: 'Restored by its owner' });
  ok(back.ok, 'it is restored onto a login with no profile at all');
  await assertMoved(`${login}~1`, 'back1', id, before, 'hidden restore', { mode: 'rename', hidden: true });
}

// ── A rename (Twitch changed the login) moves a normal login and forces nothing ──
for (const [i, plain] of [true, false].entries()) {
  const login = `ren${i}`, to = `mv${i}`;
  const { id, before } = await seed(login, plain);
  const r = await move.moveAccount(login, to, { mode: 'rename', replaceBlank: true, reason: 'Twitch name changed' });
  ok(r.ok && r.to === to, `the rename works (${JSON.stringify(r)})`);
  await assertMoved(login, to, id, before, `rename ${i}`, { mode: 'rename', hidden: !plain });
  ok(!(await move.listAsideAccounts()).some(a => a.to === to), 'a rename is not listed as moved aside');
}
{
  // A rename that stops part way finishes through its journal with the same mode (and the tester record and flags it read at the start).
  for (const [i, point] of ['collections', 'user', 'shared', 'registry'].entries()) {
    const login = `renres${i}`, to = `rr${i}to`;
    const plain = i % 2 === 0;
    const { id, before } = await seed(login, plain);
    await kvLib.saveUserProfile({ username: to, displayName: 'Blank', twitchId: id, createdAt: 2 });
    const first = await move.moveAccount(login, to, { mode: 'rename', replaceBlank: true, reason: 'resume rename', failAfter: point });
    ok(!first.ok, `the rename stops after ${point}`);
    ok((await move.listUnfinishedMoves()).some(m => m.from === login && m.mode === 'rename' && m.replaceBlank), `${point}: the journal keeps the mode`);
    const second = await move.finishMove(login);
    ok(second.ok && second.to === to, `${point}: the rename finishes (${JSON.stringify(second)})`);
    await assertMoved(login, to, id, before, `rename after ${point}`, { mode: 'rename', hidden: !plain });
  }
}

// ── Refusals and names ──
ok(!(await move.moveAccount('mover0~1', 'anything', { reason: 'x' })).ok, 'a ~ login is refused as a source');
ok(!(await move.moveAside('mover0~1', 'x')).ok, 'moveAside refuses a ~ login too');
ok(!(await move.moveAccount('ghost', 'ghost~1', { reason: 'x' })).ok, 'an empty login is refused');
await kvLib.saveUserProfile({ username: 'solo', displayName: 'Solo', createdAt: 1 });
await kvLib.saveUserProfile({ username: 'solo~1', displayName: 'Taken', createdAt: 1 });
const busy = await move.moveAccount('solo', 'solo~1', { reason: 'x' });
ok(!busy.ok, 'a target that holds a profile is refused');
ok(!!(await kvLib.getUserProfile('solo')) && (await kvLib.getUserProfile('solo~1'))?.displayName === 'Taken', 'a refused move changes nothing');
const picked = await move.moveAside('solo', 'x');
ok(picked.ok && picked.to === 'solo~2', `moveAside skips a taken ~1 and picks ~2 (${JSON.stringify(picked)})`);
ok(!(await kvLib.getUserProfile('solo')) && !!(await kvLib.getUserProfile('solo~2')), 'a profile with no cards moves too');
const cardsTarget = 'pal';
ok(!(await move.moveAccount('solo~2', cardsTarget, { reason: 'x' })).ok, 'a ~ source is refused even with a real target');
await kvLib.saveUserProfile({ username: 'lone', displayName: 'Lone', createdAt: 1 });
ok(!(await move.moveAccount('lone', 'pal', { reason: 'x' })).ok, 'a target that holds cards is refused');
ok(!(await move.moveAccount('lone', 'pal', { mode: 'rename', replaceBlank: true, reason: 'x' })).ok, 'a blank-replacing move still refuses a target that holds cards');
ok(!(await move.moveAccount('lone', 'lone~1', { mode: 'rename', reason: 'x' })).ok, 'a rename never targets a ~ login');
await kvLib.saveUserProfile({ username: 'blankt', displayName: 'Blank', createdAt: 1 });
ok(!(await move.moveAccount('lone', 'blankt', { mode: 'rename', reason: 'x' })).ok, 'a target profile is only replaced when asked to');
ok(!!(await kvLib.getUserProfile('lone')) && (await kvLib.getUserProfile('blankt'))?.displayName === 'Blank', 'the refusals changed nothing');
eq(await move.listUnfinishedMoves(), [], 'no unfinished moves are left');

console.log(`check-account-move: ${checks} checks passed`);
