// Words and addresses for updates. Plain TypeScript, no Electron: main.ts owns electron-updater.
export type UpdateStage = { stage: 'idle' } | { stage: 'downloading'; version: string } | { stage: 'ready'; version: string };

export const releaseUrl = (version: string): string => `https://github.com/JoshMiles/tcg/releases/tag/bridge-v${version}`;

export function updateText(u: UpdateStage): string {
  if (u.stage === 'downloading') return `Downloading version ${u.version}`;
  if (u.stage === 'ready') return `Version ${u.version} is ready: it installs when you quit TCG Bridge (restart to update)`;
  return '';
}

/** What "Check for updates" answers. `latest` is what the check found: null = nothing newer. */
export function checkText(current: string, latest: string | null, u: UpdateStage): string {
  if (latest === null) return `You are up to date (version ${current})`;
  return updateText(u.stage === 'idle' ? { stage: 'downloading', version: latest } : u);
}

/** The version to announce as "Updated to ...", or '' on the first run ever or when nothing changed. */
export const updatedTo = (lastSeen: string, current: string): string => (lastSeen && lastSeen !== current ? current : '');
