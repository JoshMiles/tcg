// The streamer tool windows' only link to the app (ROADMAP 55.11): listen for a pull, the feed's rows or the summary, pick a feed filter, and copy the summary. Sandboxed, so it may only require 'electron'.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('tools', {
  onFeed: (cb: (msg: unknown) => void): void => { ipcRenderer.on('feed-item', (_e, msg) => cb(msg)); },
  onRows: (cb: (msg: unknown) => void): void => { ipcRenderer.on('feed-rows', (_e, msg) => cb(msg)); },
  setFilter: (id: string): void => { ipcRenderer.send('feed-filter', id); },
  onSummary: (cb: (msg: unknown) => void): void => { ipcRenderer.on('summary-data', (_e, msg) => cb(msg)); },
  ready: (): void => { ipcRenderer.send('tools-ready'); },
  copySummary: (): Promise<{ ok: boolean; text: string }> => ipcRenderer.invoke('copy-summary'),
});

// The Preview overlay window (57.10): its address and canvas size, and the requests it may send (the main process refuses any other).
type Reply = Promise<{ ok: boolean; text: string; data?: Record<string, unknown> }>;
contextBridge.exposeInMainWorld('preview', {
  data: (): Reply => ipcRenderer.invoke('preview-data'),
  run: (req: Record<string, unknown>): Reply => ipcRenderer.invoke('preview-run', req),
});
