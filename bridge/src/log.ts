// The app's log file: one file per day, kept 7 days, and every line goes through redact() first. Plain TypeScript, no Electron:
// main.ts gives it the folder. Nothing secret may reach a file or the "Copy diagnostics" text, so both use the same redaction.
import { appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const KEEP_DAYS = 7;
const MIN_SECRET = 4; // a shorter "secret" would turn ordinary words into [hidden]
const FILE = /^bridge-(\d{4})-(\d{2})-(\d{2})\.log$/;
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Takes the known secrets out of `text`, then any overlay address, `Bearer` value and `key=` / `secret=` / `token=` / `password=` value. */
export function redact(text: string, secrets: Iterable<string> = []): string {
  let out = text;
  for (const s of secrets) if (s.length >= MIN_SECRET) out = out.split(s).join('[hidden]');
  return out
    .replace(/https?:\/\/[^\s"'<>]*overlay\.html[^\s"'<>]*/gi, '[overlay address]')
    .replace(/Bearer\s+[^\s"',;]+/gi, 'Bearer [hidden]')
    .replace(/(key|secret|token|password)=[^\s&"'<>]*/gi, '$1=[hidden]');
}

export class Logger {
  private secrets = new Set<string>();

  constructor(private dir: string, private now: () => Date = () => new Date()) {
    try {
      mkdirSync(dir, { recursive: true });
      const today = new Date(this.now().getFullYear(), this.now().getMonth(), this.now().getDate()).getTime();
      for (const name of readdirSync(dir)) {
        const m = FILE.exec(name);
        if (m && today - new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() > KEEP_DAYS * 86_400_000) unlinkSync(join(dir, name));
      }
    } catch { /* the log is a help, never a reason to stop */ }
  }

  /** Something that must never appear in the log (the token, the OBS password, the pair code). */
  addSecret(secret: string): void {
    if (secret) this.secrets.add(secret);
  }

  redact = (text: string): string => redact(text, this.secrets);

  /** The one way to write a line. */
  log = (line: string): void => {
    try {
      const at = this.now();
      appendFileSync(join(this.dir, `bridge-${day(at)}.log`), `${at.toISOString()} ${this.redact(line).replace(/\s*[\r\n]+\s*/g, ' ')}\n`);
    } catch { /* see above */ }
  };
}
