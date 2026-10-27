// The only thing the window can reach. Runs in the sandboxed preload world, so it may only require 'electron'.
import { contextBridge, ipcRenderer } from 'electron';

type Result = Promise<{ ok: boolean; text: string }>;

contextBridge.exposeInMainWorld('bridge', {
  minimize: (): Promise<void> => ipcRenderer.invoke('win-minimize'),
  closeToTray: (): Promise<void> => ipcRenderer.invoke('win-close'),
  getState:(): Promise<unknown> => ipcRenderer.invoke('state'),
  onState: (cb: (state: unknown) => void): void => { ipcRenderer.on('state', (_e, state) => cb(state)); },
  pair: (site: string, code: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('pair', String(site), String(code)),
  unpair: (): Promise<void> => ipcRenderer.invoke('unpair'),
  setObs: (enabled: boolean, address: string, password?: string, startReplay?: boolean): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('obs-settings', !!enabled, String(address), typeof password === 'string' ? password : undefined, !!startReplay),
  setStartWithWindows: (on: boolean): Promise<void> => ipcRenderer.invoke('start-with-windows', !!on),
  setAlerts: (on: boolean): Promise<void> => ipcRenderer.invoke('alerts', !!on),
  testMixItUp: (name: string): Result => ipcRenderer.invoke('test-mix', String(name)),
  testChat: (): Result => ipcRenderer.invoke('test-chat'),
  testObs: (): Result => ipcRenderer.invoke('test-obs'),
  startMixItUp: (): Result => ipcRenderer.invoke('start-mix'),
  chooseMixItUp: (): Result => ipcRenderer.invoke('choose-mix'),
  setStartMixItUp: (on: boolean): Promise<void> => ipcRenderer.invoke('start-mix-with-bridge', !!on),
  openLogs: (): Result => ipcRenderer.invoke('open-logs'),
  copyDiagnostics: (): Result => ipcRenderer.invoke('copy-diagnostics'),
  checkUpdate: (): Result => ipcRenderer.invoke('check-update'),
  openRelease: (): Promise<void> => ipcRenderer.invoke('open-release'),
  dismissUpdated: (): Promise<void> => ipcRenderer.invoke('dismiss-updated'),
});
