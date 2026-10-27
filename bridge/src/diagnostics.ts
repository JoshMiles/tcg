// "Copy diagnostics": versions, statuses and the last 20 jobs as plain text for a bug report. It passes through the same redaction as the log.
// Plain TypeScript, no Electron.
import type { BridgeState } from './service';

export interface Versions { app: string; electron: string; windows: string }
export interface DiagnosticsInput { versions: Versions; site: string; paired: boolean; alerts: boolean; state: BridgeState | null; now?: number }

const yes = (b: boolean) => (b ? 'yes' : 'no');
const stamp = (ms: number) => new Date(ms).toISOString();

export function diagnosticsText(i: DiagnosticsInput, redact: (text: string) => string): string {
  const s = i.state;
  const lines = [
    `TCG Bridge ${i.versions.app}, Electron ${i.versions.electron}, ${i.versions.windows}`,
    `Taken at ${stamp(i.now ?? Date.now())}`,
    `Alerts on: ${yes(i.alerts)}`,
    `Site: ${i.site}, paired: ${yes(i.paired)}${s ? `, ${s.site}${s.siteError ? ` (${s.siteError})` : ''}, last poll ${s.lastPollAt ? stamp(s.lastPollAt) : 'never'}` : ''}`,
  ];
  if (s) {
    lines.push(
      `Mix It Up: ${s.mix.found ? `found, version ${s.mix.version}` : 'not found'}${s.currency ? `, currency ${s.currency}` : ''}`,
      `OBS: ${!s.obs.enabled ? 'off' : s.obs.connected ? `connected, scene ${s.obs.scene || '-'}, streaming ${s.obs.streaming === null ? 'unknown' : yes(s.obs.streaming)}, overlay ${s.obs.overlay.found ? `found (in scene ${yes(s.obs.overlay.inProgram)}, visible ${yes(s.obs.overlay.visible)})` : 'not found'}` : `not connected${s.obs.error ? ` (${s.obs.error})` : ''}`}`,
      `Tray: ${s.tray}`,
      '',
      'Last 20 jobs (newest first):',
      ...(s.jobs.length ? s.jobs.slice(0, 20).map(j => `${stamp(j.at)} ${j.kind} ${j.ok ? 'ok' : 'failed'} ${j.ms}ms${j.detail ? ` - ${j.detail}` : ''}`) : ['none yet']),
    );
  }
  return redact(lines.join('\n'));
}
