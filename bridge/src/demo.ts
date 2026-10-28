// Development only (npm start -- --demo-startup [--shots=<folder>]; main.ts never loads this in the installed app):
// walks the start-up window through its states, then shows the window with made-up data, saving a PNG of each when a folder is given.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { Startup, type StartupEvent, type StartupStep } from './startup';
import { attentionItems } from './status';

export interface DemoContext {
  shots: string;
  version: string;
  feed: (e: StartupEvent) => void;
  sendSplash: (step: StartupStep) => void;
  getSplash: () => BrowserWindow | null;
  getWindow: () => BrowserWindow | null;
  setState: (s: object | null) => void;
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
  const obs = { enabled: true, connected: true, error: '', scene: 'Main scene', streaming: true, overlay: { found: true, inProgram: true, visible: true, sourceName: 'TCG Overlay' } };
  const control = {
    error: '', paused: false, reason: '', happy: null, last: '',
    hotkeys: { refresh: 'Ctrl+Alt+R', pause: '', lastBuff: '' }, hotkeyErrors: {},
    buttons: [{ label: 'Pause or resume pulls', url: 'http://127.0.0.1:47653/k/pause' }, { label: 'Refresh the overlay', url: 'http://127.0.0.1:47653/k/refresh' }],
  };
  const scenePause = { on: true, scenes: ['Be right back'], obsScenes: ['Main scene', 'Be right back'] };
  const obsStats = { map: {}, texts: ['Pulls text'], stats: [{ id: 'packs', label: 'Packs this stream' }] };
  const notices = { attention: true, feedback: true, refusal: true, deploy: true };
  const state = (mixFound: boolean, extra: { startNote?: string; update?: string; updateVersion?: string; updatedTo?: string; staff?: boolean; whatsNew?: { open: boolean } } = {}): object => ({
    control, scenePause, obsStats, notices, pcName: 'STREAM-PC', staff: false, whatsNew: null,
    attention: attentionItems({ paired: true, updateVersion: extra.updateVersion ?? '', startNote: extra.startNote ?? '', site: 'connected', mixFound, obsEnabled: true, obsConnected: true }),
    startNote: '', paired: true, site: 'https://cheesytcg.app', pairedAs: 'STREAM-PC', startWithWindows: true, alerts: true,
    obsSettings: { enabled: true, address: 'ws://127.0.0.1:4455', hasPassword: true },
    mixItUp: { startWithBridge: false, path: 'C:\\Users\\streamer\\AppData\\Local\\MixItUp\\MixItUp.exe' },
    tools: { feed: { on: false, minStars: 4, volume: 0.5, muted: false, onTop: false }, summary: false, startObs: false, obsPath: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' },
    appVersion: ctx.version, update: '', updateVersion: '', updatedTo: '',
    service: { site: 'connected', siteError: '', lastPollAt: now - 3000, mix: { found: mixFound, version: mixFound ? '1.10.0.0' : '' }, currency: 'Brie Bucks', currencyId: 'x', channel: 'Cheesygidds', jobs, tray: mixFound ? 'connected' : 'partly', obs },
    ...extra,
  });

  const notes = { startNote: "Couldn't check for updates", update: 'Version 0.5.1 is available. Restart TCG Bridge to install it.', updateVersion: '0.5.1' };
  const openPill = `document.getElementById('status-pill').click()`;
  const shots: [string, object, string, string?][] = [
    ['main-1-home-connected', state(true), 'home'],
    ['main-2-home-mixitup-missing', state(false), 'home'],
    ['main-3-status-pill-open', state(false, notes), 'home', openPill], // the pill's list open: update ready, couldn't check, Mix It Up
    ['main-3b-updated-toast', state(true, { updatedTo: ctx.version }), 'home'], // "Updated to x" as a toast
    ['main-4-controls', state(true), 'controls'],
    ['main-5-connections', state(false), 'connections'],
    ['main-6-overlay-and-obs', state(true), 'overlay'],
    ['main-7-buttons-and-hotkeys', state(true), 'buttons'],
    ['main-8-notifications', state(true), 'notifications'],
    ['main-9-app', state(true), 'app'],
    ['main-10-about', state(true, { update: notes.update, updateVersion: notes.updateVersion }), 'about'],
    ['main-11-about-whats-new', state(true, { whatsNew: { open: true } }), 'about'], // after an update: the What's new card
    ['main-12-staff-viewers-and-cards', state(true, { staff: true }), 'viewers'], // the Staff group shows on a staff PC only
    ['main-13-staff-this-stream', state(true, { staff: true }), 'stream'],
    ['main-14-feed-and-history', state(true, { staff: true }), 'feed'],
    ['main-15-pairing', { ...state(false), paired: false, site: 'https://cheesytcg.app', pairedAs: '', service: null, attention: attentionItems({ paired: false, updateVersion: '', startNote: '', site: null, mixFound: false, obsEnabled: false, obsConnected: false }) }, 'home'],
  ];
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
  if (ctx.shots) ctx.finish();
}
