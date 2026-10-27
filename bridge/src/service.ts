// The long-poll loop and the Mix It Up watcher. Plain TypeScript, no Electron: main.ts only wires it to the tray and the window.
import { isKnownKind, runJob, undoLate } from './jobs';
import { MixItUpClient } from './mixitup';
import { SiteClient, SiteError, Unauthorized, type BridgeJob, type BridgeResult } from './site';

export type SiteState = 'connecting' | 'connected' | 'offline' | 'revoked';
export type TrayLevel = 'connected' | 'partly' | 'offline';
export interface JobEntry { at: number; kind: string; username?: string; ok: boolean; detail: string }
export interface BridgeState {
  site: SiteState;
  siteError: string;
  lastPollAt: number | null;
  mix: { found: boolean; version: string };
  currency: string;
  jobs: JobEntry[];
  tray: TrayLevel;
}

export interface ServiceOptions {
  client: SiteClient;
  mix: MixItUpClient;
  onChange: () => void;
  mixCheckMs?: number;
  backoffMs?: { min: number; max: number };
  retryMs?: number;
}

const JOURNAL_MAX = 50;
const sleep = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
  const t = setTimeout(done, ms);
  function done() { clearTimeout(t); signal.removeEventListener('abort', done); resolve(); }
  signal.addEventListener('abort', done);
});

export class BridgeService {
  readonly state: BridgeState = { site: 'connecting', siteError: '', lastPollAt: null, mix: { found: false, version: '' }, currency: '', jobs: [], tray: 'offline' };
  private abort = new AbortController();
  private helloPending = true;
  private done: Promise<unknown> = Promise.resolve();
  private o: Required<ServiceOptions>;

  constructor(opts: ServiceOptions) {
    this.o = { mixCheckMs: 5000, backoffMs: { min: 1000, max: 30_000 }, retryMs: 300, ...opts };
  }

  start(): void {
    this.done = Promise.all([this.pollLoop(), this.mixLoop()]);
  }

  /** Stops both loops and waits for them. */
  async stop(): Promise<void> {
    this.abort.abort();
    await this.done;
  }

  private changed(): void {
    const s = this.state;
    const up = (s.site === 'connected' ? 1 : 0) + (s.mix.found ? 1 : 0);
    s.tray = up === 2 ? 'connected' : up === 1 ? 'partly' : 'offline';
    this.o.onChange();
  }

  private revoke(): void {
    this.state.site = 'revoked';
    this.state.siteError = 'Pair again';
    this.abort.abort();
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
    if (!was && version !== null) this.helloPending = true;
    if (version !== null && this.helloPending) {
      try {
        await this.o.client.hello(await this.o.mix.currencies(), version);
        this.helloPending = false;
      } catch (e) {
        if (e instanceof Unauthorized) this.revoke();
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
        for (const job of jobs) if (job && typeof job.id === 'string' && isKnownKind(job.kind)) await this.handle(job);
      } catch (e) {
        if (e instanceof Unauthorized) return this.revoke();
        if (signal.aborted) return;
        this.state.site = 'offline';
        this.state.siteError = e instanceof SiteError ? e.message : 'Cannot reach the site';
        this.changed();
        await sleep(backoff, signal);
        backoff = Math.min(backoff * 2, this.o.backoffMs.max);
      }
    }
  }

  private async handle(job: BridgeJob): Promise<void> {
    const result = await runJob(job, this.o.mix);
    const entry = this.log({ kind: job.kind, username: job.username, ok: result.ok, detail: result.ok ? summary(job, result) : result.error ?? 'failed' });
    if (job.currencyId) this.state.currency = this.o.mix.currencyName(job.currencyId);
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
    } else if (outcome === 'late') {
      entry.ok = false;
      entry.detail = result.ok ? (await undoLate(job, this.o.mix)) || 'Late: the site had given up, nothing to undo' : `${entry.detail} (late)`;
    } else if (result.ok && job.kind === 'deduct' && job.text) {
      this.o.mix.say(job.text).catch(() => { entry.detail += ' (chat message not sent)'; this.changed(); }); // the site's own message for the pull
    }
    this.changed();
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
    default: return 'said in chat';
  }
}
