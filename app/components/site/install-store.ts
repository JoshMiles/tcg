'use client';

// Remembers the browser's "install this app" prompt for the whole page. Chrome, Edge and Android browsers fire
// `beforeinstallprompt` once, early, and only the first listener to catch it can use it, so this module (loaded with the page's
// scripts, before the components hydrate) catches it and holds it until a button asks for it.

export interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallPromptEvent; notify(); });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; notify(); });
}

export const getInstallPrompt = () => deferred;
export const wasInstalled = () => installed;

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Shows the browser's own install dialog. Returns whether they accepted (false when there is no prompt to show). */
export async function askToInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null; // a prompt can only be used once
  notify();
  await e.prompt();
  return (await e.userChoice).outcome === 'accepted';
}

/** Already running as an installed app (home-screen launch on iOS, or an installed PWA window elsewhere)? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
