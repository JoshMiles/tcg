// The streamer tool windows' only link to the app (ROADMAP 55.11): listen for a pull or the summary, and copy the summary. Sandboxed, so it may only require 'electron'.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('tools', {
  onFeed: (cb: (msg: unknown) => void): void => { ipcRenderer.on('feed-item', (_e, msg) => cb(msg)); },
  onEvents: (cb: (msg: unknown) => void): void => { ipcRenderer.on('feed-events', (_e, msg) => cb(msg)); },
  onSummary: (cb: (msg: unknown) => void): void => { ipcRenderer.on('summary-data', (_e, msg) => cb(msg)); },
  ready: (): void => { ipcRenderer.send('tools-ready'); },
  copySummary: (): Promise<{ ok: boolean; text: string }> => ipcRenderer.invoke('copy-summary'),
});
