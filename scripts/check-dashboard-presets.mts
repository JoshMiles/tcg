// Checks the built-in dashboard layouts: each one is already clean (sanitizing changes nothing) and uses the widgets it should.
// Run: npx tsx scripts/check-dashboard-presets.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const d = await import('../lib/dashboard');

const names = d.BUILTIN_PRESETS.map(p => p.name);
ok(names.join() === 'Stream night,Season overview,Trading desk,Minimal', 'the four built-in layouts');
ok(new Set(names).size === names.length, 'names are unique');
for (const p of d.BUILTIN_PRESETS) {
  ok(JSON.stringify(d.sanitizeLayout(p.layout)) === JSON.stringify(p.layout), `${p.name} sanitizes to itself (known widgets, no repeats, allowed spans)`);
  ok(p.layout.widgets.length > 0 && p.name.length <= 30, `${p.name} is not empty and its name fits`);
}
const types = (n: string) => d.BUILTIN_PRESETS.find(p => p.name === n)!.layout.widgets.map(w => w.type).sort().join();
const want = (...t: string[]) => t.sort().join();
ok(types('Stream night') === want('live', 'overlay-controls', 'activity', 'pulls-chart', 'quick-actions', 'recap'), 'Stream night widgets');
ok(types('Season overview') === want('overview', 'pulls-chart', 'top-collectors', 'rarity', 'packs', 'card-ownership', 'digest'), 'Season overview widgets');
ok(types('Trading desk') === want('trades', 'attention', 'activity', 'leaderboard'), 'Trading desk widgets');
ok(types('Minimal') === want('overview', 'attention', 'quick-actions'), 'Minimal widgets');
console.log('ok');
