// The collection grid and binder floor a fast holo sweep at 8 seconds. The shared shimmer keeps the saved time.
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const { holoVars, siteHoloVars } = await import('../lib/holo-core');

const fast = { on: true, style: { '--holo-time': '3s', '--holo-opacity': '0.9' } };
const slow = { on: true, style: { '--holo-time': '10.5s' } };
const off = { on: false, style: { '--holo-time': '3s' } };

ok((holoVars(fast) as Record<string, string>)['--holo-time'] === '3s', 'the shared shimmer keeps a fast overlay time');
ok((siteHoloVars(fast) as Record<string, string>)['--holo-time'] === '8s', 'the site floors a fast sweep at 8 seconds');
ok((siteHoloVars(slow) as Record<string, string>)['--holo-time'] === '10.5s', 'a sweep of 8 seconds or more is left alone');
ok((siteHoloVars({ on: true, style: { '--holo-time': '8s' } }) as Record<string, string>)['--holo-time'] === '8s', '8 seconds is already the floor');
ok((siteHoloVars(off) as Record<string, string>)['--holo-time'] === undefined, 'an off shimmer adds no time');
