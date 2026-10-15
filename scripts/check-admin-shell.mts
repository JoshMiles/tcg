// Checks the admin frame's shared logic: the nav list (every page exists, shortcut letters are unique), the shortcut sequence,
// and the command palette's ranking. Pure (reads the app folder, no database). Run: npx tsx scripts/check-admin-shell.mts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const { NAV_ITEMS, NAV_GROUPS, isActive } = await import('../lib/admin-nav');
const sc = await import('../lib/shortcuts');
const pal = await import('../lib/palette');

// ── every nav / palette link is a real page ──
const pageExists = (href: string) => {
  const path = href.split(/[?#]/)[0].replace(/^\//, '');
  return existsSync(join(process.cwd(), 'app', path, 'page.tsx'));
};
for (const i of NAV_ITEMS) ok(pageExists(i.href), `nav link ${i.href} has no page`);
for (const it of pal.STATIC_ITEMS) if (it.href) ok(pageExists(it.href), `palette item "${it.label}" links to a missing page ${it.href}`);

// ── uniqueness ──
eq(new Set(NAV_ITEMS.map(i => i.key)).size, NAV_ITEMS.length, 'shortcut letters are unique');
ok(NAV_ITEMS.every(i => /^[a-z]$/.test(i.key)), 'shortcut letters are single a-z');
eq(new Set(NAV_ITEMS.map(i => i.href)).size, NAV_ITEMS.length, 'nav hrefs are unique');
eq(new Set(pal.STATIC_ITEMS.map(i => i.id)).size, pal.STATIC_ITEMS.length, 'palette ids are unique');
const combos = sc.ALL_SHORTCUTS.map(s => s.keys.join('+'));
eq(new Set(combos).size, combos.length, 'no two shortcuts share the same keys');
ok(NAV_GROUPS.every(g => g.items.length > 0), 'no empty nav group');
ok(pal.STATIC_ITEMS.filter(i => i.action).every(i => ['copy-overlay', 'open-preview', 'exit-sandbox', 'logout'].includes(i.action!)), 'palette actions are known');

// ── active item ──
const dash = NAV_ITEMS.find(i => i.href === '/admin')!, packs = NAV_ITEMS.find(i => i.href === '/admin/packs')!;
ok(isActive(dash, '/admin') && !isActive(dash, '/admin/packs'), 'the dashboard only matches exactly');
ok(isActive(packs, '/admin/packs/abc/cards'), 'a section matches its sub-pages');

// ── g then a letter ──
let r = sc.stepSequence(sc.IDLE, 'g', 1000);
ok(r.state.pending && !r.go, 'g starts a sequence');
r = sc.stepSequence(r.state, 'p', 1500);
eq(r.go, '/admin/packs', 'g p goes to Packs');
ok(!r.state.pending, 'the sequence resets after a hit');
r = sc.stepSequence(sc.stepSequence(sc.IDLE, 'g', 0).state, 'p', sc.SEQUENCE_WINDOW_MS + 1);
ok(!r.go, 'too slow: no navigation');
r = sc.stepSequence(sc.stepSequence(sc.IDLE, 'g', 0).state, 'z', 100);
ok(!r.go && !r.state.pending, 'g then an unknown letter does nothing');
ok(!sc.stepSequence(sc.IDLE, 'p', 0).go, 'a letter alone does nothing');
eq(sc.stepSequence(sc.stepSequence(sc.IDLE, 'G', 0).state, 'D', 10).go, '/admin', 'capitals work (caps lock)');

// ── typing targets ──
ok(sc.isTypingTarget({ tagName: 'INPUT' } as never) && sc.isTypingTarget({ tagName: 'TEXTAREA' } as never), 'inputs are typing targets');
ok(sc.isTypingTarget({ tagName: 'DIV', isContentEditable: true } as never), 'contenteditable is a typing target');
ok(!sc.isTypingTarget({ tagName: 'BUTTON' } as never) && !sc.isTypingTarget(null), 'buttons and nothing are not');

// ── palette ranking ──
const extra: import('../lib/palette').PaletteItem[] = [
  { id: 'pack:1', label: 'Cheesy Starter Pack', group: 'Packs', icon: 'cards', href: '/admin/packs/1' },
  { id: 'season:1', label: 'Season 1', group: 'Seasons', icon: 'trophy', href: '/admin/seasons/1' },
  { id: 'user:alice', label: 'alice', group: 'Users', icon: 'user', href: '/admin/users/alice' },
  { id: 'user:bob_the_builder', label: 'bob_the_builder', group: 'Users', icon: 'user', href: '/admin/users/bob_the_builder' },
];
const all = [...pal.STATIC_ITEMS, ...extra];
const top = (q: string) => pal.rankItems(all, q)[0]?.label;
eq(top('packs'), 'Packs', 'exact page match first');
eq(top('pa'), 'Packs', 'a prefix finds the page');
eq(top('assets'), 'Assets', 'Assets');
eq(top('scoring'), 'Scoring settings', 'a settings tab by name');
eq(top('alice'), 'alice', 'a viewer by name');
eq(top('builder'), 'bob_the_builder', 'a word inside a name');
ok(pal.rankItems(all, 'obs').some(i => i.id === 'act:copy-overlay'), 'keywords match ("obs" finds the overlay URL)');
ok(pal.rankItems(all, 'sign out').some(i => i.action === 'logout'), 'keywords with a space match');
ok(pal.rankItems(all, 'chsy').some(i => i.label === 'Cheesy Starter Pack'), 'a loose subsequence still finds it');
eq(pal.rankItems(all, 'zzzzqq'), [], 'nonsense matches nothing');
const empty = pal.rankItems(all, '');
ok(empty.length > 0 && empty.every(i => i.group === 'Pages' || i.group === 'Actions'), 'with no query: pages and actions only');
eq(empty[0].label, 'Dashboard', 'and the dashboard first');
ok(pal.rankItems(all, 'e', 5).length <= 5, 'the limit is respected');
ok(pal.scoreItem({ label: 'Packs' }, 'PACKS') === 100, 'matching ignores case');

// The frame's accessibility rules: the closed drawer is inert (Tab and screen readers skip it), there is a skip link to the main area,
// and the not-found screen has its own heading.
const shell = readFileSync(join(process.cwd(), 'app/admin/components/AdminShell.tsx'), 'utf8');
ok(/inert={!wide && !open}/.test(shell), 'the sidebar is inert while the phone drawer is closed');
ok(shell.includes('href="#admin-main"') && shell.includes('id="admin-main"'), 'the frame has a skip link to the main area');
ok(readFileSync(join(process.cwd(), 'app/admin/not-found.tsx'), 'utf8').includes('asH1'), 'the not-found screen has an h1');

console.log('admin shell checks passed');
