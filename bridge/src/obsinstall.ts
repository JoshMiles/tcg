// Installing the OBS plugin (ROADMAP 62.5). Plain TypeScript, no Electron: where OBS and the installed plugin are, whether the plugin is out of date, what OBS version is
// installed, and the copy into OBS's per-machine plugin folder.
import { execFile } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The OBS major version the plugin is built against (obs-plugin/buildspec.json, "obs-studio"); check-obsinstall.ts fails when the two differ. */
export const OBS_TARGET_MAJOR = 31;
/** The module's name in OBS (obs-plugin/buildspec.json "name"). */
export const MODULE = 'tcg-obs';
/** The built plugin folder (bin/64bit/tcg-obs.dll and data/), shipped inside the app (electron-builder extraResources) and built by obs-plugin.yml. */
export const OBS_PLUGIN_RESOURCE = 'obs-plugin/tcg-obs';
export const MARKER = 'version.txt';

/** What the lookups read, so the checks can fake a PC. */
export interface ObsEnv { programData: string; exePaths: string[]; exists(path: string): boolean; read(path: string): string }
export const realObsEnv = (exePaths: string[]): ObsEnv => ({ programData: process.env.ProgramData ?? '', exePaths, exists: existsSync, read: p => readFileSync(p, 'utf8') });

/**
 * OBS 30 and 31 load plugins from `%ProgramData%\obs-studio\plugins\<module>\bin\64bit` (the DLL) and `...\<module>\data` for every user of the PC, next to the
 * `Program Files\obs-studio\obs-plugins` folder that needs admin rights. ProgramData lets a standard user create and change their own folders, so no admin is needed.
 */
export const pluginRoot = (env: ObsEnv): string => join(env.programData, 'obs-studio', 'plugins', MODULE);
export const pluginDll = (env: ObsEnv): string => join(pluginRoot(env), 'bin', '64bit', `${MODULE}.dll`);

/** The first obs64.exe that exists. '' = OBS is not installed (or not where we look: Choose obs64.exe... on the OBS page). */
export const obsExeFound = (env: ObsEnv): string => env.exePaths.find(p => !!p && env.exists(p)) ?? '';

/** The version written beside the installed plugin ("0.44.0"), or '' when it is not installed. The DLL must exist too, so a half-removed folder reads as not installed. */
export function installedObsPluginVersion(env: ObsEnv): string {
  if (!env.programData || !env.exists(pluginDll(env))) return '';
  try {
    const v = env.read(join(pluginRoot(env), MARKER)).trim();
    return /^\d+\.\d+\.\d+$/.test(v) ? v : '';
  } catch { return ''; }
}

export type ObsPluginState = 'not-found' | 'not-installed' | 'current' | 'outdated';
export const obsPluginState = (obsFound: boolean, installed: string, appVersion: string): ObsPluginState =>
  !obsFound && !installed ? 'not-found' : !installed ? 'not-installed' : installed === appVersion ? 'current' : 'outdated';

export const OBS_STATE_LABEL: Record<ObsPluginState, string> = {
  'not-found': 'OBS not found',
  'not-installed': 'Not installed',
  current: 'Installed (up to date)',
  outdated: 'Installed (older)',
};
export const OBS_BUTTON_LABEL: Record<ObsPluginState, string> = {
  'not-found': 'Install OBS plugin',
  'not-installed': 'Install OBS plugin',
  current: 'Reinstall OBS plugin',
  outdated: 'Update OBS plugin',
};

/** The major of "31.1.1", or 0 when it does not read as a version. */
export const obsMajor = (version: string): number => Number(/^(\d+)(?:\.\d+)*/.exec(version.trim())?.[1] ?? 0);

/** The warning beside the button: OBS is a newer major than the plugin was built for. '' when fine or OBS's version is unknown. */
export function obsVersionWarning(obsVersion: string, target = OBS_TARGET_MAJOR): string {
  const major = obsMajor(obsVersion);
  return major > target ? `OBS ${obsVersion.trim()} is newer than this plugin was built for (${target}). It may not load; tell Josh.` : '';
}

const SCRIPT = '$v=(Get-Item -LiteralPath $env:TCG_OBS_EXE).VersionInfo; $v.ProductVersion; $v.FileVersion';
/** obs64.exe's version ("31.1.1") from its file properties, or '' when it cannot be read. The path goes in an environment variable, never into the command text. */
export function obsExeVersion(exe: string, run: typeof execFile = execFile): Promise<string> {
  return new Promise(resolve => {
    if (!exe) return resolve('');
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', SCRIPT], { windowsHide: true, timeout: 15_000, env: { ...process.env, TCG_OBS_EXE: exe } }, (err, out) => {
      if (err) return resolve('');
      resolve(String(out).split(/\r?\n/).map(l => /^\d+(\.\d+)+/.exec(l.trim())?.[0] ?? '').find(Boolean) ?? '');
    });
  });
}

/** Copies the built plugin folder (`from`: has bin/64bit/tcg-obs.dll and data/) into OBS's plugin folder and writes the version marker last. Overwrites an older copy. */
export function installObsPlugin(from: string, env: ObsEnv, appVersion: string): { ok: boolean; text: string } {
  if (!env.programData) return { ok: false, text: 'Windows has no ProgramData folder for this user, so OBS cannot be given the plugin.' };
  if (!existsSync(join(from, 'bin', '64bit', `${MODULE}.dll`))) return { ok: false, text: 'This build has no OBS plugin (a dev run needs the plugin built in obs-plugin/ first).' };
  const root = pluginRoot(env);
  try {
    mkdirSync(root, { recursive: true });
    rmSync(join(root, 'data'), { recursive: true, force: true }); // an older version's data files must not stay behind
    cpSync(from, root, { recursive: true, force: true });
    writeFileSync(join(root, MARKER), `${appVersion}\n`);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'EBUSY') return { ok: false, text: 'OBS still has the plugin open. Close OBS completely (also from the tray), then try again.' };
    if (code === 'EPERM' || code === 'EACCES') return { ok: false, text: `Windows would not let this app write to ${root}. That folder was probably made by another Windows user or by an administrator: give your user full control of it (or delete it), then try again.` };
    return { ok: false, text: `Could not copy the plugin (${code ?? 'error'}).` };
  }
  return { ok: true, text: 'Installed. Start OBS, then open View > Docks > TCG.' };
}
