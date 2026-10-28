// The pre-stream checklist (ROADMAP 57.1): every part is looked at once, one line each. It changes nothing anywhere: no chat message, no charge.
// Plain TypeScript, no Electron. The parts come in as small interfaces so the checks can use fakes.
import type { MixItUpClient } from './mixitup';
import type { ObsState } from './obs';
import { overlayText, testMixItUp } from './selftest';

export type Tone = 'ok' | 'bad' | 'muted';
export interface ChecklistLine { label: string; tone: Tone; text: string }
export interface ChecklistResult { lines: ChecklistLine[]; ready: boolean; summary: string }
/** What the site answers at /api/bridge/checklist. */
export interface SiteFacts { season: { name: string } | null; openablePacks: number; queueLength: number; paused: boolean; happyHour: { what: string; endsAt: number } | null; /** 57.8: absent until the site has the app's Mix It Up commands. */ commandsMissing?: string[] }

export const CHECK_TIMEOUT_MS = 5000;

export interface ChecklistParts {
  mix: MixItUpClient;
  /** The channel login and the chosen currency, from the site's hello answer. */
  channel: string;
  currencyId: string;
  /** The site's facts; throws when the site does not answer. */
  facts: () => Promise<SiteFacts>;
  obsEnabled: boolean;
  obsCheck: () => Promise<ObsState>;
  now?: () => number;
  timeoutMs?: number;
}

const bad = (label: string, text: string): ChecklistLine => ({ label, tone: 'bad', text });
const ok = (label: string, text: string): ChecklistLine => ({ label, tone: 'ok', text });
const muted = (label: string, text: string): ChecklistLine => ({ label, tone: 'muted', text });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The site's four facts as lines: season, openable packs, queue, pause, happy hour (shown, never red). */
export function siteLines(f: SiteFacts, now: number): ChecklistLine[] {
  const mins = f.happyHour ? Math.max(1, Math.ceil((f.happyHour.endsAt - now) / 60_000)) : 0;
  return [
    f.season ? ok('Season', `${f.season.name} is the active season.`) : bad('Season', 'No season is active. Activate one in the admin panel.'),
    f.openablePacks > 0 ? ok('Packs', `${plural(f.openablePacks, 'pack', 'packs')} can be opened.`) : bad('Packs', 'No pack with cards can be opened, so every pull would fail.'),
    f.queueLength === 0 ? ok('Pull queue', 'The queue is empty.') : bad('Pull queue', `${plural(f.queueLength, 'pull is', 'pulls are')} still waiting in the overlay queue.`),
    f.paused ? bad('Pulls', 'Pulls are paused. Resume them before going live.') : ok('Pulls', 'Pulls are open.'),
    ...(f.commandsMissing ? [f.commandsMissing.length === 0 ? ok('Commands', 'Every Mix It Up command the site expects was found.') : muted('Commands', `${plural(f.commandsMissing.length, 'Mix It Up command', 'Mix It Up commands')} missing or switched off: ${f.commandsMissing.join(', ')}.`)] : []),
    f.happyHour ? muted('Happy hour', `Running: ${f.happyHour.what}, ${plural(mins, 'minute', 'minutes')} left.`) : muted('Happy hour', 'Not running.'),
  ];
}

/** The two OBS lines. Off in TCG Bridge is grey ("not used"), not red. */
export function obsLines(enabled: boolean, s: ObsState | Error | null): ChecklistLine[] {
  if (!enabled) return [muted('OBS', 'Not used (Talk to OBS is off).'), muted('Overlay', 'Not checked because OBS is not used.')];
  if (!s || s instanceof Error) return [bad('OBS', s ? s.message || 'Could not check OBS.' : 'Could not check OBS.'), bad('Overlay', 'Not known because OBS cannot be reached.')];
  const o = s.overlay;
  return [
    s.connected ? ok('OBS', `Connected. Scene ${s.scene || 'unknown'}.`) : bad('OBS', s.error || 'Not connected to OBS.'),
    o.found && o.inProgram && o.visible ? ok('Overlay', overlayText(o, s.scene)) : bad('Overlay', overlayText(o, s.scene)),
  ];
}

/** Ready when no line is red. */
export function overall(lines: ChecklistLine[]): { ready: boolean; summary: string } {
  const n = lines.filter(l => l.tone === 'bad').length;
  return n === 0 ? { ready: true, summary: 'Ready to stream.' } : { ready: false, summary: `${plural(n, 'thing needs', 'things need')} fixing before you go live.` };
}

/** Gives a check a time limit so one slow part never hangs the list. */
async function limited<T>(work: () => Promise<T>, ms: number, slow: string): Promise<T | Error> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work(), new Promise<Error>(resolve => { timer = setTimeout(() => resolve(new Error(slow)), ms); })]);
  } catch (e) {
    return e instanceof Error ? e : new Error('Something went wrong');
  } finally {
    clearTimeout(timer);
  }
}

/** Runs every check at once. Never throws. */
export async function runChecklist(p: ChecklistParts): Promise<ChecklistResult> {
  const ms = p.timeoutMs ?? CHECK_TIMEOUT_MS;
  const secs = `Did not answer within ${Math.round(ms / 1000)} seconds.`;
  const [facts, mix, obs] = await Promise.all([
    limited(p.facts, ms, secs),
    limited(() => (p.channel ? testMixItUp(p.mix, p.channel, p.currencyId) : Promise.resolve({ ok: false, text: 'The site has not said the channel name yet, so a balance cannot be read. Wait a few seconds and run it again.' })), ms, secs),
    p.obsEnabled ? limited(p.obsCheck, ms, secs) : Promise.resolve(null),
  ]);
  const now = (p.now ?? Date.now)();
  const lines: ChecklistLine[] = [
    facts instanceof Error ? bad('Site', facts.message || 'The site did not answer.') : ok('Site', 'Paired and the site answers.'),
    mix instanceof Error ? bad('Mix It Up', mix.message) : { label: 'Mix It Up', tone: mix.ok ? 'ok' : 'bad', text: mix.text },
    ...obsLines(p.obsEnabled, obs),
    ...(facts instanceof Error ? ['Season', 'Packs', 'Pull queue', 'Pulls'].map(l => bad(l, 'Not known because the site did not answer.')).concat(muted('Happy hour', 'Not known because the site did not answer.')) : siteLines(facts, now)),
  ];
  return { lines, ...overall(lines) };
}
