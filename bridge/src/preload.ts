// The only thing the window can reach. Runs in the sandboxed preload world, so it may only require 'electron'.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('bridge', {
  getState: (): Promise<unknown> => ipcRenderer.invoke('state'),
  onState: (cb: (state: unknown) => void): void => { ipcRenderer.on('state', (_e, state) => cb(state)); },
  pair: (site: string, code: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('pair', String(site), String(code)),
  unpair: (): Promise<void> => ipcRenderer.invoke('unpair'),
  setStartWithWindows: (on: boolean): Promise<void> => ipcRenderer.invoke('start-with-windows', !!on),
});
