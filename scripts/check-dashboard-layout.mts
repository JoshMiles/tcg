// Checks the per-person dashboard layout: own key, fallback to the shared layout, the password login, and team layouts.
// Needs the mock KV (node scripts/mock-kv.cjs) with KV_REST_API_URL / KV_REST_API_TOKEN pointing at it.
// Run: npx tsx scripts/check-dashboard-layout.mts
process.env.KV_REST_API_URL ||= 'http://localhost:4111';
process.env.KV_REST_API_TOKEN ||= 'dev';
process.env.KV_URL ||= 'redis://dev';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const data = await import('../lib/dashboard-data');
const dash = await import('../lib/dashboard');

const minimal = { widgets: [{ type: 'overview' as const, span: 12 }] };
const other = { widgets: [{ type: 'attention' as const, span: 12 }] };

ok(dash.loginForLayout({ login: 'sam', via: 'twitch' }) === 'sam', 'a Twitch staff member uses their own login');
ok(dash.loginForLayout({ login: 'password', via: 'password' }) === null && dash.loginForLayout(null) === null, 'the password login and nobody use the shared layout');
ok(data.layoutKeyFor('Sam') === data.layoutKeyFor('sam') && data.layoutKeyFor('sam') !== 'admin:dashboard', 'keys are per login, case-insensitive');
ok(data.layoutKeyFor('notes') !== 'admin:dashboard:notes' && data.layoutKeyFor('presets') !== 'admin:dashboard:presets', 'a login named notes or presets cannot hit those keys');
ok(data.layoutKeyFor(null) === 'admin:dashboard', 'no login is the shared key');

ok(JSON.stringify(await data.getDashboardLayout('sam')) === JSON.stringify(dash.DEFAULT_LAYOUT), 'nothing saved: the default');
await data.saveDashboardLayout(minimal, null); // the layout everyone had before
ok((await data.getDashboardLayout('sam')).widgets.length === 1, 'a person with no layout of their own gets the shared one');
await data.saveDashboardLayout(other, 'sam');
ok((await data.getDashboardLayout('sam')).widgets[0].type === 'attention', 'their own layout wins');
ok((await data.getDashboardLayout('jo')).widgets[0].type === 'overview', 'saving does not touch anyone else');
ok((await data.getDashboardLayout(null)).widgets[0].type === 'overview', 'nor the shared layout');
await data.resetDashboardLayout('sam');
ok((await data.getDashboardLayout('sam')).widgets[0].type === 'overview', 'resetting returns to the shared layout');

await data.saveDashboardPreset('Stream day', minimal, 'sam');
const presets = await data.getDashboardPresets();
ok(presets[0].name === 'Stream day' && presets[0].by === 'sam', 'team layouts remember who saved them');
await data.saveDashboardPreset('Old one', minimal);
ok((await data.getDashboardPresets()).find(p => p.name === 'Old one')?.by === undefined, 'older team layouts have no author');
console.log('ok');
