// Chat posts at the start and end of a stream, the Brie Bucks backup and the Brie Bucks check (ROADMAP 55.10), the pure part: the settings and
// the ledger comparison. No database, no network. lib/bridge-chat.ts does the sending and keeps the records.

import type { StreamRecap } from './stream-recap';
import { getRarity } from './rarity';
import { VARIANT_LABELS } from './variants';

export const DEFAULT_START = 'Packs are open: type !pack';
export const DEFAULT_END = 'Thanks for watching! Top pull: {topPull}. Most packs: {topPullers}';
export const CHAT_LINE_MAX = 300;
export const START_VARS = ['channel'] as const;
export const END_VARS = ['channel', 'topPull', 'topPullers'] as const;

/** Every switch is off until it is switched on. */
export interface ChatSettings { startOn: boolean; startText: string; endOn: boolean; endText: string; backup: boolean; check: boolean }
export const DEFAULT_CHAT: ChatSettings = { startOn: false, startText: DEFAULT_START, endOn: false, endText: DEFAULT_END, backup: false, check: false };

const line = (v: unknown, fallback: string): string => (typeof v === 'string' ? v.trim().slice(0, CHAT_LINE_MAX) : '') || fallback;

export function normalizeChat(raw: unknown): ChatSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    startOn: r.startOn === true, startText: line(r.startText, DEFAULT_START),
    endOn: r.endOn === true, endText: line(r.endText, DEFAULT_END),
    backup: r.backup === true, check: r.check === true,
  };
}

/** The text with its {variables} filled in; an unknown one stays as typed. */
export const fillChat = (text: string, vars: Record<string, string>): string =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m)).replace(/\s+/g, ' ').trim().slice(0, CHAT_LINE_MAX);

/** The end-of-stream post: the top pull and the top three pullers from the recap. */
export function endLine(text: string, recap: Pick<StreamRecap, 'rarest' | 'topPullers'>, channel: string): string {
  return fillChat(text, {
    channel,
    topPull: recap.rarest ? `${recap.rarest.cardName} by ${recap.rarest.username}` : 'none',
    topPullers: (recap.topPullers ?? []).map(p => `${p.username} (${p.packs})`).join(', ') || 'none',
  });
}

/** One deduct or add. `amount` is signed (a deduct is negative); `at` is when the site queued the job. */
export interface LedgerRow { id: string; user: string; amount: number; at: number }
export interface AppLedgerRow extends LedgerRow { answer: string }
export const LEDGER_ROWS_MAX = 2000;

/** The rows a bridge posted, or the usable ones of them. */
export function cleanLedger(raw: unknown): AppLedgerRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-LEDGER_ROWS_MAX).flatMap(x => {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    if (typeof r.id !== 'string' || !r.id || typeof r.user !== 'string' || !Number.isInteger(r.amount) || typeof r.at !== 'number' || !Number.isFinite(r.at)) return [];
    return [{ id: r.id.slice(0, 80), user: r.user.slice(0, 40).toLowerCase(), amount: r.amount as number, at: r.at, answer: typeof r.answer === 'string' ? r.answer.slice(0, 120) : '' }];
  });
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** The jobs one side has and the other lacks, or has with a different amount, in words. Balances are not compared. */
export function compareLedgers(site: readonly LedgerRow[], app: readonly AppLedgerRow[]): string[] {
  const mine = new Map(site.map(r => [r.id, r]));
  const theirs = new Map(app.map(r => [r.id, r]));
  const out: string[] = [];
  for (const [id, s] of mine) {
    const a = theirs.get(id);
    if (!a) out.push(`${s.user} ${signed(s.amount)}: the site asked, TCG Bridge has no record of it`);
    else if (a.amount !== s.amount) out.push(`${s.user}: the site asked for ${signed(s.amount)}, TCG Bridge recorded ${signed(a.amount)}`);
  }
  for (const [id, a] of theirs) if (!mine.has(id)) out.push(`${a.user} ${signed(a.amount)}: in TCG Bridge's ledger${a.answer && a.answer !== 'ok' ? ` (${a.answer})` : ''}, not in the site's record`);
  return out;
}

// ── The end-of-stream summary for the app (ROADMAP 55.11) ──

export interface SummaryPull { username: string; cardName: string; rarity: string; variant: string; serial?: number }
/** What the app's summary window shows: the recap's own numbers plus the Brie Bucks the site took and gave back during the stream. */
export interface StreamSummary { packs: number; pullers: number; partial: boolean; topPullers: { username: string; packs: number }[]; bigPulls: SummaryPull[]; taken: number; refunded: number }

/** The recap (not recounted) and the site's charge record for the stream, as the job the app shows. */
export function summaryOf(recap: StreamRecap, charges: readonly LedgerRow[], from: number, to: number): StreamSummary {
  const pull = (p: NonNullable<StreamRecap['rarest']>): SummaryPull => ({ username: p.username, cardName: p.cardName, rarity: getRarity(p.stars)?.label ?? '', variant: VARIANT_LABELS[p.variant ?? 'regular'], ...(p.serial ? { serial: p.serial } : {}) });
  const big = [recap.rarest, ...recap.firstEver].filter((p): p is NonNullable<StreamRecap['rarest']> => !!p);
  const mine = charges.filter(r => r.at >= from && r.at <= to);
  return {
    packs: recap.packs, pullers: recap.pullers, partial: recap.partial,
    topPullers: (recap.topPullers ?? (recap.topPuller ? [recap.topPuller] : [])).slice(0, 3),
    bigPulls: big.filter((p, i) => big.findIndex(q => q.username === p.username && q.cardName === p.cardName && q.serial === p.serial) === i).slice(0, 5).map(pull),
    taken: -mine.filter(r => r.amount < 0).reduce((n, r) => n + r.amount, 0),
    refunded: mine.filter(r => r.amount > 0).reduce((n, r) => n + r.amount, 0),
  };
}
