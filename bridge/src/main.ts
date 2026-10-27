// TCG Bridge, the Electron glue: one instance, a tray icon, a small window, auto start and updates. The logic is in the other modules.
import { app, BrowserWindow, ipcMain, Menu, nativeImage, safeStorage, Tray } from 'electron';
import { autoUpdater } from 'electron-updater';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { MixItUpClient } from './mixitup';
import { cleanObsAddress, ObsWatcher } from './obs';
import { BridgeService, type TrayLevel } from './service';
import { FileSettingsStore, defaults, type Settings } from './settings';
import { cleanSite, pair, SiteClient } from './site';

if (process.env.TCG_BRIDGE_DATA) app.setPath('userData', process.env.TCG_BRIDGE_DATA); // for trying the app against a local site

const ASSETS = join(__dirname, '..', 'assets');
const TRAY_TEXT: Record<TrayLevel, string> = { connected: 'connected', partly: 'partly connected', offline: 'not connected' };
const SIX_HOURS = 6 * 60 * 60 * 1000;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let service: BridgeService | null = null;
let store: FileSettingsStore;
let settings: Settings = defaults();
let updateText = '';
let quitting = false;

const trayIcon = (level: TrayLevel) => nativeImage.createFromPath(join(ASSETS, `tray-${level}.png`));
const appState = () => ({
  paired: !!settings.token,
  site: settings.site,
  pairedAs: settings.pairedAs,
  startWithWindows: settings.startWithWindows,
  obsSettings: { enabled: settings.obsEnabled, address: settings.obsAddress, hasPassword: !!settings.obsPassword }, // never the password itself
  appVersion: app.getVersion(),
  update: updateText,
  service: service?.state ?? null,
});

function push(): void {
  const level = service?.state.tray ?? 'offline';
  tray?.setImage(trayIcon(level));
  tray?.setToolTip(`TCG Bridge: ${TRAY_TEXT[level]}`);
  if (win && !win.isDestroyed()) win.webContents.send('state', appState());
  if (service?.state.site === 'revoked' && settings.token) { // the site revoked this PC: forget the token so a restart does not retry it
    settings = { ...settings, token: '' };
    void store.save(settings);
  }
}

const obsConfig = () => ({ enabled: settings.obsEnabled, address: settings.obsAddress, password: settings.obsPassword });

function connect(): void {
  const client = new SiteClient(settings.site, settings.token, app.getVersion());
  const obs = new ObsWatcher({ site: settings.site, report: body => client.report(body) }, obsConfig());
  service = new BridgeService({ client, mix: new MixItUpClient(), obs, onChange: push });
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

function showWindow(): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow(show: boolean): void {
  win = new BrowserWindow({
    width: 560, height: 720, show, title: 'TCG Bridge', icon: join(ASSETS, 'tray-connected.png'), autoHideMenuBar: true,
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
  autoUpdater.on('update-available', info => { updateText = `Downloading version ${info.version}`; push(); });
  autoUpdater.on('update-downloaded', info => { updateText = `Version ${info.version} installs when you quit TCG Bridge`; push(); });
  autoUpdater.on('error', () => { /* offline or no release yet: try again later */ });
  const check = () => { autoUpdater.checkForUpdates().catch(() => undefined); };
  check();
  setInterval(check, SIX_HOURS);
}

function setupIpc(): void {
  ipcMain.handle('state', () => appState());
  ipcMain.handle('pair', async (_e, siteRaw: string, code: string) => {
    const site = cleanSite(siteRaw);
    if (!site) return { ok: false, error: 'The site address must start with https://' };
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return { ok: false, error: 'This PC cannot keep the pairing safe (Windows encryption is not available).' };
    try {
      const name = hostname();
      const token = await pair(site, code, name);
      await disconnect();
      settings = { ...settings, site, token, pairedAs: name };
      await store.save(settings);
      connect();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error && e.message ? e.message : 'Could not reach the site' };
    }
  });
  ipcMain.handle('unpair', async () => {
    await disconnect();
    settings = { ...settings, token: '', pairedAs: '' };
    await store.save(settings);
    push();
  });
  // password: undefined keeps the saved one, '' forgets it
  ipcMain.handle('obs-settings', async (_e, enabled: boolean, addressRaw: string, password?: string) => {
    const address = cleanObsAddress(addressRaw);
    if (!address) return { ok: false, error: 'The address must be ws://localhost:4455 or ws://127.0.0.1:4455 (your own port).' };
    if (password && !(await safeStorage.isAsyncEncryptionAvailable())) return { ok: false, error: 'This PC cannot keep the password safe (Windows encryption is not available).' };
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
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { /* stays in the tray */ });
  void app.whenReady().then(async () => {
    store = new FileSettingsStore(app.getPath('userData'), {
      encrypt: s => safeStorage.encryptStringAsync(s),
      decrypt: async b => (await safeStorage.decryptStringAsync(b)).result,
    });
    settings = await store.load();
    applyAutoStart();
    setupIpc();
    createWindow(!settings.token); // paired: start minimised in the tray
    createTray();
    if (settings.token) connect();
    setupUpdates();
  });
}
