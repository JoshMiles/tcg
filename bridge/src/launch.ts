// Starting Mix It Up and OBS. The only programs this app ever launches are a file named MixItUp.exe or obs64.exe at the saved path or the default
// install path, started without a shell. Plain TypeScript, no Electron.
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';

/** Where Mix It Up's own installer puts it: %LocalAppData%\MixItUp (MixItUp.Installer/MainWindowViewModel.cs, DefaultInstallDirectory). */
export const defaultMixItUpPath = (): string => join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'MixItUp', 'MixItUp.exe');
/** OBS Studio's installer default. OBS must start with its own bin\64bit folder as the working directory, or it cannot find its files. */
export const defaultObsPath = (): string => join(process.env.ProgramFiles || 'C:\\Program Files', 'obs-studio', 'bin', '64bit', 'obs64.exe');

/** An existing file with this name, by absolute path. */
const isExe = (path: string, name: string): boolean => {
  try {
    return !!path && isAbsolute(path) && basename(path).toLowerCase() === name && statSync(path).isFile();
  } catch { return false; }
};
export const isMixItUpExe = (path: string): boolean => isExe(path, 'mixitup.exe');
export const isObsExe = (path: string): boolean => isExe(path, 'obs64.exe');

type Spawn = (command: string, args: string[], options: { cwd: string; detached: true; stdio: 'ignore' }) => ChildProcess;
type Result = { ok: true; path: string } | { ok: false; error: string };

/** Starts the saved path, else the default one, detached and without a shell, in the file's own folder. Resolves with the path it started, or says why not. */
async function start(saved: string, fallback: string, valid: (p: string) => boolean, what: string, choose: string, run: Spawn): Promise<Result> {
  const path = valid(saved) ? saved : valid(fallback) ? fallback : '';
  if (!path) return { ok: false, error: `${what} was not found${saved ? ' at the saved path' : ` at ${fallback}`}. Press "${choose}" and pick it.` };
  return new Promise(resolve => {
    const child = run(path, [], { cwd: dirname(path), detached: true, stdio: 'ignore' });
    child.once('error', e => resolve({ ok: false, error: `Windows would not start ${what} (${e.message})` }));
    child.once('spawn', () => { child.unref(); resolve({ ok: true, path }); });
  });
}

export const startMixItUp = (saved: string, run: Spawn = spawn): Promise<Result> => start(saved, defaultMixItUpPath(), isMixItUpExe, 'Mix It Up', 'Choose MixItUp.exe...', run);
export const startObs = (saved: string, run: Spawn = spawn): Promise<Result> => start(saved, defaultObsPath(), isObsExe, 'OBS', 'Choose obs64.exe...', run);

/** Whether an obs64.exe process is running, so a second OBS is not started. Unknown (the check failed) counts as running: better no start than two. */
export function obsRunning(run: typeof execFile = execFile): Promise<boolean> {
  return new Promise(resolve => {
    run('tasklist', ['/FI', 'IMAGENAME eq obs64.exe', '/NH'], { windowsHide: true }, (err, out) => resolve(!!err || /obs64\.exe/i.test(String(out))));
  });
}
