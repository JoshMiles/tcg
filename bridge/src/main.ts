// TCG Bridge, the Electron glue: one instance, a tray icon, a small window, auto start and updates. The logic is in the other modules.
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, Notification, safeStorage, shell, Tray } from 'electron';
import { autoUpdater } from 'electron-updater';
import { hostname, release, version as osVersion } from 'node:os';
import { dirname, join } from 'node:path';
import { Alerts, snapshotOf } from './alerts';
import { diagnosticsText } from './diagnostics';
import { defaultMixItUpPath, isMixItUpExe, startMixItUp } from './launch';
import { Logger } from './log';
import { MixItUpClient } from './mixitup';
import { cleanObsAddress, ObsWatcher } from './obs';
import { checkObs, sendTestChat, testMixItUp, type TestResult } from './selftest';
import { BridgeService, type TrayLevel } from './service';
import { FileSettingsStore, defaults, type Settings } from './settings';
import { cleanSite, pair, SiteClient } from './site';
import { checkText, releaseUrl, updatedTo, updateText, type UpdateStage } from './update';

if (process.env.TCG_BRIDGE_DATA) app.setPath('userData', process.env.TCG_BRIDGE_DATA); // for trying the app against a local site
app.setAppUserModelId('app.cheesytcg.bridge'); // Windows notifications need it

const ASSETS = join(__dirname, '..', 'assets');
const TRAY_TEXT: Record<TrayLevel, string> = { connected: 'connected', partly: 'partly connected', offline: 'not connected' };
const SIX_HOURS = 6 * 60 * 60 * 1000;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let service: BridgeService | null = null;
let store: FileSettingsStore;
let logger: Logger | null = null;
let settings: Settings = defaults();
let alerts = new Alerts();
let update: UpdateStage = { stage: 'idle' };
let updatedNote = ''; // "Updated to x.y.z", until the streamer dismisses it
let quitting = false;

const log = (line: string): void => logger?.log(line);
const trayIcon = (level: TrayLevel) => nativeImage.createFromPath(join(ASSETS, `tray-${level}.png`));
const appState = () => ({
  paired: !!settings.token,
  site: settings.site,
  pairedAs: settings.pairedAs,
  startWithWindows: settings.startWithWindows,
  obsSettings: { enabled: settings.obsEnabled, address: settings.obsAddress, hasPassword: !!settings.obsPassword }, // never the password itself
  alerts: settings.alerts,
  mixItUp: { startWithBridge: settings.startMixItUp, path: settings.mixItUpPath || defaultMixItUpPath() },
  appVersion: app.getVersion(),
  update: updateText(update),
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

function push(): void {
  const level = service?.state.tray ?? 'offline';
  tray?.setImage(trayIcon(level));
  tray?.setToolTip(`TCG Bridge: ${TRAY_TEXT[level]}`);
  if (win && !win.isDestroyed()) win.webContents.send('state', appState());
  tickAlerts();
  if (service?.state.site === 'revoked' && settings.token) { // the site revoked this PC: forget the token so a restart does not retry it
    log('The site revoked this PC');
    settings = { ...settings, token: '' };
    void store.save(settings);
  }
}

const obsConfig = () => ({ enabled: settings.obsEnabled, address: settings.obsAddress, password: settings.obsPassword });

function connect(): void {
  logger?.addSecret(settings.token);
  logger?.addSecret(settings.obsPassword);
  const client = new SiteClient(settings.site, settings.token, app.getVersion());
  const obs = new ObsWatcher({ site: settings.site, report: body => client.report(body) }, obsConfig());
  alerts = new Alerts();
  service = new BridgeService({ client, mix: new MixItUpClient(), obs, onChange: push, log });
  service.start();
  push();
}

async function disconnect(): Promise<void> {
  const old = service;
  service = null;
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

function showWindow(): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow(show: boolean): void {
  win = new BrowserWindow({
    width: 600, height: 800, show, title: 'TCG Bridge', icon: join(ASSETS, 'tray-connected.png'), autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.on('close', e => { if (!quitting) { e.preventDefault(); win?.hide(); } });
  void win.loadFile(join(__dirname, '..', 'renderer', 'index.html'));
}

function createTray(): void {
  tray = new Tray(trayIcon('offline'));
  tray.setToolTip('TCG Bridge: not connected');
  tray.on('click', showWindow);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open TCG Bridge', click: showWindow },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

function setupUpdates(): void {
  if (!app.isPackaged) return;
  autoUpdater.on('update-available', info => { update = { stage: 'downloading', version: info.version }; log(`Update ${info.version} found`); push(); });
  autoUpdater.on('update-downloaded', info => { update = { stage: 'ready', version: info.version }; log(`Update ${info.version} downloaded`); push(); });
  autoUpdater.on('error', e => { log(`Update check failed: ${e instanceof Error ? e.message : 'unknown error'}`); /* offline or no release yet: try again later */ });
  const check = () => { autoUpdater.checkForUpdates().catch(() => undefined); };
  check();
  setInterval(check, SIX_HOURS);
}

const asText = (r: TestResult) => ({ ok: r.ok, text: r.text });

function setupIpc(): void {
  ipcMain.handle('state', () => appState());
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
  ipcMain.handle('obs-settings', async (_e, enabled: boolean, addressRaw: string, password?: string) => {
    const address = cleanObsAddress(addressRaw);
    if (!address) return { ok: false, error: 'The address must be ws://localhost:4455 or ws://127.0.0.1:4455 (your own port).' };
    if (password && !(await safeStorage.isAsyncEncryptionAvailable())) return { ok: false, error: 'This PC cannot keep the password safe (Windows encryption is not available).' };
    if (password) logger?.addSecret(password);
    settings = { ...settings, obsEnabled: !!enabled, obsAddress: address, ...(typeof password === 'string' ? { obsPassword: password } : {}) };
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

  // ── Self-tests ──
  ipcMain.handle('test-mix', async (_e, name: string) => asText(await testMixItUp(new MixItUpClient(), String(name), service?.state.currencyId ?? '')));
  ipcMain.handle('test-chat', async () => asText(await sendTestChat(new MixItUpClient())));
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
  ipcMain.handle('open-logs', async () => {
    const error = await shell.openPath(app.getPath('logs'));
    return { ok: !error, text: error ? 'Could not open the log folder' : '' };
  });
  ipcMain.handle('copy-diagnostics', () => {
    clipboard.writeText(diagnosticsText({
      versions: { app: app.getVersion(), electron: process.versions.electron, windows: `${osVersion()} (${release()})` },
      site: settings.site, paired: !!settings.token, alerts: settings.alerts, state: service?.state ?? null,
    }, text => logger?.redact(text) ?? text));
    return { ok: true, text: 'Copied. Paste it into your message.' };
  });

  // ── Updates ──
  ipcMain.handle('check-update', async () => {
    if (!app.isPackaged) return { ok: false, text: 'Updates only work in the installed app' };
    try {
      const r = await autoUpdater.checkForUpdates();
      return { ok: true, text: checkText(app.getVersion(), r?.isUpdateAvailable ? r.updateInfo.version : null, update) };
    } catch {
      return { ok: false, text: 'Could not check for updates (offline, or no release yet)' };
    }
  });
  ipcMain.handle('open-release', () => shell.openExternal(releaseUrl(app.getVersion())));
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
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { /* stays in the tray */ });
  process.on('unhandledRejection', e => log(`Error: ${e instanceof Error ? e.message : String(e)}`));
  void app.whenReady().then(async () => {
    logger = new Logger(app.getPath('logs'));
    store = new FileSettingsStore(app.getPath('userData'), {
      encrypt: s => safeStorage.encryptStringAsync(s),
      decrypt: async b => (await safeStorage.decryptStringAsync(b)).result,
    });
    settings = await store.load();
    log(`TCG Bridge ${app.getVersion()} started`);
    updatedNote = updatedTo(settings.lastSeenVersion, app.getVersion());
    if (!settings.lastSeenVersion) { // the first run ever: nothing to announce
      settings = { ...settings, lastSeenVersion: app.getVersion() };
      await store.save(settings);
    }
    applyAutoStart();
    setupIpc();
    createWindow(!settings.token); // paired: start minimised in the tray
    createTray();
    if (settings.token) connect();
    setupUpdates();
    setInterval(tickAlerts, 5000); // the 15 seconds of "down" are counted here
    void startMixWithBridge();
  });
}
