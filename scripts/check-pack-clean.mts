// The pack and card forms are cleaned and checked on the server with lib/pack-clean.ts (the wizard autosave, the pack settings form and the
// card forms all share it), and which card numbers are held by viewers (they cannot be renumbered). Needs the mock KV for the last part (run-checks
// provides it); also reads the action source to make sure the forms go through it. Run: npx tsx scripts/check-pack-clean.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
import { readFileSync } from 'node:fs';
import { cardProblems, cleanPackInput, MAX_CARD_NUMBER, type PackInput } from '../lib/pack-clean';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const base: PackInput = {
  name: ' Cheese ', coverImageUrl: '', active: true, weight: 1, accentColor: '', tearBorderColor: '', holoMinStars: 5, cardTime: 3, cooldownTime: 1,
  soundVolume: 1, upgradesEnabled: false, variantWeights: { regular: 100, reverse: 25, full: 5, shiny: 1 }, upgradeCosts: { reverse: 5, full: 3, shiny: 3 },
};

// ── packs ──
const p = cleanPackInput({ ...base, soundVolume: 0, weight: -3, holoMinStars: 9, cardTime: 0, cooldownTime: -1 });
ok(p.name === 'Cheese', 'the name is trimmed');
ok(p.soundVolume === 0, 'a volume of 0 is kept (it means mute)');
ok(p.weight === 0.01, 'a negative draw weight is brought up to the smallest allowed');
ok(p.holoMinStars === 5, 'holo min stars is at most 5');
ok(p.cardTime === 1 && p.cooldownTime === 0, 'times are brought inside their ranges');
ok(cleanPackInput({ ...base, soundVolume: 7 }).soundVolume === 1, 'a volume above 1 becomes 1');
ok(cleanPackInput({ ...base, soundVolume: NaN }).soundVolume === 1 && cleanPackInput({ ...base, weight: NaN }).weight === 1, 'a non-number becomes the default');
ok(cleanPackInput({ ...base, upgradeCosts: { reverse: 0, full: 2.7, shiny: -1 } }).upgradeCosts.full === 2, 'upgrade costs are whole numbers of at least 1');
ok(cleanPackInput({ ...base, name: '   ' }).name === '', 'a blank name comes out empty, so the caller can refuse it');

// ── cards ──
const card = { name: 'Gouda', stars: 3, probability: 10, number: 4 };
ok(cardProblems(card, [1, 2, 3]).length === 0, 'a good card has no problems');
ok(cardProblems({ ...card, name: '  ' }, []).length === 1, 'a blank name is a problem');
ok(cardProblems({ ...card, stars: 9 }, []).length === 1 && cardProblems({ ...card, stars: 2.5 }, []).length === 1 && cardProblems({ ...card, stars: NaN }, []).length === 1, 'stars must be a whole number from 1 to 5');
ok(cardProblems({ ...card, probability: -4 }, []).length === 1 && cardProblems({ ...card, probability: NaN }, []).length === 1, 'odds cannot be negative or not a number');
ok(cardProblems({ ...card, probability: 0 }, []).length === 0, 'odds of 0 are allowed (the editor warns that it can never be pulled)');
ok(cardProblems({ ...card, number: 2 }, [1, 2, 3]).some(m => m.includes('#2')), 'a number another card uses is refused');
ok(cardProblems({ ...card, number: 0 }, []).length === 1 && cardProblems({ ...card, number: MAX_CARD_NUMBER + 1 }, []).length === 1 && cardProblems({ ...card, number: 1.5 }, []).length === 1, 'the number must be a whole number below the variant offset');
ok(cardProblems({ ...card, number: MAX_CARD_NUMBER }, []).length === 0, 'the largest allowed number is fine');

// ── a held card's number is fixed ──
{
  const { saveSeason, saveCollection } = await import('../lib/kv');
  const { heldCardNumbers } = await import('../lib/card-held');
  const { encodeEntry } = await import('../lib/variants');
  const season = { id: 's1', name: 'S1', collectionName: 'HeldDeck', active: false, status: 'published' as const, createdAt: 1, maxConcurrentPacks: 1, packIds: ['pk'] };
  await saveSeason(season);
  await saveSeason({ ...season, id: 's2', collectionName: 'OtherDeck', packIds: ['elsewhere'] });
  await saveCollection('HeldDeck', { ann: [encodeEntry(3, 'regular'), encodeEntry(7, 'shiny')], bob: [encodeEntry(3, 'reverse')] });
  await saveCollection('OtherDeck', { cat: [encodeEntry(9, 'regular')] });
  const held = await heldCardNumbers('pk');
  ok(held.has(3) && held.has(7), 'numbers a viewer holds are held, in any version');
  ok(!held.has(9) && !held.has(4), 'a number nobody holds, or held only in a season that does not use the pack, is free');
  ok((await heldCardNumbers('nobody')).size === 0, 'a pack in no season has nothing held');
}

// ── the forms go through it ──
const actions = readFileSync(new URL('../app/admin/actions.ts', import.meta.url), 'utf8');
const section = (from: string, to: string) => actions.slice(actions.indexOf(from), actions.indexOf(to));
ok(section('export async function updatePack', '// One-click').includes('cleanPackInput('), 'updatePack cleans the form with cleanPackInput');
ok(section('export async function addCard', 'export async function updateCard').includes('cardFromForm(') && actions.includes('cardProblems(fields'), 'addCard checks the card');
ok(section('export async function updateCard', '// ── Quick variant').includes('cardFromForm('), 'updateCard checks the card');
ok(section('export async function updateCard', '// ── Quick variant').includes('heldCardNumbers('), 'updateCard refuses to renumber a card viewers hold');
ok(!/export async function createPack\b/.test(actions), 'there is no second, unchecked way to create a pack (the wizard is the only one)');
const drafts = readFileSync(new URL('../app/admin/draft-actions.ts', import.meta.url), 'utf8');
ok(drafts.includes("from '@/lib/pack-clean'"), 'the wizard autosave uses the same cleaner');

console.log('pack-clean checks passed');
