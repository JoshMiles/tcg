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

// ── Import a folder of art (20.2e) ──
const imp = await import('../lib/art-import');
const P = imp.parseArtFileName;
ok(P('012 Gouda Goat.webp').title === 'Gouda Goat' && P('012 Gouda Goat.webp').number === 12 && P('012 Gouda Goat.webp').kind === 'art', '"012 Gouda Goat.webp": number 12, name Gouda Goat');
ok(P('12-gouda-goat.gif').title === 'Gouda Goat' && P('12-gouda-goat.gif').number === 12, '"12-gouda-goat.gif" is the same card');
ok(P('gouda_goat.png').title === 'Gouda Goat' && P('gouda_goat.png').number === undefined && P('Gouda Goat.PNG').key === 'gouda goat', '"gouda_goat.png" has no number; case and extension case do not matter');
ok(['gouda-fa.png', 'gouda_fullart.webp', 'Gouda full art.png', 'gouda-full-art.png', '07 Gouda FA.png'].every(n => P(n).kind === 'fullart' && P(n).key === 'gouda'), 'fa, fullart and full art suffixes make full art of the card with the same name');
ok(P('07 Gouda FA.png').number === 7 && P('fa.png').kind === 'art', 'a number is kept on a full art file; a file that is only "fa" is a card');
ok(P('Gouda Goat.mp3').kind === 'sound' && P('gouda_goat.WAV').kind === 'sound' && P('x.ogg').kind === 'sound' && P('gouda-fa.mp3').kind === 'sound', 'audio files are sounds');
ok(P('notes.txt').kind === 'other' && P('folder/sub/Cheddar.png').title === 'Cheddar' && P('7.png').title === '' && P('7.png').number === 7, 'other files are not used; folders are dropped from the name; a number alone gives no name');
const exist = [{ id: 'e1', number: 1, name: 'Cheddar' }, { id: 'e2', number: 5, name: 'Brie' }];
const f = (name: string, size = 1000) => ({ name, size });
const plan = imp.planImport([f('012 Gouda Goat.webp'), f('gouda_goat-fa.png'), f('gouda goat.mp3'), f('5 Swiss.png'), f('brie.ogg'), f('cheddar-fullart.webp'), f('mystery.mp3'), f('readme.txt'), f('Huge.png', 9 * 1024 * 1024)], exist);
const byName = (n: string) => plan.find(r => r.name === n && r.kind === 'new')!;
ok(byName('Gouda Goat').number === 12 && byName('Gouda Goat').problems.length === 0, 'a free leading number becomes the number');
ok(byName('Swiss').number === 6 && byName('Swiss').problems.some(p => p.includes('#5')), 'a used number gives the next free one, with a note');
const gfa = plan.find(r => r.kind === 'fullart' && r.name === 'Gouda Goat')!;
ok(!!gfa.target && 'file' in gfa.target && gfa.targetName === 'Gouda Goat', 'full art attaches to the new card of the same name in the drop');
ok(plan.filter(r => r.kind === 'sound').find(r => r.name === 'Gouda Goat')!.target !== undefined && plan.find(r => r.kind === 'sound' && r.name === 'Brie')!.target?.hasOwnProperty('existing'), 'a sound attaches to a new card or to one already in the pack');
ok(plan.find(r => r.kind === 'fullart' && r.name === 'Cheddar')!.target?.hasOwnProperty('existing'), 'full art attaches to an existing card');
const orphan = plan.find(r => r.name === 'Mystery')!;
ok(orphan.skip && orphan.problems[0].includes('No card named') && imp.blocked(orphan), 'a sound with no card is left out, with the reason');
ok(plan.find(r => r.skip && r.problems[0].includes('Not a picture'))!.name === 'readme' && imp.blocked(byName('Huge')) && byName('Huge').problems.some(p => p.includes('too big')), 'an unusable file and a too big file are blocked with a reason');
ok(imp.planImport([f('Cheddar.png')], exist)[0].problems.some(p => p.includes('already exists')) && !imp.blocked(imp.planImport([f('Cheddar.png')], exist)[0]), 'a duplicate name warns but can still be imported');
const dupDrop = imp.planImport([f('1 A.png'), f('1 B.png')], []);
ok(dupDrop[0].number === 1 && dupDrop[1].number === 2, 'two files asking for the same number: the second gets the next one');
// A new card that asks for a number gets it when it is free; otherwise the next one above everything.
const ask = core.applyChanges(pk, cards, { pack: {}, update: {}, remove: [], add: [core.newWorkCard('n12', { name: 'Twelve', number: 12, imageUrl: '/a.png' }), core.newWorkCard('n2', { name: 'Two', number: 2, imageUrl: '/b.png' }), core.newWorkCard('n0', { name: 'Zero', imageUrl: '/c.png' })] });
ok(ask.assigned.n12 === 12 && ask.assigned.n2 > 3 && ask.assigned.n0 !== ask.assigned.n2 && ask.cards.length === cards.length + 3, 'a requested free number is kept; a used one and no request get the next free numbers');

// ── New pack flow & Publish checklist (20.2f) ──
const { createDraftPackCore, publishPackCore } = await import('../lib/pack-save');
const { id: draftId } = await createDraftPackCore('  Fresh Draft  ');
const freshPack = (await kvLib.getPack(draftId))!;
ok(freshPack.status === 'draft' && freshPack.name === 'Fresh Draft' && freshPack.active === true, 'createDraftPackCore creates a named draft pack that defaults to active');
const freshWork = core.workOf(freshPack, []);
const cl0 = core.publishChecklist(freshWork, { inSeason: false });
ok(!cl0.canPublish && cl0.blocking.some(i => i.id === 'cards') && cl0.items.find(i => i.id === 'name')?.ok === true, 'an empty named draft is blocked by missing cards');
const failPub = await publishPackCore(draftId, true);
ok(!failPub.ok && failPub.issues.length > 0 && (await kvLib.getPack(draftId))!.status === 'draft', 'publishPackCore refuses a draft that fails blocking checks');

// Add an imported card with upgradesEnabled (no cover, no season, imported-odds unset, full art missing art): only warnings remain
const withCard: typeof freshWork = {
  pack: { ...freshWork.pack, active: false, upgradesEnabled: true },
  cards: [core.newWorkCard('imp1', { number: 1, name: 'Gouda', imageUrl: '/g.png', probability: 1, stars: 1, upgradesEnabled: true, fullArtUrl: '' })],
};
const clWarn = core.publishChecklist(withCard, { inSeason: false, needsOddsCount: 1 });
ok(clWarn.blocking.length === 0 && clWarn.warnings.map(i => i.id).sort().join() === 'cover,full-art,imported-odds,season', 'a draft with a valid card but no cover, no season, unset imported odds, and missing full-art has 0 blockers and 4 warnings');
ok(!clWarn.canPublish, 'unaccepted warnings keep Publish disabled');
const clAccepted = core.publishChecklist(withCard, { inSeason: false, needsOddsCount: 1, warningsAccepted: true });
ok(clAccepted.canPublish, 'accepting the warnings enables Publish');

// Regular weight = 0 with upgradesEnabled is a blocker
const zeroReg = core.publishChecklist({ ...withCard, pack: { ...withCard.pack, upgradesEnabled: true, variantWeights: { ...withCard.pack.variantWeights, regular: 0 } } }, { inSeason: true, warningsAccepted: true });
ok(!zeroReg.canPublish && zeroReg.blocking.some(i => i.id === 'regular-weight'), 'Regular weight = 0 when upgrades are on is a blocking item even when warnings are accepted');

// Save the card onto the draft and publish it with active = false
const savedDraft = await savePackChangesCore(draftId, await kvLib.getPackRev(draftId), core.diffChanges(freshWork, withCard));
ok(savedDraft.ok, 'saving the draft card before publish succeeds');
const pubRes = await publishPackCore(draftId, false);
ok(pubRes.ok && pubRes.pack.id === draftId, 'publishPackCore succeeds once blocking checks pass');
const pubPack = (await kvLib.getPack(draftId))!;
ok(pubPack.status === 'published' && pubPack.active === false, 'published pack is marked published and respects active = false');

console.log('pack editor checks passed');

