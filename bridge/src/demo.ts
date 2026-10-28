// Development only (npm start -- --demo-startup [--shots=<folder>]; main.ts never loads this in the installed app):
// walks the start-up window through its states, then shows the window with made-up data, saving a PNG of each when a folder is given.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { Startup, type StartupEvent, type StartupStep } from './startup';
import { attentionItems } from './status';
import { connectionRows } from './connections';
import { clock, type EventLine } from './events';
import type { ChecklistLine } from './checklist';
import { staffActionsFor, viewerFacts } from './staffpages';
import { accountLabel } from './signin';
import { FEED_KEEP, filterFeed, mergeFeed, readySummary, streamNumbers, type PullEntry } from './home';

export interface DemoContext {
  shots: string;
  version: string;
  feed: (e: StartupEvent) => void;
  sendSplash: (step: StartupStep) => void;
  getSplash: () => BrowserWindow | null;
  getWindow: () => BrowserWindow | null;
  setState: (s: object | null) => void;
  openTool: (file: 'feed.html' | 'summary.html' | 'preview.html', width: number, height: number) => BrowserWindow;
  finish: () => void;
}

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

async function capture(ctx: DemoContext, w: BrowserWindow | null, name: string): Promise<void> {
  if (!ctx.shots || !w || w.isDestroyed()) return;
  mkdirSync(ctx.shots, { recursive: true });
  writeFileSync(join(ctx.shots, `${name}.png`), (await w.webContents.capturePage()).toPNG());
}

export async function runDemo(ctx: DemoContext): Promise<void> {
  await wait(1200); // the start-up window opens
  const walks: [string, StartupEvent[]][] = [
    ['splash-1-checking', []],
    ['splash-2-downloading-40', [{ type: 'available', version: '0.5.1' }, { type: 'progress', percent: 40 }]],
    ['splash-3-installing', [{ type: 'available', version: '0.5.1' }, { type: 'downloaded', version: '0.5.1' }]],
    ['splash-4-starting', [{ type: 'none' }]],
  ];
  for (const [name, events] of walks) {
    const s = new Startup(0);
    let step = s.step;
    for (const e of events) step = s.event(e, 0);
    ctx.sendSplash(step);
    await wait(700);
    await capture(ctx, ctx.getSplash(), name);
    if (!ctx.shots) await wait(1500);
  }

  ctx.feed({ type: 'none' }); // the real path: opens the app and closes the start-up window
  await wait(1500);
  const w = ctx.getWindow();
  if (!w) return;
  w.show();
  const tab = (name: string) => w.webContents.executeJavaScript(`document.querySelector('[data-tab="${name}"]').click()`);

  const now = Date.now();
  const job = (ago: number, kind: string, username: string, ok: boolean, detail: string) => ({ at: now - ago * 1000, kind, username, ok, detail, ms: 120 });
  const jobs = [
    job(20, 'run-command', 'brie_fan', true, 'Ran "Big pull sound"'),
    job(65, 'deduct', 'brie_fan', true, 'Took 50 Brie Bucks'),
    job(190, 'balance', 'cheesehead', true, '420 Brie Bucks'),
    job(400, 'deduct', 'newviewer', false, 'Not enough Brie Bucks'),
    job(900, 'add', 'cheesehead', true, 'Gave 100 Brie Bucks'),
  ];
  // A busy stream for the Home dashboard (59.5): pulls, event rewards and jobs mixed, a queue, a happy hour running.
  const pull = (ago: number, viewer: string, card: string, rarity: string, stars: number, variant = 'Regular'): PullEntry => ({ at: now - ago * 1000, viewer, card, rarity, stars, variant, serial: 100 + ago, image: 'icon.png' }); // the app icon stands in for the card art
  const pulls = [
    pull(8, 'brie_fan', 'Gouda Goat', 'Legendary', 5, 'Holo'), pull(30, 'cheesehead', 'Brie Bear', 'Common', 1), pull(55, 'newviewer', 'Cheddar Chick', 'Rare', 3),
    pull(95, 'brie_fan', 'Swiss Sloth', 'Epic', 4), pull(140, 'curdnerd', 'Gouda Goat', 'Common', 1), pull(210, 'cheesehead', 'Feta Fox', 'Uncommon', 2),
    pull(300, 'brie_fan', 'Brie Bear', 'Common', 1), pull(420, 'wheelwatch', 'Cheddar Chick', 'Rare', 3),
  ];
  const ev = (ago: number, event: string, viewer: string, amount: string, ok: boolean, result: string): EventLine => ({ at: now - ago * 1000, time: clock(now - ago * 1000), event, viewer, amount, ok, result });
  const events = [
    ev(12, 'Bits', 'curdnerd', '500', true, '1 pack'), ev(70, 'Subscription', 'wheelwatch', 'Tier 1', true, '3 packs'),
    ev(160, 'Bits', 'newviewer', '50', false, 'Ignored: under the minimum'), ev(260, 'Raid', 'cheesefriend', '40 viewers', true, '2 packs'),
  ];
  const home = { feed: mergeFeed(pulls, events, jobs, FEED_KEEP), numbers: streamNumbers(pulls, [{ id: '1', user: 'brie_fan', amount: -50, at: now - 65_000, answer: 'ok' }, { id: '2', user: 'cheesehead', amount: -100, at: now - 500_000, answer: 'ok' }], now - 3_600_000) };
  const queue = [
    { username: 'brie_fan', pack: 'Cheese Classic', waitedS: 4 }, { username: 'curdnerd', pack: 'Cheese Classic', waitedS: 9 }, { username: 'newviewer', pack: 'Holo Rush', waitedS: 15 },
    { username: 'cheesehead', pack: 'Cheese Classic', waitedS: 22 }, { username: 'wheelwatch', pack: 'Cheese Classic', waitedS: 31 }, { username: 'cheesefriend', pack: 'Holo Rush', waitedS: 40 }, { username: 'brie_fan', pack: 'Cheese Classic', waitedS: 48 },
  ];
  const checklistLines: ChecklistLine[] = [
    { label: 'Site', tone: 'ok', text: 'Connected' }, { label: 'Mix It Up', tone: 'ok', text: 'Connected' }, { label: 'Pulls', tone: 'ok', text: 'Open' }, { label: 'Happy hour', tone: 'muted', text: 'Not running.' },
  ];
  const obs = { enabled: true, connected: true, error: '', scene: 'Main scene', streaming: true, overlay: { found: true, inProgram: true, visible: true, sourceName: 'TCG Overlay' } };
  const control = {
    error: '', paused: false, reason: '', happy: { what: 'half price packs', endsAt: now + 18 * 60_000 + 42_000 }, last: '',
    hotkeys: { refresh: 'Ctrl+Alt+R', pause: '', lastBuff: '' }, hotkeyErrors: {},
    buttons: [{ label: 'Pause or resume pulls', url: 'http://127.0.0.1:47653/k/pause' }, { label: 'Refresh the overlay', url: 'http://127.0.0.1:47653/k/refresh' }],
  };
  const scenePause = { on: true, scenes: ['Be right back'], obsScenes: ['Main scene', 'Be right back'] };
  const obsStats = { map: {}, texts: ['Pulls text'], stats: [{ id: 'packs', label: 'Packs this stream' }] };
  const notices = { attention: true, feedback: true, refusal: true, deploy: true };
  const state = (mixFound: boolean, extra: { startNote?: string; update?: string; updateVersion?: string; updatedTo?: string; staff?: boolean; staffCan?: string[]; account?: string; whatsNew?: { open: boolean } } = {}): object => ({
    control, scenePause, obsStats, notices, pcName: 'STREAM-PC', staff: false, whatsNew: null, home, queue, events: [], commandsMissing: mixFound ? [] : null,
    checklist: readySummary({ ready: mixFound, at: now - 120_000, lines: mixFound ? checklistLines : checklistLines.map(l => (l.label === 'Mix It Up' ? { ...l, tone: 'bad' as const, text: 'Not answering. Open Mix It Up and switch its Developer API on.' } : l)) }),
    attention: attentionItems({ paired: true, updateVersion: extra.updateVersion ?? '', startNote: extra.startNote ?? '', site: 'connected', mixFound, obsEnabled: true, obsConnected: true, deckReason: '' }),
    connections: connectionRows({ paired: true, pairedAs: 'STREAM-PC', login: 'cheesygidds', role: 'admin', site: 'connected', siteError: '', mixFound, obsEnabled: true, obsConnected: true, obsStreaming: true, obsError: '', deckInstalled: true, deckOn: true, deckConnected: true, deckError: '', deckSeen: true }),
    liveSince: now - 47 * 60_000,
    deck: { on: true, error: '', connected: true, found: true, installed: ctx.version, offer: false },
    startNote: '', paired: true, site: 'https://cheesytcg.app', pairedAs: 'STREAM-PC', account: accountLabel({ login: 'cheesygidds', role: 'admin', pairedAs: 'STREAM-PC' }), linked: true, staffCan: null, signIn: null, startWithWindows: true, alerts: true,
    obsSettings: { enabled: true, address: 'ws://127.0.0.1:4455', hasPassword: true },
    mixItUp: { startWithBridge: false, path: 'C:\\Users\\streamer\\AppData\\Local\\MixItUp\\MixItUp.exe' },
    tools: { feed: { on: false, minStars: 4, volume: 0.5, muted: false, onTop: false }, summary: false, startObs: false, obsPath: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' },
    appVersion: ctx.version, update: '', updateVersion: '', updatedTo: '',
    service: { site: 'connected', siteError: '', lastPollAt: now - 3000, mix: { found: mixFound, version: mixFound ? '1.10.0.0' : '' }, currency: 'Brie Bucks', currencyId: 'x', channel: 'Cheesygidds', jobs, tray: mixFound ? 'connected' : 'partly', obs },
    ...extra,
  });

  const notes = { startNote: "Couldn't check for updates", update: 'Version 0.5.1 is available. Restart TCG Bridge to install it.', updateVersion: '0.5.1' };
  const openPill = `document.getElementById('status-pill').click()`;
  const pick = (conn: string): string => `document.querySelector('.conn-row[data-conn="${conn}"]').click()`;
  // Staff pages (59.7): the renderer reads the site through the app, which has no site in the demo, so the shots hand it what the site would have answered.
  const viewer = { username: 'brie_fan', copies: 38, unique: 24, rank: 3, of: 112, bucks: 420, blocked: false, pulls: [{ text: 'Gouda Goat (Holo)' }, { text: 'Brie Bear' }, { text: 'Swiss Sloth' }], refusals: [{ text: 'Packs are paused' }] };
  const staffReads = `staffState = ${JSON.stringify({ tradingPaused: false, extra: 2, variants: [{ id: 'regular', label: 'Regular' }, { id: 'holo', label: 'Holo' }], scenes: ['Main scene', 'Be right back', 'Starting soon'] })}; renderStaff();`;
  const viewerCard = `${staffReads} showViewer(${JSON.stringify({ ...viewer, facts: viewerFacts({ ...viewer }) })}); document.getElementById('staff-card').value = '#12 Gouda Goat'; document.getElementById('staff-viewer-result').textContent = 'Gifted 2 packs to brie_fan.'; document.getElementById('staff-viewer-result').className = 'result ok';`;
  const unlinked = { ...state(false), paired: false, linked: false, account: '', site: 'https://cheesytcg.app', pairedAs: '', service: null, attention: attentionItems({ paired: false, updateVersion: '', startNote: '', site: null, mixFound: false, obsEnabled: false, obsConnected: false, deckReason: '' }) };
  const shots: [string, object, string, string?][] = [
    ['main-1-home-connected', state(true), 'home'], // the busy dashboard at 1280 x 800: chips, pulls, happy hour, queue, numbers, feed
    ['main-1b-home-staff', state(true, { staff: true }), 'home'],
    ['main-2-home-mixitup-missing', state(false), 'home'],
    ['main-3-status-pill-open', state(false, notes), 'home', openPill], // the pill's list open: update ready, couldn't check, Mix It Up
    ['main-3b-updated-toast', state(true, { updatedTo: ctx.version }), 'home'], // "Updated to x" as a toast
    ['main-4-controls', state(true), 'controls'],
    ['main-5-connections', state(true), 'connections', pick('obs')], // OBS picked: its facts and settings
    ['main-5b-connections-mixitup-fix', state(false), 'connections', pick('mix')], // Mix It Up's Developer API is off: the fix steps at the top
    ['main-6-overlay-and-obs', state(true), 'overlay'],
    ['main-7-buttons-and-hotkeys', state(true), 'buttons'],
    ['main-8-notifications', state(true), 'notifications'],
    ['main-9-app', state(true), 'app'],
    ['main-10-about', state(true, { update: notes.update, updateVersion: notes.updateVersion }), 'about'],
    ['main-11-about-whats-new', state(true, { whatsNew: { open: true } }), 'about'], // after an update: the What's new card
    ['main-12-staff-viewers-and-cards', state(true, { staff: true }), 'viewers', viewerCard], // the Staff group shows on a staff PC only; a found viewer's card with its result line
    ['main-13-staff-this-stream', state(true, { staff: true }), 'stream', staffReads], // extra pulls, scene select, trading, preview, search, back up
    ['main-14-feed-and-history', state(false), 'feed'], // everyone: the history only
    ['main-14b-feed-and-history-staff', state(true, { staff: true }), 'feed'], // a staff PC: the activity part as well
    ['main-15-connect-screen', unlinked, 'home'], // the first-run Connect screen: the Sign in with Twitch button
    ['main-15b-connect-screen-code', { ...unlinked, signIn: { phase: 'waiting', code: 'ABC123', note: '' } }, 'home'], // Sign in with Twitch waiting: the code to compare with the site
    ['main-15c-connect-screen-expired', { ...unlinked, signIn: { phase: 'expired' } }, 'home'], // the sign-in took too long: Try again
    ['main-17-account-signed-in', state(true), 'connections', pick('account')], // the TCG account detail: signed in with Twitch, with Sign out
    ['main-17b-staff-mod', state(true, { staff: true, staffCan: staffActionsFor('mod'), account: accountLabel({ login: 'modguy', role: 'mod', pairedAs: 'STREAM-PC' }) }), 'stream', staffReads], // a mod: only what a mod may do
  ];
  if (w.isMaximized()) w.unmaximize();
  w.setSize(1280, 800); // the size the Home dashboard is made to fit
  for (const [name, s, t, js] of shots) {
    await w.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); // closes the pill's list from the shot before
    ctx.setState(s);
    await tab(t);
    if (js) await w.webContents.executeJavaScript(js);
    await wait(500);
    await capture(ctx, w, name);
    if (!ctx.shots) await wait(2500);
  }
  // Narrow window: below 1100 px the sidebar folds to icons.
  if (w.isMaximized()) w.unmaximize();
  w.setSize(1000, 700);
  ctx.setState(state(true, { staff: true }));
  await tab('home');
  await wait(500);
  await capture(ctx, w, 'main-16-sidebar-folded');

  // The tool windows (59.8), in the main window's style: the pull feed with all rows and with the Pulls chip pressed, the end of stream summary, the overlay preview.
  const tool = async (file: 'feed.html' | 'summary.html' | 'preview.html', width: number, height: number): Promise<BrowserWindow> => {
    const t = ctx.openTool(file, width, height);
    await wait(1500); // loaded and shown
    return t;
  };
  const feedWin = await tool('feed.html', 380, 640);
  const feedRows = (filter: 'all' | 'pulls') => feedWin.webContents.send('feed-rows', { filter, rows: filterFeed(home.feed, filter) });
  feedRows('all');
  await wait(400);
  await capture(ctx, feedWin, 'tool-1-pull-feed');
  feedRows('pulls');
  await feedWin.webContents.executeJavaScript(`document.querySelector('[data-filter="pulls"]').focus()`); // the focus ring shows in the shot
  await wait(400);
  await capture(ctx, feedWin, 'tool-1b-pull-feed-pulls-only');
  if (!ctx.shots) await wait(2500);
  feedWin.close();

  const summaryWin = await tool('summary.html', 460, 600);
  summaryWin.webContents.send('summary-data', {
    packs: 64, partial: false, pullers: 17, taken: 3200, refunded: 150,
    bigPulls: [{ cardName: 'Gouda Goat', rarity: 'Legendary', variant: 'Holo', serial: 7, username: 'brie_fan' }, { cardName: 'Swiss Sloth', rarity: 'Epic', variant: 'Regular', serial: 112, username: 'cheesehead' }],
    topPullers: [{ username: 'brie_fan', packs: 9 }, { username: 'cheesehead', packs: 7 }, { username: 'curdnerd', packs: 5 }],
  });
  await wait(400);
  await capture(ctx, summaryWin, 'tool-2-stream-summary');
  if (!ctx.shots) await wait(2500);
  summaryWin.close();

  const previewWin = await tool('preview.html', 1000, 680);
  await previewWin.webContents.executeJavaScript(`say('Test pull queued for the live overlay.')`); // the window is not the app's tracked preview, so it has no site to ask: set the line a real one shows
  await wait(400);
  await capture(ctx, previewWin, 'tool-3-preview-overlay');
  if (!ctx.shots) await wait(2500);
  previewWin.close();
  if (ctx.shots) ctx.finish();
}
