// Installing the OBS plugin (ROADMAP 62.5): paths, states, version compare, the OBS version warning and the copy. Run with the rest: npm run check.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installedObsPluginVersion, installObsPlugin, MODULE, obsExeFound, obsExeVersion, obsMajor, OBS_BUTTON_LABEL, OBS_PLUGIN_RESOURCE, OBS_TARGET_MAJOR, obsPluginState, obsVersionWarning, pluginDll, pluginRoot,
  type ObsEnv,
} from '../src/obsinstall';
import { versionProblems } from './check-version';

export async function obsInstallChecks(): Promise<void> {
  // The target major lives in one place (the constant) and must match what CI builds against.
  const spec = JSON.parse(readFileSync(join(__dirname, '..', '..', 'obs-plugin', 'buildspec.json'), 'utf8')) as { name: string; dependencies: { 'obs-studio': { version: string } } };
  assert.equal(obsMajor(spec.dependencies['obs-studio'].version), OBS_TARGET_MAJOR, 'OBS_TARGET_MAJOR is the OBS version obs-plugin/buildspec.json builds against');
  assert.equal(spec.name, MODULE, 'the module name is the buildspec name');

  // The release build ships the plugin and cannot be packed without it.
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { scripts: Record<string, string>; build: { extraResources: { from: string; to: string }[] } };
  assert.ok(pkg.build.extraResources.some(r => r.to === OBS_PLUGIN_RESOURCE && r.from === '../obs-plugin/release/tcg-obs'), 'extraResources carries the built plugin folder');
  assert.match(pkg.scripts.dist, /need-plugins\.mjs.*electron-builder/, 'dist checks the plugin files exist before electron-builder packs');

  // Paths: the per-machine ProgramData layout OBS 30 and 31 load from (no admin).
  const env = (files: Record<string, string>): ObsEnv => ({ programData: 'C:\\ProgramData', exePaths: ['D:\\Obs\\obs64.exe', 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe'], exists: p => p in files, read: p => { if (!(p in files)) throw new Error('missing'); return files[p]; } });
  const none = env({});
  assert.equal(pluginRoot(none), join('C:\\ProgramData', 'obs-studio', 'plugins', 'tcg-obs'));
  assert.equal(pluginDll(none), join(pluginRoot(none), 'bin', '64bit', 'tcg-obs.dll'));

  // OBS found: the first path that exists.
  assert.equal(obsExeFound(none), '');
  assert.equal(obsExeFound(env({ 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe': '' })), 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe');
  assert.equal(obsExeFound(env({ 'D:\\Obs\\obs64.exe': '', 'C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe': '' })), 'D:\\Obs\\obs64.exe', 'the saved path wins');

  // Installed version: needs the marker and the DLL.
  const marker = join(pluginRoot(none), 'version.txt');
  assert.equal(installedObsPluginVersion(none), '');
  assert.equal(installedObsPluginVersion(env({ [marker]: '0.44.0\n' })), '', 'a marker without the DLL is not installed');
  assert.equal(installedObsPluginVersion(env({ [pluginDll(none)]: '' })), '', 'a DLL without a marker is not read back');
  assert.equal(installedObsPluginVersion(env({ [pluginDll(none)]: '', [marker]: '0.44.0\r\n' })), '0.44.0');
  assert.equal(installedObsPluginVersion(env({ [pluginDll(none)]: '', [marker]: 'junk' })), '');

  // States and button wording.
  assert.equal(obsPluginState(false, '', '0.44.0'), 'not-found');
  assert.equal(obsPluginState(true, '', '0.44.0'), 'not-installed');
  assert.equal(obsPluginState(true, '0.44.0', '0.44.0'), 'current');
  assert.equal(obsPluginState(true, '0.43.0', '0.44.0'), 'outdated');
  assert.equal(obsPluginState(true, '0.45.0', '0.44.0'), 'outdated', 'anything but this app version is out of step');
  assert.equal(obsPluginState(false, '0.44.0', '0.44.0'), 'current', 'the installed plugin proves OBS (as the Stream Deck one does)');
  assert.equal(OBS_BUTTON_LABEL.outdated, 'Update OBS plugin');
  assert.equal(OBS_BUTTON_LABEL['not-installed'], 'Install OBS plugin');
  assert.equal(OBS_BUTTON_LABEL.current, 'Reinstall OBS plugin');

  // The OBS version warning.
  assert.equal(obsMajor('31.1.1'), 31);
  assert.equal(obsMajor('junk'), 0);
  assert.equal(obsVersionWarning('31.1.1'), '');
  assert.equal(obsVersionWarning('30.2.3'), '', 'older is not warned about here');
  assert.equal(obsVersionWarning(''), '', 'unknown version: no warning');
  assert.equal(obsVersionWarning('32.2.2'), '', 'OBS 32 loads the plugin built against 31');
  assert.equal(obsVersionWarning('33.0.1'), 'OBS 33.0.1 is newer than this plugin has been tried with (32). It may not load; tell Josh.');

  // Reading OBS's version: the path goes in the environment, not the command; the first line that is a version wins.
  let seen: { args: string[]; env: Record<string, string | undefined> } | null = null;
  const fake = ((_f: string, args: string[], opts: { env: Record<string, string | undefined> }, cb: (e: Error | null, out: string) => void) => { seen = { args, env: opts.env }; cb(null, '\r\n32.0.0\r\n32.0.0.0\r\n'); }) as never;
  const evil = 'C:\\Obs" ; calc ; "\\obs64.exe';
  assert.equal(await obsExeVersion(evil, fake), '32.0.0');
  assert.equal(seen!.env.TCG_OBS_EXE, evil);
  assert.ok(!seen!.args.join(' ').includes('calc'), 'the path is never in the command text');
  assert.equal(await obsExeVersion('C:\\x\\obs64.exe', ((_f: string, _a: string[], _o: unknown, cb: (e: Error | null, out: string) => void) => cb(new Error('no'), '')) as never), '');
  assert.equal(await obsExeVersion('', fake), '');

  // The copy, against a real temporary folder.
  const dir = mkdtempSync(join(tmpdir(), 'tcg-obs-'));
  try {
    const from = join(dir, 'src');
    mkdirSync(join(from, 'bin', '64bit'), { recursive: true });
    mkdirSync(join(from, 'data', 'locale'), { recursive: true });
    writeFileSync(join(from, 'bin', '64bit', 'tcg-obs.dll'), 'dll v2');
    writeFileSync(join(from, 'data', 'locale', 'en-US.ini'), 'x');
    const real: ObsEnv = { programData: join(dir, 'ProgramData'), exePaths: [], exists: existsSync, read: p => readFileSync(p, 'utf8') };
    assert.equal(installObsPlugin(join(dir, 'nothing'), real, '0.44.0').ok, false, 'a build without the plugin says so');
    assert.equal(installedObsPluginVersion(real), '');
    // An older install with a data file the new version no longer has.
    mkdirSync(join(pluginRoot(real), 'data'), { recursive: true });
    mkdirSync(join(pluginRoot(real), 'bin', '64bit'), { recursive: true });
    writeFileSync(join(pluginRoot(real), 'data', 'old.txt'), 'old');
    writeFileSync(pluginDll(real), 'dll v1');
    writeFileSync(join(pluginRoot(real), 'version.txt'), '0.43.0\n');
    assert.equal(installedObsPluginVersion(real), '0.43.0');
    const r = installObsPlugin(from, real, '0.44.0');
    assert.equal(r.ok, true, r.text);
    assert.equal(readFileSync(pluginDll(real), 'utf8'), 'dll v2', 'the DLL is replaced');
    assert.equal(existsSync(join(pluginRoot(real), 'data', 'old.txt')), false, 'a data file of the older version is gone');
    assert.equal(readFileSync(join(pluginRoot(real), 'data', 'locale', 'en-US.ini'), 'utf8'), 'x');
    assert.equal(installedObsPluginVersion(real), '0.44.0', 'the marker reads back');
  } finally { rmSync(dir, { recursive: true, force: true }); }

  // A change under obs-plugin/ ships in the app, so it follows the bridge version rule (its README does not).
  const lock = { version: '0.44.0', packages: { '': { version: '0.44.0' } } };
  assert.equal(versionProblems(['obs-plugin/src/dock.cpp'], '0.44.0', '0.44.0', lock).length, 1, 'a plugin change needs the bridge bump');
  assert.deepEqual(versionProblems(['obs-plugin/README.md'], '0.44.0', '0.44.0', lock), []);
}
