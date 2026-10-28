// The commit a build was made from (ROADMAP 56.1). `scripts/stamp.mjs` writes build-info.json before `npm run dist`; a dev run has none.
// Plain TypeScript, no Electron.
import { readFileSync } from 'node:fs';

export interface BuildInfo { commit: string; full: string; date: string; pr?: number }

export const commitUrl = (full: string): string => `https://github.com/JoshMiles/tcg/commit/${full}`;

/** The stamp, or null when the shape is wrong (a hand-edited file must not break the About tab). */
export function cleanBuildInfo(raw: unknown): BuildInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const full = typeof o.full === 'string' ? o.full.trim().toLowerCase() : '';
  const date = typeof o.date === 'string' ? o.date.slice(0, 10) : '';
  if (!/^[0-9a-f]{7,40}$/.test(full) || !/^\d{4}-\d\d-\d\d$/.test(date)) return null;
  const pr = typeof o.pr === 'number' && Number.isInteger(o.pr) && o.pr > 0 ? o.pr : undefined;
  return { commit: full.slice(0, 7), full, date, ...(pr ? { pr } : {}) };
}

export function readBuildInfo(file: string): BuildInfo | null {
  try { return cleanBuildInfo(JSON.parse(readFileSync(file, 'utf8'))); } catch { return null; }
}

/** The About line in three parts so the window can link the sha: head + sha + tail. Without a stamp: "Version 0.12.0, dev build". */
export function aboutParts(version: string, info: BuildInfo | null): { head: string; sha: string; tail: string } {
  if (!info) return { head: `Version ${version}, dev build`, sha: '', tail: '' };
  return { head: `Version ${version}, built from `, sha: info.commit, tail: `${info.pr ? ` (PR #${info.pr})` : ''} on ${info.date}` };
}

/** "built from abc1234 (PR #5) on 2026-10-28", or "dev build"; Copy diagnostics adds it after the version. */
export const stampText = (info: BuildInfo | null): string => aboutText('', info).slice('Version , '.length);

export function aboutText(version: string, info: BuildInfo | null): string {
  const p = aboutParts(version, info);
  return p.head + p.sha + p.tail;
}
