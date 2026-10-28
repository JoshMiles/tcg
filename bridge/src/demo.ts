// Development only (npm start -- --demo-startup [--shots=<folder>]; main.ts never loads this in the installed app):
// walks the start-up window through its states, then shows the window with made-up data, saving a PNG of each when a folder is given.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserWindow } from 'electron';
import { Startup, type StartupEvent, type StartupStep } from './startup';

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
  const state = (mixFound: boolean, extra: object = {}): object => ({
    startNote: '', paired: true, site: 'https://cheesytcg.app', pairedAs: 'STREAM-PC', startWithWindows: true, alerts: true,
    obsSettings: { enabled: true, address: 'ws://127.0.0.1:4455', hasPassword: true },
    mixItUp: { startWithBridge: false, path: 'C:\\Users\\streamer\\AppData\\Local\\MixItUp\\MixItUp.exe' },
    tools: { feed: { on: false, minStars: 4, volume: 0.5, muted: false, onTop: false }, summary: false, startObs: false, obsPath: 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe' },
    appVersion: ctx.version, update: '', updateVersion: '', updatedTo: '',
    service: { site: 'connected', siteError: '', lastPollAt: now - 3000, mix: { found: mixFound, version: mixFound ? '1.10.0.0' : '' }, currency: 'Brie Bucks', currencyId: 'x', channel: 'Cheesygidds', jobs, tray: mixFound ? 'connected' : 'partly', obs },
    ...extra,
  });

  const shots: [string, object, string][] = [
    ['main-1-status-connected', state(true), 'status'],
    ['main-2-status-mixitup-missing', state(false), 'status'],
    ['main-3-status-banners', state(true, { startNote: "Couldn't check for updates", updatedTo: '0.5.0', update: 'Version 0.5.1 is available. Restart TCG Bridge to install it.', updateVersion: '0.5.1' }), 'status'],
    ['main-4-settings', state(true), 'settings'],
    ['main-5-about', state(true, { update: 'Version 0.5.1 is available. Restart TCG Bridge to install it.', updateVersion: '0.5.1' }), 'about'],
    ['main-6-pairing', { ...state(false), paired: false, site: 'https://cheesytcg.app', pairedAs: '', service: null }, 'status'],
  ];
  for (const [name, s, t] of shots) {
    ctx.setState(s);
    await tab(t);
    await wait(500);
    await capture(ctx, w, name);
    if (!ctx.shots) await wait(2500);
  }
  if (ctx.shots) ctx.finish();
}
