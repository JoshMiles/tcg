// The long-poll loop and the Mix It Up watcher. Plain TypeScript, no Electron: main.ts only wires it to the tray and the window.
import { csvOf, writeBackup, type Ledger } from './bucks';
import { commandWait, isKnownKind, Refused, runJob, undoLate, type BucksTasks, type Sinks } from './jobs';
import { MixItUpClient, MixItUpDown, MixItUpError } from './mixitup';
import type { ObsConfig, ObsState, ObsWatcher } from './obs';
import { SiteClient, SiteError, Unauthorized, type BridgeCommand, type BridgeJob, type BridgeResult } from './site';

export type SiteState = 'connecting' | 'connected' | 'offline' | 'revoked';
export type TrayLevel = 'connected' | 'partly' | 'offline';
export interface JobEntry { at: number; kind: string; username?: string; ok: boolean; detail: string; ms: number }
export interface BridgeState {
  site: SiteState;
  siteError: string;
  lastPollAt: number | null;
  mix: { found: boolean; version: string };
  currency: string;
  /** From the site's hello answer, and the newest job's currency: the self-test reads it. */
  currencyId: string;
  /** The streamer's channel name, from the site's hello answer; prefills the Mix It Up test. */
  channel: string;
  jobs: JobEntry[];
  tray: TrayLevel;
  obs: ObsState;
}

export interface ServiceOptions {
  client: SiteClient;
  mix: MixItUpClient;
  obs: ObsWatcher;
  onChange: () => void;
  /** One line for the log file (main.ts redacts it). */
  log?: (line: string) => void;
  mixCheckMs?: number;
  /** How often the Mix It Up command list is sent again. */
  commandsMs?: number;
  backoffMs?: { min: number; max: number };
  retryMs?: number;
  /** The Brie Bucks ledger and backup folder (ROADMAP 55.10); the checks leave them out. */
  ledger?: Ledger;
  backupDir?: string;
  /** The live pull feed and summary windows (55.11). */
  sinks?: Sinks;
}

const JOURNAL_MAX = 50;
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
  const t = setTimeout(done, ms);
  function done() { clearTimeout(t); signal.removeEventListener('abort', done); resolve(); }
  signal.addEventListener('abort', done);
});

export class BridgeService {
  readonly state: BridgeState;
  private abort = new AbortController();
  private helloPending = true;
  private helloAt = 0;
  /** The commands last reported to the site (lowercase ids); a run-command job is only run for one of these. */
  private commands: BridgeCommand[] = [];
  private commandIds = new Set<string>();
  private done: Promise<unknown> = Promise.resolve();
  private seen = { site: '', mix: '', obs: '' };
  /** Whether Mix It Up answered at the last report to the site, and when: the site keeps the uptime history from these (55.11). */
  private mixReported: boolean | null = null;
  private mixReportAt = 0;
  private o: Required<Omit<ServiceOptions, 'ledger' | 'backupDir' | 'sinks'>> & Pick<ServiceOptions, 'ledger' | 'backupDir' | 'sinks'>;

  constructor(opts: ServiceOptions) {
    this.o = { log: () => undefined, mixCheckMs: 5000, commandsMs: 300_000, backoffMs: { min: 1000, max: 30_000 }, retryMs: 300, ...opts };
    this.state = { site: 'connecting', siteError: '', lastPollAt: null, mix: { found: false, version: '' }, currency: '', currencyId: '', channel: '', jobs: [], tray: 'offline', obs: opts.obs.state };
  }

  start(): void {
    this.o.obs.onChange = () => this.changed();
    this.o.obs.start();
    this.done = Promise.all([this.pollLoop(), this.mixLoop()]);
  }

  /** Stops the loops and OBS and waits for them. */
  async stop(): Promise<void> {
    this.abort.abort();
    await Promise.all([this.done, this.o.obs.stop()]);
  }

  /** For the window's "Check OBS". */
  get obs(): ObsWatcher { return this.o.obs; }

  /** New OBS settings from the window. */
  reconfigureObs(config: ObsConfig): Promise<void> {
    return this.o.obs.configure(config);
  }

  /** The tray: every part that counts is up = connected, none = not connected, else partly. OBS counts only when it is switched on. */
  private changed(): void {
    const s = this.state;
    const parts = [s.site === 'connected', s.mix.found, ...(s.obs.enabled ? [s.obs.connected] : [])];
    const up = parts.filter(Boolean).length;
    s.tray = up === parts.length ? 'connected' : up === 0 ? 'offline' : 'partly';
    this.logTransitions();
    this.o.onChange();
  }

  /** One log line each time the site, Mix It Up or OBS goes up or down. */
  private logTransitions(): void {
    const s = this.state;
    const now = {
      site: s.site === 'connected' ? 'connected' : `${s.site}${s.siteError ? ` (${s.siteError})` : ''}`,
      mix: s.mix.found ? `found, version ${s.mix.version}` : 'not found',
      obs: !s.obs.enabled ? 'off' : s.obs.connected ? 'connected' : `not connected${s.obs.error ? ` (${s.obs.error})` : ''}`,
    };
    const names = { site: 'Site', mix: 'Mix It Up', obs: 'OBS' };
    for (const k of ['site', 'mix', 'obs'] as const) {
      if (now[k] !== this.seen[k]) this.o.log(`${names[k]}: ${now[k]}`);
      this.seen[k] = now[k];
    }
  }

  private revoke(): void {
    this.state.site = 'revoked';
    this.state.siteError = 'Pair again';
    this.abort.abort();
    void this.o.obs.stop();
    this.changed();
  }

  private log(e: Omit<JobEntry, 'at'>): JobEntry {
    const entry = { at: Date.now(), ...e };
    this.state.jobs.unshift(entry);
    this.state.jobs.length = Math.min(this.state.jobs.length, JOURNAL_MAX);
    return entry;
  }

  // ── Mix It Up: is it there, and does the site know its currencies ──

  private async mixLoop(): Promise<void> {
    const { signal } = this.abort;
    while (!signal.aborted) {
      await this.checkMix();
      await sleep(this.o.mixCheckMs, signal);
    }
  }

  private async checkMix(): Promise<void> {
    const version = await this.o.mix.version().catch(() => null);
    const was = this.state.mix.found;
    this.state.mix = { found: version !== null, version: version ?? '' };
    if (this.mixReported !== (version !== null) || Date.now() - this.mixReportAt >= 60_000) {
      this.mixReported = version !== null;
      this.mixReportAt = Date.now();
      void this.o.client.report({ type: 'mix', found: version !== null }).catch(() => undefined);
    }
    if (!was && version !== null) this.helloPending = true;
    if (version !== null && !this.helloPending && Date.now() - this.helloAt >= this.o.commandsMs) this.helloPending = true; // the command list changes while Mix It Up runs
    if (version !== null && this.helloPending) {
      try {
        const currencies = await this.o.mix.currencies();
        try { // keep the last list when Mix It Up cannot give one now
          this.commands = await this.o.mix.commands();
          this.commandIds = new Set(this.commands.map(c => c.id.toLowerCase()));
        } catch (e) { this.o.log(`Mix It Up commands: ${e instanceof Error ? e.message : 'unknown error'}`); }
        const answer = await this.o.client.hello(currencies, version, this.commands);
        this.helloAt = Date.now();
        this.state.channel = answer.channel;
        if (answer.currencyId) this.state.currencyId = answer.currencyId;
        this.helloPending = false;
      } catch (e) {
        if (e instanceof Unauthorized) this.revoke();
        else this.o.log(`Hello to the site failed: ${e instanceof Error ? e.message : 'unknown error'}`);
        // anything else: try again on the next check
      }
    }
    this.changed();
  }

  // ── The site: ask for jobs, run them, post what happened ──

  private async pollLoop(): Promise<void> {
    const { signal } = this.abort;
    let backoff = this.o.backoffMs.min;
    while (!signal.aborted) {
      try {
        const jobs = await this.o.client.poll(signal);
        backoff = this.o.backoffMs.min;
        this.state.site = 'connected';
        this.state.siteError = '';
        this.state.lastPollAt = Date.now();
        this.changed();
        for (const job of jobs) {
          if (!job || typeof job.id !== 'string' || !isKnownKind(job.kind)) continue;
          // A run-command may wait for the card reveal and a backup reads every viewer; they run apart so balance and deduct jobs never queue behind them.
          if (job.kind === 'run-command' || job.kind === 'backup' || job.kind === 'ledger') void this.handle(job).catch(e => { if (e instanceof Unauthorized) this.revoke(); });
          else await this.handle(job);
        }
      } catch (e) {
        if (e instanceof Unauthorized) return this.revoke();
        if (signal.aborted) return;
        this.state.site = 'offline';
        this.state.siteError = e instanceof SiteError ? e.message : 'Cannot reach the site';
        if (!(e instanceof SiteError)) this.o.log(`Site error: ${e instanceof Error ? e.message : 'unknown error'}`);
        this.changed();
        await sleep(backoff, signal);
        backoff = Math.min(backoff * 2, this.o.backoffMs.max);
      }
    }
  }

  private async handle(job: BridgeJob): Promise<void> {
    const wait = commandWait(job);
    if (wait > 0) {
      await sleep(wait, this.abort.signal);
      if (this.abort.signal.aborted) return;
    }
    const t0 = Date.now();
    const result = await runJob(job, this.o.mix, this.o.obs, this.commandIds, this.bucks, this.o.sinks);
    const signed = job.kind === 'deduct' ? -(job.amount ?? 0) : job.kind === 'add' ? job.amount ?? 0 : 0;
    if (this.o.ledger && signed !== 0 && job.username) {
      this.o.ledger.add({ id: job.id, user: job.username.toLowerCase(), amount: signed, at: job.at ?? Date.now(), answer: result.ok ? 'ok' : result.error ?? 'failed' });
    }
    const ms = Date.now() - t0;
    const entry = this.log({ kind: job.kind, username: job.username, ok: result.ok, detail: result.ok ? summary(job, result) : result.error ?? 'failed', ms });
    this.o.log(`Job ${job.kind} ${result.ok ? 'ok' : 'failed'} in ${ms} ms${result.ok ? '' : `: ${result.error ?? 'failed'}`}`);
    if (job.currencyId) { this.state.currency = this.o.mix.currencyName(job.currencyId); this.state.currencyId = job.currencyId; }
    this.changed();
    let outcome: 'stored' | 'late' | 'lost';
    try {
      outcome = await this.post(result);
    } catch (e) {
      if (e instanceof Unauthorized) throw e;
      outcome = 'lost';
    }
    if (outcome === 'lost') {
      entry.detail += ' (the site did not get the result)';
      this.o.log(`Job ${job.kind}: the site did not get the result`);
    } else if (outcome === 'late') {
      this.o.log(`Job ${job.kind}: the site had given up`);
      entry.ok = false;
      entry.detail = result.ok ? (await undoLate(job, this.o.mix)) || 'Late: the site had given up, nothing to undo' : `${entry.detail} (late)`;
      if (result.ok && signed !== 0 && job.username) this.o.ledger?.add({ id: `${job.id}:undo`, user: job.username.toLowerCase(), amount: -signed, at: job.at ?? Date.now(), answer: entry.detail });
    } else if (result.ok && job.kind === 'deduct' && job.text) {
      this.o.mix.say(job.text).catch(() => { entry.detail += ' (chat message not sent)'; this.changed(); }); // the site's own message for the pull
    }
    this.changed();
  }

  /** The Brie Bucks jobs (ROADMAP 55.10): a backup of every viewer's balance into the backup folder, and the ledger sent to the site. Undefined when the app has neither. */
  private get bucks(): BucksTasks | undefined {
    const { ledger, backupDir, mix, client } = this.o;
    if (!ledger && !backupDir) return undefined;
    const guard = async (f: () => Promise<void>) => {
      try { await f(); } catch (e) { throw e instanceof Refused || e instanceof MixItUpError || e instanceof MixItUpDown ? e : new Refused(e instanceof Error ? e.message : 'failed'); }
    };
    return {
      backup: job => guard(async () => {
        if (!backupDir || !job.currencyId) throw new Refused('No backup folder or currency is set');
        writeBackup(backupDir, job.phase ?? 'start', csvOf(await mix.topUsers(), job.currencyId));
      }),
      ledger: () => guard(async () => { await client.ledger(ledger?.all() ?? []); }),
    };
  }

  /** Posts a result, retrying quickly on a network error or a 5xx (3 retries). */
  private async post(result: BridgeResult): Promise<'stored' | 'late'> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.o.client.result(result);
      } catch (e) {
        const retryable = !(e instanceof SiteError) || e.status >= 500;
        if (e instanceof Unauthorized || !retryable || attempt >= 3) throw e;
        await sleep(this.o.retryMs, this.abort.signal);
      }
    }
  }
}

function summary(job: BridgeJob, r: BridgeResult): string {
  switch (job.kind) {
    case 'balance': return `balance ${r.balance}`;
    case 'deduct': return `took ${job.amount}`;
    case 'add': return `gave ${job.amount}`;
    case 'viewers': return `${r.users?.length ?? 0} viewers`;
    case 'obs-refresh': return 'refreshed the overlay in OBS';
    case 'run-command': return 'ran a Mix It Up command';
    case 'backup': return 'saved the Brie Bucks backup';
    case 'ledger': return 'sent the Brie Bucks ledger to the site';
    case 'summary': return 'showed the stream summary';
    default: return 'said in chat';
  }
}
