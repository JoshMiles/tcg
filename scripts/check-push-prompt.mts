// Checks when the "turn on alerts" banner shows and how "Not now" is remembered (pure). Run: npx tsx scripts/check-push-prompt.mts
import { MAX_DISMISSALS, SNOOZE_DAYS, dismissed, isPhoneLike, parsePromptState, promptMode, type PromptInput } from '../lib/push-prompt-core';

const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const NOW = Date.UTC(2026, 9, 16);
const base: PromptInput = { serverEnabled: true, phone: true, support: 'ok', permission: 'default', subscribed: false, state: { until: 0, n: 0 }, now: NOW };
const mode = (o: Partial<PromptInput>) => promptMode({ ...base, ...o });

eq(mode({}), 'turn-on', 'a phone that can ask and has not been asked');
eq(mode({ support: 'install-first' }), 'install', 'an iPhone in Safari is pointed at the install guide');
eq(mode({ support: 'install-first', permission: 'default' }), 'install', 'install mode ignores the (undecided) permission');
eq(mode({ permission: 'denied' }), null, 'blocked: no banner (Settings explains how to allow it)');
eq(mode({ permission: 'denied', support: 'install-first' }), null, 'blocked wins over install');
eq(mode({ permission: 'granted' }), null, 'allowed but not subscribed: leave it to Settings');
eq(mode({ subscribed: true }), null, 'this device is already subscribed');
eq(mode({ support: 'unsupported' }), null, 'this browser cannot show alerts');
eq(mode({ serverEnabled: false }), null, 'the server has no push keys, or the viewer is signed out');
eq(mode({ phone: false }), null, 'a computer browser tab gets no banner');

// "Not now": hidden for 14 days, three times at most
const first = dismissed(base.state, NOW);
eq([first.n, first.until], [1, NOW + SNOOZE_DAYS * 86_400_000], 'one dismissal hides it for 14 days');
eq(mode({ state: first, now: NOW + 13 * 86_400_000 }), null, 'still hidden on day 13');
eq(mode({ state: first, now: NOW + 14 * 86_400_000 }), 'turn-on', 'back on day 14');
const third = dismissed(dismissed(first, NOW + 14 * 86_400_000), NOW + 30 * 86_400_000);
eq(third.n, MAX_DISMISSALS, 'three dismissals');
eq(mode({ state: third, now: NOW + 400 * 86_400_000 }), null, 'after three it never comes back');

// the stored value
eq(parsePromptState(null), { until: 0, n: 0 }, 'nothing stored');
eq(parsePromptState('not json'), { until: 0, n: 0 }, 'garbage is ignored');
eq(parsePromptState(JSON.stringify(first)), first, 'round trip');
eq(parsePromptState('{"until":"x","n":-2}'), { until: 0, n: 0 }, 'bad numbers are ignored');

// what counts as a phone
const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const ipadAsMac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17 Safari/605.1.15';
ok(isPhoneLike(iphone, 5, false) && isPhoneLike(android, 5, false), 'iPhone and Android');
ok(isPhoneLike(ipadAsMac, 5, false), 'an iPad that says it is a Mac');
ok(!isPhoneLike(desktop, 0, false) && !isPhoneLike(ipadAsMac, 0, false), 'a computer');
ok(isPhoneLike(desktop, 0, true), 'the installed app counts wherever it runs');
console.log('push prompt ok');
