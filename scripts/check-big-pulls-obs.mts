// OBS actions on big pulls (ROADMAP 55.8): the rule's OBS part is cleaned against the scene and source names the bridge reported, a ticketed save
// queues the "show the source" job at once and keeps the scene switch and the clip for the overlay's reveal report (claimed once, expiring),
// and the overlay watchdog refreshes the overlay at most once per 5 minutes, only while live, with the switch on, and the overlay visible in OBS.
// Against the mock KV. Run: npx tsx scripts/check-big-pulls-obs.mts
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to run against non-local KV: ${url}`);
process.env.KV_REST_API_URL = url; process.env.KV_REST_API_TOKEN ??= 'dev'; process.env.KV_URL ??= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };

const { NextRequest } = await import('next/server');
const kvLib = await import('../lib/kv');
const { kv } = await import('../lib/db');
const draw = await import('../lib/draw');
const m = await import('../lib/mixitup');
const b = await import('../lib/bridge');
const core = await import('../lib/bridge-core');
const r = await import('../lib/pull-rules-core');
const mc = await import('../lib/mixitup-core');
const wd = await import('../lib/overlay-watchdog');
const overlay = await import('../lib/overlay');
const { getOverlayKey } = await import('../lib/overlay-key');
const { POST } = await import('../app/api/collection/route');
const { POST: heartbeat } = await import('../app/api/overlay/heartbeat/route');
import type { PullRule } from '../lib/pull-rules-core';

const eventJobs = async () => (await kv.lrange<core.BridgeJob>('bridge:jobs', 0, -1)).filter(j => j.kind === 'pull-event');
const refreshJobs = async () => (await kv.lrange<core.BridgeJob>('bridge:jobs', 0, -1)).filter(j => j.kind === 'obs-refresh');
const clearJobs = () => kv.del('bridge:jobs');
const obsRule = (obs: r.PullObs, id = 'big'): PullRule => ({ id, on: true, when: {}, commandId: '', obs });
const names = { scenes: ['Gameplay', 'Just Chatting'], sources: ['Cam', 'Confetti'] };

// ── Saving: OBS names must be ones the bridge reported ──
const good = r.cleanRulesInput([{ id: 'a', on: true, when: {}, commandId: '', obs: { clip: true, scene: 'Just Chatting', sceneSecs: 500, source: 'Confetti' } }], [], [], names);
ok(good.ok && good.rules[0].obs?.clip === true && good.rules[0].obs?.scene === 'Just Chatting' && good.rules[0].obs?.sceneSecs === 60 && good.rules[0].obs?.source === 'Confetti', 'an OBS-only rule is kept; the scene time is capped at 60 s');
const defSecs = r.cleanRulesInput([{ id: 'a', on: true, when: {}, commandId: '', obs: { scene: 'Gameplay' } }], [], [], names);
ok(defSecs.ok && defSecs.rules[0].obs?.sceneSecs === 8, 'the scene time defaults to 8 s');
const refuse = (raw: unknown[], existing: PullRule[] = []) => { const x = r.cleanRulesInput(raw, [], existing, names); return x.ok ? '' : x.message; };
ok(/not in the list/.test(refuse([{ id: 'a', on: true, when: {}, commandId: '', obs: { scene: 'Made Up' } }])), 'a scene the bridge never reported is refused');
ok(/not in the list/.test(refuse([{ id: 'a', on: true, when: {}, commandId: '', obs: { source: 'Made Up' } }])), 'a source the bridge never reported is refused');
ok(refuse([{ id: 'a', on: true, when: {}, commandId: '' }]) !== '', 'a rule with no command and no OBS action is refused');
ok(refuse([obsRule({ scene: 'Gameplay' }, 'a')], [obsRule({ scene: 'Gameplay' }, 'a')]) === '', 'with no list reported yet a rule keeps the scene it had');
ok(mc.normalizeMixItUp(null).overlayWatchdog === false, 'the watchdog switch is off by default');

// ── The reveal path ──
await kvLib.seedSeason1();
const save = (ticket: string) => POST(new NextRequest('http://localhost/api/collection', { method: 'POST', body: JSON.stringify({ pull: { username: 'ann', ticket }, revealInMs: 2500 }) }));
const withRules = (pullRules: PullRule[], extra: Partial<ReturnType<typeof mc.normalizeMixItUp>> = {}) => m.saveMixItUpSettings({ ...mc.normalizeMixItUp(null), pullRules, ...extra });
const reveal = async (id: unknown) => heartbeat(new NextRequest('http://localhost/api/overlay/heartbeat', { method: 'POST', body: JSON.stringify({ id: 'overlay-client-1', reveal: id }), headers: { 'x-overlay-key': await getOverlayKey() } }));

await withRules([obsRule({ clip: true, scene: 'Just Chatting', sceneSecs: 5, source: 'Confetti' })]);
await clearJobs();
await draw.issueDraw('p0', 'ann');
const unpaired = await (await save('p0')).json() as { eventId?: string };
ok((await eventJobs()).length === 0 && !!unpaired.eventId, 'no bridge paired: the save answers with an event id and queues nothing');

ok(!!(await b.pairBridge((await b.createPairCode('check')).code, 'Stream PC')), 'a bridge is paired');
await clearJobs();
await draw.issueDraw('p1', 'ann');
const body = await (await save('p1')).json() as { ok: boolean; eventId: string };
ok(body.ok && typeof body.eventId === 'string', 'the save returns the event id');
const start = await eventJobs();
ok(start.length === 1 && start[0].phase === 'start' && start[0].source === 'Confetti' && start[0].holdMs === 2500 && start[0].scene === undefined && start[0].clip === undefined, 'the save queues only the "show the source" job, held until the reveal');

// the reveal report queues the scene switch and the clip once
const first = await reveal(body.eventId);
const firstBody = await first.json() as { queued?: boolean };
ok(first.status === 200 && firstBody.queued === true, JSON.stringify([first.status, firstBody]) + 'the overlay reveal report is accepted and queues the rest');
const all = await eventJobs();
const rev = all.find(j => j.phase === 'reveal');
ok(all.length === 2 && rev?.scene === 'Just Chatting' && rev?.secs === 5 && rev?.clip === true && rev?.source === undefined, 'the reveal queues the scene switch and the clip, not the source again');
ok(!(await b.bridgePullReveal(body.eventId)) && (await eventJobs()).length === 2, 'a second report for the same pull queues nothing (claimed once)');
ok(!(await b.bridgePullReveal('not-a-real-event')) && (await eventJobs()).length === 2, 'an unknown event id queues nothing');
ok((await eventJobs()).every(j => core.isFreshJob(j, Date.now())), 'the bridge will claim them');
ok((await kv.get(`bridge:pullevent:${body.eventId}`)) === null, 'the kept actions are gone once claimed');

// a source-only rule keeps nothing for the reveal; a rule that does not match queues nothing
await withRules([obsRule({ source: 'Confetti' })]);
await clearJobs();
await draw.issueDraw('p2', 'ann');
const srcOnly = await (await save('p2')).json() as { eventId: string };
ok((await eventJobs()).length === 1 && !(await b.bridgePullReveal(srcOnly.eventId)), 'a source-only rule has nothing to do at the reveal');
await withRules([]);
await clearJobs();
await draw.issueDraw('p3', 'ann');
await save('p3');
ok((await eventJobs()).length === 0, 'no rules, no jobs');

// the Test button
await clearJobs();
ok(await b.bridgePullTest({ clip: true, scene: 'Gameplay', sceneSecs: 4, source: 'Cam' }), 'the test queues');
const t = await eventJobs();
ok(t.length === 2 && t.some(j => j.phase === 'start' && j.holdMs === 3000) && t.some(j => j.phase === 'reveal' && j.scene === 'Gameplay'), 'with a 3 s source and the reveal part at once');

// ── The overlay watchdog ──
const seeObs = { connected: true, overlay: { found: true, inProgram: true, visible: true, sourceName: 'TCG Overlay' } };
process.env.TWITCH_CLIENT_ID = 'id'; process.env.TWITCH_CLIENT_SECRET = 'secret'; // the live status is read from the fresh KV copy below, never from Twitch
const NOW = Date.now();
await clearJobs();
await kv.set('twitch:live', { live: true, checkedAt: NOW });
await kv.hset('overlay:clients', { c1: { id: 'c1', at: NOW - 120_000, streaming: null, recording: null, obs: true, dev: false } });
ok((await overlay.getOverlayStatus()).lastSeen === NOW - 120_000, 'the overlay has been quiet for two minutes');

ok(!(await wd.overlayWatchdog(seeObs, NOW)) && (await refreshJobs()).length === 0, 'switch off (the default): nothing is sent');
await withRules([], { overlayWatchdog: true });
ok(!(await wd.overlayWatchdog({ ...seeObs, overlay: { ...seeObs.overlay, visible: false } }, NOW)), 'the overlay is hidden in OBS: left alone');
ok(!(await wd.overlayWatchdog({ ...seeObs, overlay: { ...seeObs.overlay, found: false } }, NOW)), 'the overlay source is not in OBS: left alone');
ok(!(await wd.overlayWatchdog({ ...seeObs, connected: false }, NOW)), 'OBS is not connected: left alone');
ok((await refreshJobs()).length === 0, 'none of those queued anything');
await kv.set('twitch:live', { live: false, checkedAt: NOW });
ok(!(await wd.overlayWatchdog(seeObs, NOW)), 'not live: left alone');
await kv.set('twitch:live', { live: true, checkedAt: NOW });
await kv.hset('overlay:clients', { c1: { id: 'c1', at: NOW - 10_000, streaming: null, recording: null, obs: true, dev: false } });
ok(!(await wd.overlayWatchdog(seeObs, NOW)), 'a heartbeat 10 s ago: the overlay is fine');
await kv.hset('overlay:clients', { c1: { id: 'c1', at: NOW - 120_000, streaming: null, recording: null, obs: true, dev: false } });

ok(await wd.overlayWatchdog(seeObs, NOW), 'live, switch on, overlay visible in OBS and quiet for over 30 s: a refresh is queued');
ok((await refreshJobs()).length === 1 && (await wd.readWatchdogAt()) === NOW, 'one obs-refresh job, and the time is kept for the health row');
ok(!(await wd.overlayWatchdog(seeObs, NOW + 60_000)) && (await refreshJobs()).length === 1, 'a minute later: not again (once per 5 minutes)');
ok((await m.getMixItUpLog()).some(e => e.what === 'watchdog' && e.ok), 'the refresh is logged');
await kv.del('mixitup:watchdog:lock'); // what the 5 minutes running out does
ok(await wd.overlayWatchdog(seeObs, NOW + 301_000) && (await refreshJobs()).length === 2, 'after 5 minutes it may refresh again');

await clearJobs();
console.log('big pulls in OBS checks passed');
