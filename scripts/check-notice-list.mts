// Checks the /notifications page's grouping and filters (pure). Run: npx tsx scripts/check-notice-list.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const c = await import('../lib/notice-list-core');
const now = new Date(2026, 9, 16, 15, 0).getTime();
const at = (d: number, h: number) => new Date(2026, 9, 16 - d, h, 0).getTime();
const n = (id: string, kind: string, t: number) => ({ id, kind, text: id, at: t }) as never;
const list = [n('a', 'offer', at(0, 9)), n('b', 'accepted', at(0, 12)), n('c', 'watch', at(1, 23)), n('d', 'admin', at(5, 8))];
const g = c.groupByDay(list, now);
eq(g.map(x => x.label).slice(0, 2), ['Today', 'Yesterday'], 'today and yesterday get names');
eq(g[0].items.map((x: { id: string }) => x.id), ['b', 'a'], 'newest first within a day');
ok(g.length === 3 && g[2].label !== 'Today', 'older days get a date');
eq(list.filter(x => c.matchesFilter(x, 'offers', 0)).length, 1, 'offers filter');
eq(list.filter(x => c.matchesFilter(x, 'results', 0)).length, 1, 'results filter');
eq(list.filter(x => c.matchesFilter(x, 'alerts', 0)).length, 1, 'alerts filter');
eq(list.filter(x => c.matchesFilter(x, 'admin', 0)).length, 1, 'admin filter');
eq(list.filter(x => c.matchesFilter(x, 'unread', at(1, 23))).length, 2, 'unread = newer than seen');
eq(list.filter(x => c.matchesFilter(x, 'all', 0)).length, 4, 'all');
console.log('notice list checks passed');
