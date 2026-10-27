// Checks which packs count as "close to complete" and the board link / give parsing. Pure.
// Run: npx tsx scripts/check-close-to-complete.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const { closePacks, boardHrefForGive, parseGive } = await import('../lib/close-to-complete');

const mk = (id: string, nums: number[]) => ({ pack: { id, name: id.toUpperCase() }, cards: nums.map(n => ({ number: n, name: `C${n}` })) });
const packs = [mk('a', [1, 2, 3, 4, 5]), mk('b', [6, 7, 8]), mk('c', [9, 10, 11, 12, 13]), mk('d', [14, 15, 16, 17, 18, 19]), mk('e', [])];
const owned = new Set([1, 2, 3, 4, 6, 7, 14, 15, 16]);

const r = closePacks(packs, owned, 3, 5);
eq(r.map(p => p.packId), ['a', 'b', 'd'], 'a and b 1 away (pack order on ties), d 3 away; c is 5 away and e is empty');
eq(r[0].missing, [{ number: 5, name: 'C5' }], 'missing card');
eq([r[0].owned, r[0].total], [4, 5], 'owned / total');
eq(closePacks(packs, new Set([...owned, 5, 8, 17, 18, 19]), 3, 5), [], 'complete packs are not close');
eq(closePacks(packs, owned, 3, 2).map(p => p.packId), ['a', 'b'], 'limit');
eq(closePacks(packs, new Set(), 3, 5), [], 'nothing owned: nothing close');

eq(boardHrefForGive([5, 8]), '/trade?tab=board&give=5,8', 'href');
eq(boardHrefForGive([5], 's 1'), '/trade?tab=board&give=5&season=s%201', 'href with season');
eq(parseGive('5, 8,x,8,-1,0,2.5'), [5, 8], 'parse drops junk and duplicates');
eq(parseGive(undefined), [], 'parse undefined');
eq(parseGive(Array.from({ length: 30 }, (_, i) => i + 1).join(',')).length, 12, 'parse caps');
console.log('close-to-complete checks passed');
