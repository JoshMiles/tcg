// Pure checks for a copy's journey. Run: npx tsx scripts/check-provenance.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const { buildProvenance, spanText } = await import('../lib/provenance');
const H = 3_600_000;
const t0 = 1_000_000_000_000;

// alice pulls it, offers it, bob takes it (traded: who = alice, to = bob), bob keeps it.
const copy = {
  at: t0, owner: 'bob',
  ev: [
    { t: t0, type: 'minted' as const, who: 'alice' },
    { t: t0 + 10 * H, type: 'escrowed' as const, who: 'alice' },
    { t: t0 + 11 * H, type: 'traded' as const, who: 'alice', to: 'bob' },
  ],
};
const p = buildProvenance(copy, t0 + 35 * H);
ok(p.steps.map(s => s.kind).join() === 'made,offered,passed', 'steps in order');
ok(p.holders.join() === 'alice,bob', 'holders in order, once each');
ok(p.trades === 1, 'one completed trade');
ok(p.steps[0].heldMs === 10 * H, 'alice kept it until she offered it');
ok(p.steps[2].heldMs === 24 * H, 'bob has kept it since the trade, up to now');
ok(p.longest?.who === 'bob' && p.longest.ms === 24 * H, 'bob held it longest');
ok(p.ageMs === 35 * H && p.state === 'held', 'age and state');

// A declined offer comes back to alice; the time in escrow is nobody's.
const back = buildProvenance({ at: t0, owner: 'alice', ev: [
  { t: t0, type: 'minted', who: 'alice' }, { t: t0 + H, type: 'escrowed', who: 'alice' }, { t: t0 + 3 * H, type: 'returned', who: 'alice' },
] }, t0 + 4 * H);
ok(back.trades === 0 && back.holders.join() === 'alice', 'a refund is not a trade');
ok(back.steps[0].heldMs === H && back.steps[2].heldMs === H, 'escrow time is not counted as held');
ok(back.longest?.who === 'alice' && back.longest.ms === 2 * H, 'held time adds up across stints');

// In a trade offer right now, and a copy that was spent in an upgrade.
ok(buildProvenance({ at: t0, owner: 'escrow:abc', ev: [{ t: t0, type: 'minted', who: 'a' }, { t: t0 + H, type: 'escrowed', who: 'a' }] }, t0 + 2 * H).state === 'offer', 'in an offer');
const gone = buildProvenance({ at: t0, owner: '', ev: [{ t: t0, type: 'minted', who: 'a' }, { t: t0 + 5 * H, type: 'upgraded', who: 'a', note: '4.1.2' }] }, t0 + 99 * H);
ok(gone.state === 'gone' && gone.steps[1].kind === 'forged' && gone.steps[1].into === '4.1.2' && gone.ageMs === 5 * H, 'forged copies stop ageing');
ok(gone.steps[0].heldMs === 5 * H, 'held until forged');

ok(spanText(30_000) === 'under a minute' && spanText(5 * 60_000) === '5 minutes' && spanText(3 * H) === '3 hours' && spanText(72 * H) === '3 days' && spanText(H) === '1 hour', 'span wording');
console.log('provenance checks passed');
