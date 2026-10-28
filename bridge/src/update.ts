// Words and addresses for updates. Plain TypeScript, no Electron: main.ts owns electron-updater.
// Updates download and install only in the start-up window; while running, a newer version is only announced.
export type UpdateStage = { stage: 'idle' } | { stage: 'available'; version: string };

export const releaseUrl = (version: string): string => `https://github.com/JoshMiles/tcg/releases/tag/bridge-v${version}`;

export function updateText(u: UpdateStage): string {
  return u.stage === 'available' ? `Version ${u.version} is available. Restart TCG Bridge to install it.` : '';
}

/** What "Check for updates" answers. `latest` is what the check found: null = nothing newer. */
export function checkText(current: string, latest: string | null): string {
  return latest === null ? `You are up to date (version ${current})` : updateText({ stage: 'available', version: latest });
}

/** The version to announce as "Updated to ...", or '' on the first run ever or when nothing changed. */
export const updatedTo = (lastSeen: string, current: string): string => (lastSeen && lastSeen !== current ? current : '');
