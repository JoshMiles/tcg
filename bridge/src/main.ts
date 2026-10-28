// TCG Bridge, the Electron glue: one instance, a tray icon, a small window, auto start and updates. The logic is in the other modules.
import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, Notification, safeStorage, shell, Tray, type MenuItemConstructorOptions } from 'electron';
import { autoUpdater } from 'electron-updater';
import { mkdirSync } from 'node:fs';
import { hostname, release, tmpdir, version as osVersion } from 'node:os';
import { dirname, join } from 'node:path';
import { Alerts, snapshotOf } from './alerts';
import { aboutParts, commitUrl, readBuildInfo, stampText } from './buildinfo';
import { Ledger } from './bucks';
import { buttonUrl, ControlServer, HOTKEY_ACTION, HOTKEYS, Hotkeys, newControlKey, type ControlAction, type ControlResult, type HotkeyMap, type HotkeyName } from './control';
import { diagnosticsText } from './diagnostics';
import { HAPPY_PRESETS, happyText, type HappyFacts } from './happyhour';
import { cleanFeed, cleanFeedSettings, cleanSummary, shouldPlay, summaryMarkdown, type FeedSettings, type Summary } from './feed';
import { defaultMixItUpPath, defaultObsPath, isMixItUpExe, isObsExe, obsRunning, startMixItUp, startObs } from './launch';
import { Logger, redact } from './log';
import { MixItUpClient } from './mixitup';
import { cleanObsAddress, ObsWatcher } from './obs';
import { runChecklist, type ChecklistResult } from './checklist';
import { checkObs, sendTestChat, testMixItUp, type TestResult } from './selftest';
import { BridgeService, type TrayLevel } from './service';
import { cleanNotice, NOTICE_KINDS, type NoticeKind } from './notices';
import { StaffTools } from './staff';
import { cleanScenePause, ScenePause } from './scenepause';
import { eventsAfter, mergeEvents, type EventLine } from './events';
import { acceptStatMap, siteStats, STAT_IDS, STAT_LABELS, TextWriter, wantedTexts, type StatFacts } from './obsstats';
import { FileSettingsStore, defaults, type Settings } from './settings';
import { cleanSite, pair, SiteClient, Unauthorized, type QueueRow } from './site';
import { Startup, type StartupEvent, type StartupStep } from './startup';
import { checkText, releaseUrl, updatedTo, updateText, type UpdateStage } from './update';

// Development only: `npm start -- --demo-startup [--shots=<folder>]` walks the start-up window through its states and then shows the
// window with made-up data (and saves PNGs of each when a folder is given). Ignored in the installed app.
const DEMO = !app.isPackaged && process.argv.includes('--demo-startup');
const build = readBuildInfo(join(__dirname, '..', 'build-info.json')); // written by `npm run dist`; none in a dev run
if (process.env.TCG_BRIDGE_DATA) app.setPath('userData', process.env.TCG_BRIDGE_DATA); // for trying the app against a local site
else if (DEMO) app.setPath('userData', join(tmpdir(), 'tcg-bridge-demo')); // never the real settings
app.setAppUserModelId('app.cheesytcg.bridge'); // Windows notifications need it

const ASSETS = join(__dirname, '..', 'assets');
const RENDERER = join(__dirname, '..', 'renderer');
const TRAY_TEXT: Record<TrayLevel, string> = { connected: 'connected', partly: 'partly connected', offline: 'not connected' };
const SIX_HOURS = 6 * 60 * 60 * 1000;

let win: BrowserWindow | null = null;
let feedWin: BrowserWindow | null = null; // the live pull feed (55.11)
let summaryWin: BrowserWindow | null = null;
let lastSummary: Summary | null = null;
let splash: BrowserWindow | null = null;
let startup = new Startup(Date.now());
let startupTimer: ReturnType<typeof setInterval> | undefined;
let handedOver = false;
let startNote = ''; // "Couldn't check for updates", from the start-up check
let demoState: object | null = null; // the demo window shows this instead of the real state
let tray: Tray | null = null;
let service: BridgeService | null = null;
let ledger: Ledger | null = null; // every deduct and add this PC made (bucks.ts), kept across reconnects
let client: SiteClient | null = null;
let control: ControlServer | null = null; // the Stream Deck buttons (control.ts)
let hotkeys: Hotkeys | null = null;
let hotkeyErrors: Partial<Record<HotkeyName, string>> = {};
let paused: boolean | null = null; // pulls paused on the site; null until the site has said
let pauseReason = ''; // why pulls are paused: "scene <name>" when a chosen OBS scene did it (57.2), else ''
let happy: HappyFacts | null = null; // the site's running happy hour (57.3), as the site last said; never decided here
let commandsMissing: string[] | null = null; // the Mix It Up commands the site expects and does not find (57.8); null until the site has said. Shown only, nothing in Mix It Up is changed
let scenePause: ScenePause | null = null; // pauses pulls while a chosen OBS scene is on air (57.2)
let statFacts: StatFacts | null = null; // what the site last said for the OBS text sources (57.4); null until it has answered
let statWriter: TextWriter | null = null;
let statsAt = 0;
let statsObsUp = false;
const STATS_MS = 5000; // how often the site is asked while a stat is mapped and OBS is connected
let eventLines: EventLine[] = []; // the last event rewards the site sent (57.7), newest first
let eventsAt = 0; // when the site was last asked for them
const EVENTS_OPEN_MS = 5000; // while the window or the feed window is open
const EVENTS_IDLE_MS = 30_000; // otherwise
let buffs: { id: string; name: string }[] = []; // the buffs switched on for the Stream Deck
let staff = false; // the site says an admin switched "Staff tools on this PC" on (55.12)
let tradingPaused = false;
let staffTools: StaffTools | null = null;
let lastControl = ''; // what the last button, hotkey or switch got
let lastChecklist: (ChecklistResult & { at: number }) | null = null; // the last pre-stream checklist (57.1)
let queueRows: QueueRow[] = [];
let queueAt = 0;
let menuFor = '';
let store: FileSettingsStore;
let logger: Logger | null = null;
let settings: Settings = defaults();
let alerts = new Alerts();
let update: UpdateStage = { stage: 'idle' };
let updatedNote = ''; // "Updated to x.y.z", until the streamer dismisses it
let quitting = false;

const log = (line: string): void => logger?.log(line);
const trayIcon = (level: TrayLevel) => nativeImage.createFromPath(join(ASSETS, `tray-${level}.png`));
/** Every Stream Deck button, for the window (the key is in each address) and its Copy. */
const buttons = (): { label: string; url: string }[] => {
  const key = settings.controlKey;
  return [
    { label: 'Pause or resume pulls', url: buttonUrl(key, 'pause') },
    { label: 'Refresh the overlay', url: buttonUrl(key, 'refresh') },
    { label: 'Last buff again', url: buttonUrl(key, 'last-buff') },
    ...buffs.map(b => ({ label: `Buff: ${b.name}`, url: buttonUrl(key, `buff/${encodeURIComponent(b.id)}`) })),
  ];
};
const appState = (): object => demoState ?? ({
  startNote,
  paired: !!settings.token,
  site: settings.site,
  pairedAs: settings.pairedAs,
  startWithWindows: settings.startWithWindows,
  obsSettings: { enabled: settings.obsEnabled, address: settings.obsAddress, hasPassword: !!settings.obsPassword, startReplay: settings.obsStartReplay }, // never the password itself
  alerts: settings.alerts,
  mixItUp: { startWithBridge: settings.startMixItUp, path: settings.mixItUpPath || defaultMixItUpPath() },
  tools: { feed: settings.feed, summary: settings.summary, startObs: settings.startObs, obsPath: settings.obsPath || defaultObsPath() },
  staff,
  checklist: lastChecklist,
  notices: settings.notices,
  scenePause: { ...settings.scenePause, obsScenes: sceneList() },
  events: eventLines,
  commandsMissing,
  obsStats: { map: settings.obsStats, texts: service?.obs.textSources() ?? [], stats: STAT_IDS.map(id => ({ id, label: STAT_LABELS[id] })) },
  control: { error: control?.error ?? '', paused, reason: pauseReason, happy, last: lastControl, hotkeys: settings.hotkeys, hotkeyErrors, buttons: buttons() },
  appVersion: app.getVersion(),
  about: aboutParts(app.getVersion(), build),
  update: updateText(update),
  updateVersion: update.stage === 'available' ? update.version : '',
  updatedTo: updatedNote,
  service: service?.state ?? null,
});

/** Shows a notification for each drop or return the alerts class reports (and always logs it). */
function tickAlerts(): void {
  if (!service) return;
  for (const n of alerts.update(snapshotOf(service.state), Date.now())) {
    log(`Alert (${n.kind}): ${n.title}`);
    if (!settings.alerts || !Notification.isSupported()) continue;
    const note = new Notification({ title: n.title, body: n.body });
    note.on('click', showWindow);
    note.show();
  }
}

const trayTip = (level: TrayLevel = service?.state.tray ?? 'offline'): string => `TCG Bridge: ${TRAY_TEXT[level]}${happy && happyText(happy, Date.now()) ? '\n' + happyText(happy, Date.now()) : ''}`;

/** Once a second while a happy hour runs: the tooltip counts down; when it runs out here, ask the site (which has the last word). */
function tickHappy(): void {
  if (!happy) return;
  if (happy.endsAt <= Date.now()) { happy = null; push(); void loadStatus(); return; }
  tray?.setToolTip(trayTip());
}

function push(): void {
  const level = service?.state.tray ?? 'offline';
  tray?.setImage(trayIcon(level));
  tray?.setToolTip(trayTip(level));
  if (win && !win.isDestroyed()) win.webContents.send('state', appState());
  tickAlerts();
  scenePause?.update(settings.scenePause, !!service?.state.obs.connected, service?.state.obs.scene ?? '');
  const menu =`${paused}${!!client}${!!happy}${staff}${tradingPaused}${staff ? sceneList().join('|') : ''}${update.stage === 'available' ? update.version : ''}`;
  if (menu !== menuFor) { menuFor = menu; tray?.setContextMenu(trayMenu()); }
  if (service?.state.site === 'revoked' && settings.token) { // the site revoked this PC: forget the token so a restart does not retry it
    log('The site revoked this PC');
    settings = { ...settings, token: '' };
    void store.save(settings);
  }
}

/** One button, hotkey, switch or queue action: the site does it, the answer comes back in words. */
async function runControl(a: ControlAction): Promise<ControlResult> {
  if (!client) return { ok: false, text: 'Pair TCG Bridge first' };
  try {
    const r = await client.action(a);
    if (typeof r.paused === 'boolean') { paused = r.paused; pauseReason = r.reason ?? ''; }
    if (r.happyHour !== undefined) happy = r.happyHour;
    lastControl = r.message;
    log(`Control ${a.action}: ${r.ok ? 'ok' : 'failed'}, ${r.message}`);
    queueAt = 0;
    push();
    return { ok: r.ok, text: r.message };
  } catch (e) {
    return { ok: false, text: e instanceof Unauthorized ? 'Pair again' : e instanceof Error ? e.message : 'Something went wrong' };
  }
}

/** Asks the site whether pulls are paused and which buffs have a button. Quiet when the site cannot be reached. */
async function loadStatus(): Promise<void> {
  try {
    const r = await client?.action({ action: 'status' });
    if (!r) return;
    paused = r.paused ?? paused;
    if (typeof r.paused === 'boolean') pauseReason = r.reason ?? '';
    buffs = r.buffs ?? buffs;
    if (r.happyHour !== undefined) happy = r.happyHour;
    commandsMissing = r.commandsMissing ?? commandsMissing;
    staff = r.staff === true;
    tradingPaused = staff && (r.tradingPaused ?? tradingPaused);
    push();
  } catch { /* the next try is in 30 seconds */ }
}

/** Asks the site for the stats that are mapped to OBS text sources (57.4). Quiet when the site cannot be reached or is older than this app. */
async function loadStats(): Promise<void> {
  statsAt = Date.now();
  try {
    const r = await client?.action({ action: 'stats', stats: siteStats(settings.obsStats) });
    if (!r?.stats) return;
    statFacts = r.stats;
    if (r.happyHour !== undefined && JSON.stringify(r.happyHour) !== JSON.stringify(happy)) { happy = r.happyHour; push(); }
  } catch { /* asked again in a few seconds */ }
}

/** Asks the site for the event rewards newer than the ones held (57.7). Quiet when the site cannot be reached or is older than this app. */
async function loadEvents(): Promise<void> {
  eventsAt = Date.now();
  try {
    const r = await client?.action({ action: 'events', after: eventsAfter(eventLines) });
    if (!r?.events?.length) return;
    eventLines = mergeEvents(eventLines, r.events);
    push();
    if (feedWin && !feedWin.isDestroyed()) feedWin.webContents.send('feed-events', eventLines);
  } catch { /* asked again in a few seconds */ }
}

/** Every 5 seconds: ask for events when the window or the feed window is open, else every 30 seconds. */
function tickEvents(): void {
  if (!client) return;
  const open = !!feedWin || (!!win && !win.isDestroyed() && win.isVisible());
  if (Date.now() - eventsAt >= (open ? EVENTS_OPEN_MS : EVENTS_IDLE_MS)) void loadEvents();
}

/** Once a second: write the mapped stats that changed (TextWriter keeps it to one write a second per source), and ask the site now and then. Nothing happens until a stat is mapped. */
function tickStats(): void {
  const up = !!client && !!service?.obs.state.connected && STAT_IDS.some(id => settings.obsStats[id]);
  if (!up) { statsObsUp = false; return; }
  if (!statsObsUp) { statsObsUp = true; statWriter?.reset(); statsAt = 0; } // OBS just came up: write everything again
  statWriter?.push(wantedTexts(settings.obsStats, statFacts, happy, Date.now()));
  if (Date.now() - statsAt >= STATS_MS) void loadStats();
}

/** Documents\TCG Bridge\backups: the Brie Bucks CSVs (ROADMAP 55.10). */
const backupDir = () => join(app.getPath('documents'), 'TCG Bridge', 'backups');

const obsConfig = () => ({ enabled: settings.obsEnabled, address: settings.obsAddress, password: settings.obsPassword, startReplay: settings.obsStartReplay });

function connect(): void {
  logger?.addSecret(settings.token);
  logger?.addSecret(settings.obsPassword);
  const site = new SiteClient(settings.site, settings.token, app.getVersion(), build?.commit);
  client = site;
  const obs = new ObsWatcher({ site: settings.site, report: body => site.report(body) }, obsConfig());
  alerts = new Alerts();
  ledger ??= new Ledger(join(app.getPath('userData'), 'ledger.json'));
  service = new BridgeService({ client: site, mix: new MixItUpClient(), obs, onChange: push, log, ledger, backupDir: backupDir(), sinks: { feed: showPull, summary: showSummary, notice: showNotice }, version: app.getVersion(), commit: build?.commit, redact: text => (logger ? logger.redact(text) : redact(text)) });
  staffTools = new StaffTools({ client: site, mix: new MixItUpClient(), obs, currencyId: () => service?.state.currencyId ?? '', openExternal: url => shell.openExternal(url) });
  scenePause = new ScenePause(async scene => {
    const r = await site.action({ action: 'scene-pause', scene });
    if (!r.ok) throw new Error(r.message);
    if (typeof r.paused === 'boolean') { paused = r.paused; pauseReason = r.reason ?? ''; }
    log(`Scene pause: ${scene ? `${scene} is on air` : 'left a chosen scene'}, ${r.message}`);
    push();
  });
  statWriter = new TextWriter((source, text) => obs.setText(source, text));
  service.start();
  push();
  void loadStatus();
  reportFeed();
}

async function disconnect(): Promise<void> {
  const old = service;
  service = null;
  client = null;
  paused = null;
  happy = null;
  commandsMissing = null;
  pauseReason = '';
  scenePause?.stop();
  scenePause = null;
  statWriter = null;
  statFacts = null;
  statsObsUp = false;
  eventLines = [];
  eventsAt = 0;
  lastChecklist = null;
  buffs = [];
  staff = false;
  tradingPaused = false;
  staffTools = null;
  await old?.stop();
}

function applyAutoStart(): void {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.startWithWindows });
}

/** "Start Mix It Up with TCG Bridge": only when it is not already answering. */
async function startMixWithBridge(): Promise<void> {
  if (!settings.startMixItUp) return;
  if ((await new MixItUpClient().version().catch(() => 'answers')) !== null) return; // running, or at least listening
  const r = await startMixItUp(settings.mixItUpPath);
  log(r.ok ? 'Started Mix It Up with TCG Bridge' : `Could not start Mix It Up: ${r.error}`);
}

/** Tells the site whether the feed window is open: it queues a pull's details for this app only while it is (55.11). */
function reportFeed(): void {
  void client?.report({ type: 'feed', on: !!feedWin }).catch(() => undefined);
}

/** A small second window with the same lock-down as the others. It loads only its own file. */
function toolWindow(file: string, options: ConstructorParameters<typeof BrowserWindow>[0]): BrowserWindow {
  const w = new BrowserWindow({
    ...options, show: false, backgroundColor: '#0a0f21', icon: join(RENDERER, 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'tools-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  w.setMenu(null);
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', e => e.preventDefault());
  w.once('ready-to-show', () => w.show());
  void w.loadFile(join(RENDERER, file));
  return w;
}

/** Opens or closes the feed window to match the setting. */
function applyFeedWindow(): void {
  if (settings.feed.on && !feedWin) {
    feedWin = toolWindow('feed.html', { width: 340, height: 520, minWidth: 260, minHeight: 200, title: 'TCG pull feed', alwaysOnTop: settings.feed.onTop });
    feedWin.on('closed', () => { // closed with the X: the switch goes off, and the site stops queuing pulls for it
      feedWin = null;
      if (!quitting && settings.feed.on) { settings = { ...settings, feed: { ...settings.feed, on: false } }; void store.save(settings); push(); }
      reportFeed();
    });
    reportFeed();
  } else if (!settings.feed.on && feedWin) {
    feedWin.close();
  }
  if (settings.feed.on) feedWin?.setAlwaysOnTop(settings.feed.onTop);
}

/** One pull reveal from the site, for the feed window. Cleaned here: the image is dropped unless it is from the site or Vercel Blob. */
function showPull(raw: unknown): void {
  const item = cleanFeed(raw, settings.site);
  if (!item || !feedWin || feedWin.isDestroyed()) return;
  feedWin.webContents.send('feed-item', { item, play: shouldPlay(item.stars, settings.feed), volume: settings.feed.volume });
}

/** A staff notice from the site (55.13): a Windows notification that opens its page in the browser. Only on a staff PC, only a kind that is switched on, only a link on the paired site. */
function showNotice(raw: unknown): void {
  const n = staff ? cleanNotice(raw, settings.site, settings.notices) : null;
  if (!n) return;
  log(`Notice (${n.kind}): ${n.title}`);
  if (!Notification.isSupported()) return;
  const note = new Notification({ title: n.title, body: n.text });
  note.on('click', () => { void shell.openExternal(n.url); });
  note.show();
}

/** The end of stream summary: a Windows notification and the summary window. Only when the switch is on. */
function showSummary(raw: unknown): void {
  const s = cleanSummary(raw);
  if (!s || !settings.summary) return;
  lastSummary = s;
  log(`Stream summary: ${s.packs} packs, ${s.pullers} viewers`);
  if (Notification.isSupported()) {
    const note = new Notification({ title: 'Stream summary ready', body: `${s.packs} packs opened by ${s.pullers} viewers` });
    note.on('click', openSummary);
    note.show();
  }
  openSummary();
}

function openSummary(): void {
  if (summaryWin && !summaryWin.isDestroyed()) { summaryWin.show(); summaryWin.focus(); return sendSummary(); }
  summaryWin = toolWindow('summary.html', { width: 460, height: 560, minWidth: 340, minHeight: 360, title: 'Stream summary' });
  summaryWin.on('closed', () => { summaryWin = null; });
}

function sendSummary(): void {
  if (lastSummary && summaryWin && !summaryWin.isDestroyed()) summaryWin.webContents.send('summary-data', lastSummary);
}

/** "Start OBS with TCG Bridge": only when OBS is not already running. */
async function startObsWithBridge(): Promise<void> {
  if (!settings.startObs) return;
  if (await obsRunning()) return;
  const r = await startObs(settings.obsPath);
  log(r.ok ? 'Started OBS with TCG Bridge' : `Could not start OBS: ${r.error}`);
}

function showWindow(): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow(show: boolean): void {
  win = new BrowserWindow({
    width: 860, height: 640, minWidth: 700, minHeight: 520, show, frame: false, backgroundColor: '#0a0f21', title: 'TCG Bridge', icon: join(RENDERER, 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('close', e => { if (!quitting) { e.preventDefault(); win?.hide(); } });
  void win.loadFile(join(RENDERER, 'index.html'));
}

/** The start-up window: no frame, no taskbar button, can only listen for the step to show (splash-preload.ts). */
function createSplash(): void {
  splash = new BrowserWindow({
    width: 300, height: 360, frame: false, resizable: false, maximizable: false, minimizable: false, skipTaskbar: true, center: true,
    show: false, backgroundColor: '#0a0f21', title: 'TCG Bridge', icon: join(RENDERER, 'icon.png'),
    webPreferences: { preload: join(__dirname, 'splash-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splash.setMenu(null);
  splash.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  splash.webContents.on('will-navigate', e => e.preventDefault());
  splash.once('ready-to-show', () => { splash?.show(); sendSplash(startup.step); });
  splash.webContents.on('did-finish-load', () => sendSplash(startup.step));
  splash.on('closed', () => { splash = null; });
  void splash.loadFile(join(RENDERER, 'splash.html'));
}

function sendSplash(step: StartupStep): void {
  if (splash && !splash.isDestroyed()) splash.webContents.send('startup', { text: step.text, progress: step.progress, version: app.getVersion() });
}

function createTray(): void {
  tray = new Tray(trayIcon('offline'));
  tray.setToolTip('TCG Bridge: not connected');
  tray.on('click', showWindow);
  tray.setContextMenu(trayMenu());
}

const ADMIN_LINKS = [{ label: 'Dashboard', path: '/admin' }, { label: 'Mix It Up', path: '/admin/mixitup' }, { label: 'Overlay Editor', path: '/admin/overlay' }, { label: 'Users', path: '/admin/users' }];
const sceneList = (): string[] => service?.obs.sceneNames() ?? [];

/** Pauses or opens trading from the Staff tab or the tray (55.12). Pausing asks first, in a Windows dialog, so a mis-click cannot stop trading. */
async function setTrading(pause: boolean): Promise<{ ok: boolean; text: string }> {
  if (!staffTools || !staff) return { ok: false, text: 'Staff tools are off for this PC' };
  if (pause) {
    const options = { type: 'question' as const, buttons: ['Pause trading', 'Cancel'], defaultId: 1, cancelId: 1, title: 'Pause trading', message: 'Pause trading for everyone?', detail: 'Viewers cannot send or accept trades until you open it again.' };
    const answer = win && !win.isDestroyed() && win.isVisible() ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    if (answer.response !== 0) return { ok: false, text: 'Trading was left as it was.' };
  }
  const r = await staffTools.run({ op: 'do', action: 'trading', on: !pause });
  if (r.ok) tradingPaused = pause;
  log(`Staff: trading ${pause ? 'pause' : 'open'}: ${r.ok ? 'ok' : 'failed'}, ${r.text}`);
  push();
  return { ok: r.ok, text: r.text };
}

/** Quit the normal way (before-quit closes the service, OBS and the link) and start again: the start-up window then downloads and installs the update. */
function restartToUpdate(): void {
  log('Restarting to update');
  app.relaunch();
  app.quit();
}

const trayMenu = () => Menu.buildFromTemplate([
  { label: 'Open TCG Bridge', click: showWindow },
  { label: 'Checklist', enabled: !!client, click: () => { void checklist().then(r => { if (Notification.isSupported()) new Notification({ title: 'Pre-stream checklist', body: r.text }).show(); }); } },
  { label: 'Pause pulls', type: 'checkbox', checked: !!paused, enabled: !!client, click: () => { void runControl({ action: 'pause' }); } },
  { label: 'Happy hour', enabled: !!client, submenu: [
    ...HAPPY_PRESETS.map(p => ({ label: p.label, click: () => { void runControl(p.body); } })),
    { type: 'separator' as const },
    { label: 'End now', enabled: !!happy, click: () => { void runControl({ action: 'happy-hour-end' }); } },
  ] },
  ...staffMenu(),
  ...(update.stage === 'available' ? [{ label: `Restart to update ${update.version}`, click: restartToUpdate }] : []),
  { label: 'Quit', click: () => app.quit() },
]);

/** The tray items only a staff PC gets: pause trading and switch the OBS scene. */
function staffMenu(): MenuItemConstructorOptions[] {
  if (!staff) return [];
  return [
    { label: 'Pause trading', type: 'checkbox', checked: tradingPaused, click: () => { void setTrading(!tradingPaused); } },
    { label: 'Switch scene', enabled: sceneList().length > 0, submenu: sceneList().map(name => ({ label: name, click: () => { void staffTools?.run({ op: 'scene', name }).then(r => log(`Staff: scene ${name}: ${r.ok ? 'ok' : 'failed'}, ${r.text}`)); } })) },
    { label: 'Admin', submenu: ADMIN_LINKS.map(l => ({ label: l.label, click: () => { void staffTools?.run({ op: 'open', href: l.path }); } })) },
  ];
}

/** Every updater event goes through the start-up machine: it says what the start-up window shows, when to open the app, and what the window says about updates. */
function feed(e: StartupEvent): void {
  const checkingAtStart = startup.step.phase === 'checking';
  const step = startup.event(e, Date.now());
  if (e.type === 'available' && checkingAtStart && !step.handover) { // only the start-up window downloads
    autoUpdater.downloadUpdate().catch(() => undefined); // failures arrive as the 'error' event too
  }
  update = step.update;
  startNote = step.note;
  if (step.install && !quitting) {
    log('Update downloaded at start-up: installing');
    quitting = true;
    sendSplash(step);
    autoUpdater.quitAndInstall(true, true); // silent installer, then TCG Bridge starts again
    return;
  }
  afterStep(step);
}

function afterStep(step: StartupStep): void {
  if (!handedOver) sendSplash(step);
  if (step.handover && !handedOver) {
    handedOver = true;
    clearInterval(startupTimer);
    void launchApp();
  } else if (handedOver) push();
}

function setupUpdates(): void {
  if (!app.isPackaged) { feed({ type: 'none' }); return; } // nothing to update when run from source
  autoUpdater.autoDownload = false; // the start-up window downloads, see feed()
  autoUpdater.autoInstallOnAppQuit = false; // and installs: nothing installs on quit
  autoUpdater.on('checking-for-update', () => feed({ type: 'checking' }));
  autoUpdater.on('update-available', info => { log(`Update ${info.version} found`); feed({ type: 'available', version: info.version }); });
  autoUpdater.on('update-not-available', () => feed({ type: 'none' }));
  autoUpdater.on('download-progress', p => feed({ type: 'progress', percent: p.percent }));
  autoUpdater.on('update-downloaded', info => { log(`Update ${info.version} downloaded`); feed({ type: 'downloaded', version: info.version }); });
  autoUpdater.on('error', e => { log(`Update check failed: ${e instanceof Error ? e.message : 'unknown error'}`); feed({ type: 'error' }); /* offline or no release yet: try again later */ });
  const check = () => { autoUpdater.checkForUpdates().catch(() => undefined); }; // failures arrive as the 'error' event too
  startupTimer = setInterval(() => afterStep(startup.tick(Date.now())), 250); // the 8 second limit on the first check
  check();
  setInterval(check, SIX_HOURS);
}

const asText = (r: TestResult) => ({ ok: r.ok, text: r.text });

/** The pre-stream checklist (ROADMAP 57.1): looks at every part, keeps the result for the window and tells the site. Changes nothing. */
async function checklist(): Promise<TestResult> {
  const c = client;
  const svc = service;
  if (!c || !svc) return { ok: false, text: 'Pair TCG Bridge first' };
  const r = await runChecklist({ mix: new MixItUpClient(), channel: svc.state.channel, currencyId: svc.state.currencyId, facts: () => c.checklistFacts(), obsEnabled: settings.obsEnabled, obsCheck: () => svc.obs.checkNow() });
  lastChecklist = { ...r, at: Date.now() };
  log(`Checklist: ${r.summary} ${r.lines.filter(l => l.tone === 'bad').map(l => l.label).join(', ')}`.trim());
  push();
  void c.report({ type: 'checklist', lines: r.lines }).catch(e => log(`Checklist report failed: ${e instanceof Error ? e.message : 'unknown error'}`));
  return { ok: r.ready, text: r.summary };
}

function setupIpc(): void {
  ipcMain.handle('state', () => appState());
  ipcMain.handle('win-minimize', e => { BrowserWindow.fromWebContents(e.sender)?.minimize(); });
  ipcMain.handle('win-close', e => { BrowserWindow.fromWebContents(e.sender)?.close(); }); // the close handler hides it: the app stays in the tray
  ipcMain.handle('pair', async (_e, siteRaw: string, code: string) => {
    const site = cleanSite(siteRaw);
    if (!site) return { ok: false, error: 'The site address must start with https://' };
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return { ok: false, error: 'This PC cannot keep the pairing safe (Windows encryption is not available).' };
    logger?.addSecret(String(code).trim());
    try {
      const name = hostname();
      const token = await pair(site, code, name);
      logger?.addSecret(token);
      await disconnect();
      settings = { ...settings, site, token, pairedAs: name };
      await store.save(settings);
      log(`Paired with ${site} as ${name}`);
      connect();
      return { ok: true };
    } catch (e) {
      log(`Pairing failed: ${e instanceof Error ? e.message : 'unknown error'}`);
      return { ok: false, error: e instanceof Error && e.message ? e.message : 'Could not reach the site' };
    }
  });
  ipcMain.handle('unpair', async () => {
    await disconnect();
    settings = { ...settings, token: '', pairedAs: '' };
    await store.save(settings);
    log('Unpaired');
    push();
  });
  // password: undefined keeps the saved one, '' forgets it
  ipcMain.handle('obs-settings', async (_e, enabled: boolean, addressRaw: string, password?: string, startReplay?: boolean) => {
    const address = cleanObsAddress(addressRaw);
    if (!address) return { ok: false, error: 'The address must be ws://localhost:4455 or ws://127.0.0.1:4455 (your own port).' };
    if (password && !(await safeStorage.isAsyncEncryptionAvailable())) return { ok: false, error: 'This PC cannot keep the password safe (Windows encryption is not available).' };
    if (password) logger?.addSecret(password);
    settings = { ...settings, obsEnabled: !!enabled, obsAddress: address, obsStartReplay: !!startReplay, ...(typeof password === 'string' ? { obsPassword: password } : {}) };
    await store.save(settings);
    await service?.reconfigureObs(obsConfig());
    push();
    return { ok: true };
  });
  ipcMain.handle('start-with-windows', async (_e, on: boolean) => {
    settings = { ...settings, startWithWindows: on };
    await store.save(settings);
    applyAutoStart();
    push();
  });
  ipcMain.handle('alerts', async (_e, on: boolean) => {
    settings = { ...settings, alerts: !!on };
    await store.save(settings);
    push();
  });

  // ── Control from the PC (55.9): the pause switch, the hotkeys, the queue and the Stream Deck buttons ──
  ipcMain.handle('pause', (_e, on: boolean) => runControl({ action: 'pause', on: !!on }));
  ipcMain.handle('happy-start', (_e, minutes: number, kind: string, percent: number) => runControl({ action: 'happy-hour-start', minutes: Number(minutes), kind: kind === 'free' ? 'free' : 'discount', percent: Number(percent) })); // the site checks the numbers
  ipcMain.handle('happy-end', () => runControl({ action: 'happy-hour-end' }));
  ipcMain.handle('copy-button', (_e, i: number) => {
    const b = buttons()[Math.trunc(Number(i))];
    if (!b) return { ok: false, text: 'That button is gone' };
    clipboard.writeText(b.url);
    return { ok: true, text: 'Copied. Paste it into a Stream Deck "Website" action and tick "GET request in background".' };
  });
  ipcMain.handle('set-hotkeys', async (_e, map: Partial<HotkeyMap>) => {
    const next: HotkeyMap = { refresh: '', pause: '', lastBuff: '' };
    for (const k of HOTKEYS) next[k] = typeof map?.[k] === 'string' ? map[k]!.trim().slice(0, 40) : '';
    settings = { ...settings, hotkeys: next };
    await store.save(settings);
    hotkeyErrors = hotkeys?.apply(next) ?? {};
    push();
    return hotkeyErrors;
  });
  ipcMain.handle('queue', async () => { // read only while the window's queue section is open; at most every 5 s
    if (!client) return { ok: false, text: 'Pair TCG Bridge first', rows: [] };
    if (Date.now() - queueAt >= 5000) {
      try { queueRows = await client.queue(); queueAt = Date.now(); } catch (e) { return { ok: false, text: e instanceof Error ? e.message : 'Could not read the queue', rows: queueRows }; }
    }
    return { ok: true, text: '', rows: queueRows };
  });
  ipcMain.handle('queue-do', (_e, what: string) => runControl({ action: what === 'clear' ? 'clear-queue' : 'skip' }));

  // ── Staff tools (55.12): one request in, one answer out; the Staff tab asks only while it is open ──
  ipcMain.handle('staff', async (_e, req: Record<string, unknown>) => {
    if (!staffTools || !staff) return { ok: false, text: 'Staff tools are off for this PC' };
    try {
      const r = await staffTools.run(req && typeof req === 'object' ? req : {});
      const tp = r.data?.tradingPaused;
      if (r.ok && typeof tp === 'boolean' && tp !== tradingPaused) { tradingPaused = tp; push(); }
      if (req?.op === 'do') log(`Staff: ${String(req.action)}: ${r.ok ? 'ok' : 'failed'}, ${r.text}`);
      return r;
    } catch (e) {
      return { ok: false, text: e instanceof Unauthorized ? 'Pair again' : e instanceof Error ? e.message : 'Something went wrong' };
    }
  });
  ipcMain.handle('staff-trading', (_e, pause: boolean) => setTrading(!!pause));

  // ── Self-tests ──
  ipcMain.handle('test-mix', async (_e, name: string) => asText(await testMixItUp(new MixItUpClient(), String(name), service?.state.currencyId ?? '')));
  ipcMain.handle('test-chat', async () => asText(await sendTestChat(new MixItUpClient())));
  ipcMain.handle('checklist', async () => asText(await checklist()));
  ipcMain.handle('test-obs', async () => asText(service ? await checkObs(service.obs) : { ok: false, text: 'Pair TCG Bridge first' }));

  // ── Mix It Up: start it, choose where it is ──
  ipcMain.handle('start-mix', async () => {
    const r = await startMixItUp(settings.mixItUpPath);
    log(r.ok ? 'Started Mix It Up from the window' : `Could not start Mix It Up: ${r.error}`);
    return r.ok ? { ok: true, text: 'Starting Mix It Up. TCG Bridge notices as soon as its Developer API answers.' } : { ok: false, text: r.error };
  });
  ipcMain.handle('choose-mix', async () => {
    const options = { title: 'Choose MixItUp.exe', defaultPath: dirname(defaultMixItUpPath()), properties: ['openFile' as const], filters: [{ name: 'Mix It Up', extensions: ['exe'] }] };
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths[0]) return { ok: true, text: '' };
    if (!isMixItUpExe(picked.filePaths[0])) return { ok: false, text: 'That file is not called MixItUp.exe.' };
    settings = { ...settings, mixItUpPath: picked.filePaths[0] };
    await store.save(settings);
    push();
    return { ok: true, text: 'Saved. "Start Mix It Up" uses this file now.' };
  });
  ipcMain.handle('start-mix-with-bridge', async (_e, on: boolean) => {
    settings = { ...settings, startMixItUp: !!on };
    await store.save(settings);
    push();
  });

  // ── Diagnostics ──
  // ── Streamer tools (55.11): the feed window, the summary, starting OBS ──
  ipcMain.on('tools-ready', e => { // a tool window finished loading: give the summary window what it shows
    if (summaryWin && e.sender === summaryWin.webContents) sendSummary();
    if (feedWin && e.sender === feedWin.webContents) feedWin.webContents.send('feed-events', eventLines);
  });
  ipcMain.handle('copy-summary', () => {
    if (!lastSummary) return { ok: false, text: 'No summary yet' };
    clipboard.writeText(summaryMarkdown(lastSummary, service?.state.channel ?? ''));
    return { ok: true, text: 'Copied. Paste it into Discord.' };
  });
  ipcMain.handle('set-feed', async (_e, raw: Partial<FeedSettings>) => {
    settings = { ...settings, feed: cleanFeedSettings(raw, settings.feed) };
    await store.save(settings);
    applyFeedWindow();
    push();
  });
  ipcMain.handle('set-notice', async (_e, kind: unknown, on: unknown) => {
    if (!NOTICE_KINDS.some(k => k === kind)) return;
    settings = { ...settings, notices: { ...settings.notices, [kind as NoticeKind]: !!on } };
    await store.save(settings);
    push();
  });
  ipcMain.handle('set-scene-pause', async (_e, raw: unknown) => { // pause pulls on chosen scenes (57.2)
    settings = { ...settings, scenePause: cleanScenePause(raw) };
    await store.save(settings);
    push();
  });
  ipcMain.handle('set-obs-stats', async (_e, raw: unknown) => { // stats in OBS text sources (57.4): only text inputs OBS reported
    settings = { ...settings, obsStats: acceptStatMap(raw, service?.obs.textSources() ?? [], settings.obsStats) };
    await store.save(settings);
    statWriter?.reset();
    statsAt = 0;
    push();
  });
  ipcMain.handle('set-summary', async (_e, on: boolean) => {
    settings = { ...settings, summary: !!on };
    await store.save(settings);
    push();
  });
  ipcMain.handle('start-obs-with-bridge', async (_e, on: boolean) => {
    settings = { ...settings, startObs: !!on };
    await store.save(settings);
    push();
  });
  ipcMain.handle('choose-obs', async () => {
    const options = { title: 'Choose obs64.exe', defaultPath: dirname(defaultObsPath()), properties: ['openFile' as const], filters: [{ name: 'OBS Studio', extensions: ['exe'] }] };
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    if (picked.canceled || !picked.filePaths[0]) return { ok: true, text: '' };
    if (!isObsExe(picked.filePaths[0])) return { ok: false, text: 'That file is not called obs64.exe.' };
    settings = { ...settings, obsPath: picked.filePaths[0] };
    await store.save(settings);
    push();
    return { ok: true, text: 'Saved. "Start OBS with TCG Bridge" uses this file now.' };
  });

  ipcMain.handle('open-logs', async () => {
    const error = await shell.openPath(app.getPath('logs'));
    return { ok: !error, text: error ? 'Could not open the log folder' : '' };
  });
  ipcMain.handle('open-backups', async () => {
    mkdirSync(backupDir(), { recursive: true });
    const error = await shell.openPath(backupDir());
    return { ok: !error, text: error ? 'Could not open the backups folder' : '' };
  });
  ipcMain.handle('copy-diagnostics', () => {
    clipboard.writeText(diagnosticsText({
      versions: { app: app.getVersion(), electron: process.versions.electron, windows: `${osVersion()} (${release()})`, build: stampText(build) },
      site: settings.site, paired: !!settings.token, alerts: settings.alerts, state: service?.state ?? null,
    }, text => logger?.redact(text) ?? text));
    return { ok: true, text: 'Copied. Paste it into your message.' };
  });

  // ── Updates ──
  ipcMain.handle('check-update', async () => {
    if (!app.isPackaged) return { ok: false, text: 'Updates only work in the installed app' };
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, text: checkText(app.getVersion(), r?.isUpdateAvailable ? r.updateInfo.version : null) };
    } catch {
      return { ok: false, text: 'Could not check for updates (offline, or no release yet)' };
    }
  });
  ipcMain.handle('restart-to-update', () => { if (update.stage === 'available') restartToUpdate(); });
  ipcMain.handle('open-release', () => shell.openExternal(releaseUrl(app.getVersion())));
  ipcMain.handle('open-commit', () => (build ? shell.openExternal(commitUrl(build.full)) : undefined));
  ipcMain.handle('dismiss-updated', async () => {
    updatedNote = '';
    settings = { ...settings, lastSeenVersion: app.getVersion() };
    await store.save(settings);
    push();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => { quitting = true; hotkeys?.stop(); });
  app.on('window-all-closed', () => { /* stays in the tray */ });
  process.on('unhandledRejection', e => log(`Error: ${e instanceof Error ? e.message : String(e)}`));
  void app.whenReady().then(async () => {
    logger = new Logger(app.getPath('logs'));
    log(`TCG Bridge ${app.getVersion()} started`);
    startup = new Startup(Date.now());
    createSplash(); // first, on every launch (also when Windows starts the app minimised): it checks for an update, then launchApp opens the real window or only the tray
    if (DEMO) void (require('./demo') as typeof import('./demo')).runDemo({
      shots: process.argv.find(a => a.startsWith('--shots='))?.slice(8) ?? '',
      version: app.getVersion(), feed, sendSplash, getSplash: () => splash, getWindow: () => win, setState: s => { demoState = s; push(); },
      finish: () => { quitting = true; app.quit(); },
    });
    else setupUpdates();
  });
}

/** The real app: settings, tray, window, the link to the site. Runs once the start-up check is over. */
async function launchApp(): Promise<void> {
  store = new FileSettingsStore(app.getPath('userData'), {
    encrypt: s => safeStorage.encryptStringAsync(s),
    decrypt: async b => (await safeStorage.decryptStringAsync(b)).result,
  });
  settings = await store.load();
  updatedNote = updatedTo(settings.lastSeenVersion, app.getVersion());
  if (!settings.lastSeenVersion) { // the first run ever: nothing to announce
    settings = { ...settings, lastSeenVersion: app.getVersion() };
    await store.save(settings);
  }
  if (!settings.controlKey) { // the key in every Stream Deck button's address, made once
    settings = { ...settings, controlKey: newControlKey() };
    await store.save(settings);
  }
  control = new ControlServer(settings.controlKey, runControl);
  await control.start();
  if (control.error) log(control.error);
  hotkeys = new Hotkeys(globalShortcut, name => { void runControl(HOTKEY_ACTION[name]); });
  hotkeyErrors = hotkeys.apply(settings.hotkeys);
  applyAutoStart();
  setupIpc();
  createWindow(!settings.token); // paired: start minimised in the tray
  createTray();
  if (settings.token) connect();
  setInterval(() => void loadStatus(), 30_000); // the site's pause switch and happy hour can be changed elsewhere
  setInterval(tickHappy, 1000);
  setInterval(tickStats, 1000);
  setInterval(tickEvents, 5000);
  setInterval(tickAlerts, 5000); // the 15 seconds of "down" are counted here
  void startMixWithBridge();
  void startObsWithBridge();
  applyFeedWindow();
  setInterval(reportFeed, SIX_HOURS); // the site forgets the flag after a week
  setTimeout(() => splash?.close(), 600); // let "Starting" be read
}
