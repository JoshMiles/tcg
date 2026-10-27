// Starting Mix It Up. The only program this app ever launches is a file named MixItUp.exe at the saved path or the default install path.
// Plain TypeScript, no Electron.
import { spawn, type ChildProcess } from 'node:child_process';
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join } from 'node:path';

/** Where Mix It Up's own installer puts it: %LocalAppData%\MixItUp (MixItUp.Installer/MainWindowViewModel.cs, DefaultInstallDirectory). */
export const defaultMixItUpPath = (): string => join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'MixItUp', 'MixItUp.exe');

/** An existing file called MixItUp.exe, by absolute path. */
export function isMixItUpExe(path: string): boolean {
  try {
    return !!path && isAbsolute(path) && basename(path).toLowerCase() === 'mixitup.exe' && statSync(path).isFile();
  } catch { return false; }
}

type Spawn = (command: string, args: string[], options: { cwd: string; detached: true; stdio: 'ignore' }) => ChildProcess;

/** Starts the saved path, else the default one, detached and without a shell. Resolves with the path it started, or says why not. */
export async function startMixItUp(saved: string, run: Spawn = spawn): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const path = isMixItUpExe(saved) ? saved : isMixItUpExe(defaultMixItUpPath()) ? defaultMixItUpPath() : '';
  if (!path) return { ok: false, error: `Mix It Up was not found${saved ? ' at the saved path' : ` at ${defaultMixItUpPath()}`}. Press "Choose MixItUp.exe..." and pick it.` };
  return new Promise(resolve => {
    const child = run(path, [], { cwd: dirname(path), detached: true, stdio: 'ignore' });
    child.once('error', e => resolve({ ok: false, error: `Windows would not start Mix It Up (${e.message})` }));
    child.once('spawn', () => { child.unref(); resolve({ ok: true, path }); });
  });
}
