// Checks the admin Settings helpers: scoring preview, scoring clamping, the environment checklist and the Twitch setup list.
// Pure (no database needed). Run: npx tsx scripts/check-settings.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const { DEFAULT_SCORING, SCORING_LIMITS, sanitizeScoring } = await import('../lib/scoring');
const { previewScoring } = await import('../lib/scoring-preview');
const { checkEnv, summarizeEnv, readEnv, ENV_SPECS } = await import('../lib/env-health');
const { extensionChecklist } = await import('../lib/twitch-setup');
const { encodeEntry } = await import('../lib/variants');

// ── scoring clamping ──
const wild = sanitizeScoring({ baseScore: 99999, rarityExponent: -4, serialBonusMax: 0.2, serialBonusCutoff: 2.6, leaderboardSize: 12.6, bogus: 1, completionBonusPct: 'abc' });
ok(wild.baseScore === SCORING_LIMITS.baseScore.max, 'too-big values clamp to the maximum');
ok(wild.rarityExponent === SCORING_LIMITS.rarityExponent.min, 'negative values clamp to the minimum');
ok(wild.serialBonusMax >= 1 && Number.isInteger(wild.serialBonusCutoff), 'the serial bonus never goes below 1x and its cutoff is a whole number');
ok(Number.isInteger(wild.leaderboardSize), 'leaderboard size is a whole number');
eq(wild.completionBonusPct, DEFAULT_SCORING.completionBonusPct, 'junk falls back to the default');
eq(sanitizeScoring({ baseScore: '25' }).baseScore, 25, 'numeric strings from a form are accepted');
eq(DEFAULT_SCORING.serialBonusCutoff, 40, 'the edition-bonus cutoff default is 40');
eq(sanitizeScoring(undefined).serialBonusCutoff, 40, 'an empty store uses the new default');
eq(sanitizeScoring({ ...DEFAULT_SCORING, serialBonusCutoff: 20 }).serialBonusCutoff, 20, 'a saved cutoff is not replaced by the new default');

// ── scoring preview ──
const card = (id: string, number: number, probability: number) => ({ id, number, name: `C${number}`, stars: 1, probability, imageUrl: '', soundUrl: undefined }) as never;
const pack = { id: 'p', name: 'P', weight: 1, active: true, status: 'published', upgradesEnabled: false } as never;
const packs = [{ pack, cards: [card('a', 1, 50), card('b', 2, 30), card('c', 3, 20)] }];
const collection = { alice: [1, 1, 2, 3].map(n => encodeEntry(n, 'regular')), bob: [1, 1, 1, 1, 1].map(n => encodeEntry(n, 'regular')), carol: [3].map(n => encodeEntry(n, 'regular')) };
const same = previewScoring(packs, collection, DEFAULT_SCORING, DEFAULT_SCORING);
eq(same.saved, same.candidate, 'identical numbers preview identically');
eq(same.rankChanges, 0, 'no rank changes when nothing changed');
const doubled = previewScoring(packs, collection, DEFAULT_SCORING, { ...DEFAULT_SCORING, baseScore: DEFAULT_SCORING.baseScore * 2 });
// Card values are rounded to whole points, so "double" is within a few percent (small numbers round noticeably).
const near2 = (a: number, b: number) => Math.abs(a / b - 2) < 0.12;
ok(near2(doubled.candidate.setValue, doubled.saved.setValue), 'doubling the base score doubles the set value');
ok(near2(doubled.candidate.topScore, doubled.saved.topScore), 'and the top score');
eq(doubled.rankChanges, 0, 'a pure scale does not reorder viewers');
const noBonus = previewScoring(packs, collection, DEFAULT_SCORING, { ...DEFAULT_SCORING, completionBonusPct: 0, completeSetBonusPct: 0 });
ok(noBonus.candidate.completionAtFull === 0 && noBonus.candidate.completeSetBonus === 0, 'bonuses can be switched off');
ok(noBonus.candidate.topScore < noBonus.saved.topScore, 'and the completionist loses points');
const flat = previewScoring(packs, collection, DEFAULT_SCORING, { ...DEFAULT_SCORING, rarityExponent: 0 });
ok(flat.candidate.maxCardValue < flat.saved.maxCardValue, 'flattening rarity lowers the rarest card');
const hiddenOut = previewScoring(packs, collection, DEFAULT_SCORING, DEFAULT_SCORING, new Set(['alice']));
ok(!hiddenOut.saved.top.some(t => t.username === 'alice') && hiddenOut.viewers === 2, 'hidden viewers are left out');
eq(previewScoring(packs, collection, DEFAULT_SCORING, { baseScore: 9999999 }).candidateSettings.baseScore, SCORING_LIMITS.baseScore.max, 'the candidate is clamped like a save would');

// ── environment checklist ──
const none = checkEnv({});
ok(none.length === ENV_SPECS.length && none.every(c => !c.set), 'nothing set');
const s0 = summarizeEnv(none);
ok(!s0.ready && s0.requiredMissing === ENV_SPECS.filter(s => s.level === 'required').length, 'required variables are counted');
const full = checkEnv(Object.fromEntries(ENV_SPECS.map(s => [s.name, 'x'.repeat(40)])));
ok(summarizeEnv(full).ready && summarizeEnv(full).recommendedMissing === 0 && summarizeEnv(full).weak === 0, 'everything set');
const { ENV_GROUPS } = await import('../lib/env-health');
ok(ENV_GROUPS.includes('Discord'), 'Discord is an env group');
ok(['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_BOT_TOKEN'].every(n => ENV_SPECS.some(s => s.name === n && s.group === 'Discord')), 'the three Discord variables are listed');
const weak = checkEnv({ SESSION_SECRET: 'short', ADMIN_SECRET: '   ' });
ok(weak.find(c => c.name === 'SESSION_SECRET')?.weak === true, 'a short secret is flagged weak');
ok(weak.find(c => c.name === 'ADMIN_SECRET')?.set === false, 'whitespace does not count as set');
ok(!JSON.stringify(full).includes('xxxxxxxx'), 'values never appear in the report');
eq(readEnv({ VERCEL_BLOB_RW_TOKEN: 't' } as never).BLOB_READ_WRITE_TOKEN, 't', 'the alternate Blob token name counts');

// ── Twitch setup list ──
const list = extensionChecklist('https://example.test');
ok(list.every(i => i.value.startsWith('https://example.test')), 'every value is on the site origin');
ok(list.find(i => i.id === 'redirect')?.value === 'https://example.test/auth/twitch/callback', 'OAuth redirect URL');
ok(['panel', 'mobile', 'video', 'privacy', 'terms', 'fetch', 'redirect'].every(id => list.some(i => i.id === id)), 'all setup items present');
ok(new Set(list.map(i => i.id)).size === list.length, 'ids are unique');
console.log('settings checks passed');
