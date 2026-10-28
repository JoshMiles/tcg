// Installing the Stream Deck plugin (ROADMAP 57.13). Plain TypeScript, no Electron: where the Stream Deck app and the installed plugin are, and whether the plugin is out of date.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const PLUGIN_UUID = 'tv.cheesygidds.tcgbridge';
/** The packed plugin, shipped inside the app (electron-builder extraResources) and built by `npm run deck`. */
export const PLUGIN_FILE = 'TCG Bridge.streamDeckPlugin';

/** What the lookups read, so the checks can fake a PC. */
export interface DeckEnv { programFiles: string[]; appData: string; exists(path: string): boolean; read(path: string): string }
export const realEnv = (): DeckEnv => ({
  programFiles: [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter((p): p is string => !!p),
  appData: process.env.APPDATA ?? '',
  exists: existsSync,
  read: p => readFileSync(p, 'utf8'),
});

const pluginFolder = (env: DeckEnv) => join(env.appData, 'Elgato', 'StreamDeck', 'Plugins', `${PLUGIN_UUID}.sdPlugin`);

/** The Stream Deck app installs for all users into Program Files; a plugin of ours already installed also proves it. A leftover settings folder alone does not (it stays after an uninstall). */
export function streamDeckAppFound(env: DeckEnv): boolean {
  return env.programFiles.some(p => env.exists(join(p, 'Elgato', 'StreamDeck', 'StreamDeck.exe'))) || (!!env.appData && env.exists(join(pluginFolder(env), 'manifest.json')));
}

/** The installed plugin's manifest version ("0.24.0.0"), or '' when it is not installed. */
export function installedPluginVersion(env: DeckEnv): string {
  if (!env.appData) return '';
  try {
    const v = (JSON.parse(env.read(join(pluginFolder(env), 'manifest.json'))) as { Version?: unknown }).Version;
    return typeof v === 'string' ? v : '';
  } catch { return ''; }
}

/** The plugin's manifest version for an app version: always the app's with a build number of 0. */
export const manifestVersion = (appVersion: string): string => `${appVersion}.0`;

/** The plugin is installed and is not this app's version. */
export const pluginOutdated = (installed: string, appVersion: string): boolean => !!installed && installed !== manifestVersion(appVersion);
