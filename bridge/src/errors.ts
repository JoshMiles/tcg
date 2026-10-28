// Error reports to the site (ROADMAP 57.9): one small reporter. A failure says which part broke and why; the text goes through the same redaction as the
// log and Copy diagnostics. At most one report per part per minute, and a report is dropped (never queued) while the site is not reachable.
// It never throws and never reports its own failure. Plain TypeScript, no Electron.
export type ErrorPart = 'job' | 'reconnect' | 'obs' | 'mixitup';

const PER_PART_MS = 60_000;
const MESSAGE_MAX = 300;

export interface ErrorReporterOptions {
  /** Posts `{ type: 'error', ... }` to /api/bridge/report. */
  send: (body: Record<string, unknown>) => Promise<unknown>;
  redact: (text: string) => string;
  version: string;
  commit?: string;
  /** False while the site is not reachable: the report is dropped. */
  canSend: () => boolean;
  now?: () => number;
}

export class ErrorReporter {
  private last = new Map<ErrorPart, number>();
  constructor(private o: ErrorReporterOptions) {}

  report(part: ErrorPart, message: string): void {
    try {
      const now = (this.o.now ?? Date.now)();
      const was = this.last.get(part);
      if (was !== undefined && now - was < PER_PART_MS) return;
      if (!this.o.canSend()) return;
      this.last.set(part, now);
      const text = this.o.redact(String(message)).replace(/\s+/g, ' ').trim().slice(0, MESSAGE_MAX);
      if (!text) return;
      void Promise.resolve(this.o.send({ type: 'error', part, message: text, version: this.o.version, ...(this.o.commit ? { commit: this.o.commit } : {}) })).catch(() => undefined);
    } catch { /* a report is a help, never a reason to fail */ }
  }
}
