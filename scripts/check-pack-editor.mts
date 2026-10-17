// The pack workspace's core and save (ROADMAP 20.2a): change sets apply the same way on both sides, card numbers are kept and new ones
// assigned, the revision check, a held card's number and removal, the review lines, rebasing onto someone else's save, and the audit entry.
// Needs the mock KV (npm run check starts it); refuses anything non-local. Run: npx tsx scripts/check-pack-editor.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const kvLib = await import('../lib/kv');
const core = await import('../lib/pack-editor-core');
const { savePackChangesCore } = await import('../lib/pack-save');
const { getUserAudit } = await import('../lib/audit');
const { DEFAULT_UPGRADE_COSTS, DEFAULT_VARIANT_WEIGHTS, encodeEntry } = await import('../lib/variants');

const pack = { id: 'pk', name: 'Base', coverImageUrl: '', active: true, status: 'published' as const, weight: 1, accentColor: '', tearBorderColor: '', holoMinStars: 5, cardTime: 3, cooldownTime: 1, soundVolume: 1, createdAt: 1, upgradesEnabled: false, variantWeights: DEFAULT_VARIANT_WEIGHTS, upgradeCosts: DEFAULT_UPGRADE_COSTS };
const card = (n: number) => ({ id: `c${n}`, number: n, name: `Card ${n}`, imageUrl: `/a/${n}.png`, probability: 10, stars: 1 + (n % 5), upgradesEnabled: true });
await kvLib.savePack(pack as never);
await kvLib.savePackCards('pk', [1, 2, 3].map(card) as never);

// ── The revision counter: every write to the pack or its cards raises it ──
const r0 = await kvLib.getPackRev('pk');
ok(r0 >= 2, 'saving the pack and its cards raised the revision');
await kvLib.savePackCards('pk', (await kvLib.getPackCards('pk')));
ok(await kvLib.getPackRev('pk') === r0 + 1, 'a card write raises it by one');

// ── Change sets: the diff, the apply, the numbers ──
const pk = (await kvLib.getPack('pk'))!;
const cards = await kvLib.getPackCards('pk');
const base = core.workOf(pk, cards);
ok(core.isEmptyChange(core.diffChanges(base, base)), 'no edit, no change');
const work: typeof base = {
  pack: { ...base.pack, name: 'Base v2', weight: 2 },
  cards: [
    ...base.cards.filter(c => c.id !== 'c2'),
    core.newWorkCard('new1', { name: 'Fresh', stars: 3, probability: 5, imageUrl: '/a/new.png' }),
  ].map(c => (c.id === 'c1' ? { ...c, name: 'Renamed', stars: 4 } : c)),
};
const cs = core.diffChanges(base, work);
ok(Object.keys(cs.pack).sort().join() === 'name,weight', 'only the changed pack fields are in the change set');
ok(cs.remove.join() === 'c2' && cs.add.length === 1 && Object.keys(cs.update.c1 ?? {}).sort().join() === 'name,stars', 'adds, removes and changed fields');
const applied = core.applyChanges(pk, cards, cs);
ok(applied.cards.find(c => c.id === 'c1')?.number === 1 && applied.cards.find(c => c.id === 'c3')?.number === 3, 'existing cards keep their numbers');
ok(applied.assigned.new1 === 4, 'a new card gets the next number above everything that existed (the removed #2 is not reused)');
ok(applied.cards.map(c => c.number).join() === '1,3,4', 'cards are in number order');
ok(applied.pack.name === 'Base v2' && applied.pack.weight === 2, 'pack fields applied');
ok(core.applyChanges(pk, cards, { ...cs, pack: { weight: -5 } }).pack.weight === 0.01, 'pack fields are cleaned by the same rules as the forms');
ok(core.applyChanges(pk, cards, { pack: {}, add: [core.newWorkCard('x', { name: '' })], update: {}, remove: [] }).problems.some(p => p.id === 'x'), 'a new card without a name is a problem');
ok(core.applyChanges(pk, cards, { pack: {}, add: [], update: { c1: { name: 'Fine' } }, remove: [] }).problems.length === 0, 'a clean edit has no problems');
const lines = core.reviewLines(base, work);
ok(lines.some(l => l.scope === 'Pack' && l.field === 'Name' && l.from === 'Base' && l.to === 'Base v2'), 'review shows old -> new for the pack');
ok(lines.some(l => l.field === 'Stars' && l.from === '2' && l.to === '4') && lines.some(l => l.to === 'removed') && lines.some(l => l.to === 'added'), 'review lists card edits, removals and additions');

// ── Rebase onto someone else's save ──
const theirs = core.workOf(pk, cards);
theirs.pack = { ...theirs.pack, weight: 3 };
theirs.cards = theirs.cards.map(c => (c.id === 'c3' ? { ...c, name: 'Theirs' } : c));
const rb = core.rebase(base, theirs, cs);
ok(rb.work.pack.name === 'Base v2' && rb.work.pack.weight === 3 && rb.clashes.some(c => c.includes('Draw weight')), 'a clashing pack field keeps their value and is listed');
ok(rb.work.cards.find(c => c.id === 'c3')?.name === 'Theirs' && rb.work.cards.find(c => c.id === 'c1')?.name === 'Renamed' && rb.work.cards.some(c => c.id === 'new1') && !rb.work.cards.some(c => c.id === 'c2'), 'non-clashing edits, additions and removals are kept');

// ── Saving: revision, held cards, audit ──
const stale = await savePackChangesCore('pk', (await kvLib.getPackRev('pk')) - 1, cs);
ok(!stale.ok && stale.kind === 'conflict', 'a stale revision is refused');
ok((await kvLib.getPack('pk'))!.name === 'Base', 'and nothing was written');

await kvLib.saveSeason({ id: 's1', name: 'S1', collectionName: 'S1', active: false, status: 'published', createdAt: 1, maxConcurrentPacks: 1, packIds: ['pk'] } as never);
await kvLib.saveCollection('S1', { alice: [encodeEntry(3, 'regular')] });

const renum = await savePackChangesCore('pk', await kvLib.getPackRev('pk'), { pack: {}, add: [], update: { c3: { number: 9 } }, remove: [] });
ok(!renum.ok && renum.kind === 'held', "a card viewers hold can't be renumbered");
const del = await savePackChangesCore('pk', await kvLib.getPackRev('pk'), { pack: {}, add: [], update: {}, remove: ['c3'] });
ok(!del.ok && del.kind === 'held' && (await kvLib.getPackCards('pk')).some(c => c.id === 'c3'), 'removing a held card needs confirmation');
const bad = await savePackChangesCore('pk', await kvLib.getPackRev('pk'), { pack: {}, add: [], update: { c1: { name: '' } }, remove: [] });
ok(!bad.ok && bad.kind === 'invalid' && bad.problems?.[0].id === 'c1', 'a published pack refuses a touched card that fails its checks');

const good = await savePackChangesCore('pk', await kvLib.getPackRev('pk'), cs.remove.includes('c3') ? { ...cs, remove: [] } : cs);
ok(good.ok && good.assigned.new1 === 4 && good.state.work.cards.some(c => c.name === 'Renamed'), 'a good save applies and returns the numbers');
ok(good.ok && good.state.rev === (await kvLib.getPackRev('pk')), 'and returns the new revision');
const again = await savePackChangesCore('pk', 1, { pack: {}, add: [], update: {}, remove: [] });
ok(!again.ok && again.kind === 'conflict', 'the old revision no longer works');
const audit = await getUserAudit('pack:pk');
ok(audit.length === 1 && audit[0].action === 'Pack edited' && /Base/.test(audit[0].detail ?? ''), 'an audit entry names what changed');

const held = await savePackChangesCore('pk', await kvLib.getPackRev('pk'), { pack: {}, add: [], update: {}, remove: ['c3'] }, { confirmHeld: true });
ok(held.ok && !held.state.work.cards.some(c => c.id === 'c3'), 'a held card can be removed once confirmed');

// ── Drafts keep whatever is there (autosave) ──
await kvLib.savePack({ ...pack, id: 'dr', status: 'draft', name: '' } as never);
const draft = await savePackChangesCore('dr', await kvLib.getPackRev('dr'), { pack: {}, add: [core.newWorkCard('d1', { name: '' })], update: {}, remove: [] });
ok(draft.ok && draft.state.work.cards[0].number === 1, 'a draft saves an unfinished card and numbers it');

// ── Bulk edits (20.2c) ──
const bc = [1, 2, 3].map(n => core.newWorkCard(`b${n}`, { number: n, name: `B${n}`, probability: 10, stars: 1 }));
const pick = new Set(['b1', 'b3']);
ok(core.bulkApply(bc, pick, { kind: 'stars', value: 9 }).map(c => c.stars).join() === '5,1,5' || core.bulkApply(bc, pick, { kind: 'stars', value: 9 }).map(c => c.stars).join() === '5,1,5', 'stars are set on the selected cards only, clamped to 5');
ok(core.bulkApply(bc, pick, { kind: 'weight', value: 7 }).map(c => c.probability).join() === '7,10,7', 'weight set');
ok(core.bulkApply(bc, pick, { kind: 'weight', value: -1 }).map(c => c.probability).join() === '10,10,10', 'a negative weight is ignored');
ok(core.bulkApply(bc, pick, { kind: 'multiply', factor: 0.5 }).map(c => c.probability).join() === '5,10,5', 'weights multiplied');
const off = core.bulkApply(bc, pick, { kind: 'version', variant: 'shiny', on: false });
ok(off[0].disabledVariants.join() === 'shiny' && off[1].disabledVariants.length === 0 && core.bulkApply(off, pick, { kind: 'version', variant: 'shiny', on: true })[0].disabledVariants.length === 0, 'a version is switched off and on');
const snd = core.bulkApply(bc, new Set(['b1', 'b2']), { kind: 'sound', mode: 'default' });
ok(snd[0].soundUrl === '/assets/sounds/1.mp3' && core.bulkApply(snd, pick, { kind: 'sound', mode: 'clear' })[0].soundUrl === '', 'default sound is the numbered file; clear removes it');
ok(core.bulkApply([core.newWorkCard('z', { number: 99 })], new Set(['z']), { kind: 'sound', mode: 'default' })[0].soundUrl === '', 'a card with no bundled sound is left alone');
ok(core.bulkApply(bc, pick, { kind: 'upgrades', on: false }).map(c => c.upgradesEnabled).join() === 'false,true,false', 'upgrades opt-out');
ok(core.pastedColumn('a\nb\n').join('|') === 'a|b' && core.pastedColumn('x\ty\r\nz').join('|') === 'x|z', 'a pasted column is one value per line, first column of each');

// ── Odds view maths (20.2d) ──
const odds = await import('../lib/odds-core');
const maths = await import('../lib/card-maths');
const oc = [{ id: 'a', stars: 5, probability: 1 }, { id: 'b', stars: 3, probability: 3 }, { id: 'c', stars: 3, probability: 6 }];
ok(odds.normalizeWeights(oc).a === 10 && odds.normalizeWeights(oc).c === 60, 'normalize scales the weights to add up to 100');
ok(odds.normalizeWeights([{ id: 'z', stars: 1, probability: 0 }]).z === 0, 'normalize leaves an all-zero pack alone');
const bal = odds.balanceByRarity(oc, { 5: 10, 3: 90 });
ok(bal.a === 10 && bal.b === 45 && bal.c === 45, 'balance gives each rarity its share, split equally among its cards');
ok(maths.totalWeight([1, -2, 3]) === 4 && maths.shareOf(1, 4) === 0.25 && maths.shareOf(0, 4) === 0 && maths.oneInLabel(1, 4) === '1 in 4' && maths.oneInLabel(0, 4) === '-', 'chance maths: total, share and "1 in N"');
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const sim = odds.simulate(oc, () => ({ regular: 1, reverse: 0, full: 0, shiny: 0 }), true, 20_000, rnd)!;
ok(Math.abs(sim.perCard.c / sim.draws - 0.6) < 0.02 && Math.abs(sim.perStars[5] / sim.draws - 0.1) < 0.02, 'the simulator follows the weights');
ok(sim.perVariant.regular === sim.draws && sim.fullSet !== null && sim.fullSet.median >= 3, 'variant rolls follow the version weights; the full-set estimate is sane');
ok(odds.simulate([{ id: 'x', stars: 1, probability: 0 }], () => undefined, false, 10) === null, 'nothing to draw gives no result');

console.log('pack editor checks passed');
