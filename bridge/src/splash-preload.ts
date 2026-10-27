// The start-up window's only link to the app: it can listen for the step to show, and nothing else. Sandboxed, so it may only require 'electron'.
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('splash', {
  onStep: (cb: (step: unknown) => void): void => { ipcRenderer.on('startup', (_e, step) => cb(step)); },
});
