// Suggestions and problem reports, the client-safe half (pure): shapes, limits, validation, the Discord text and the retention rule.
// The store lives in lib/feedback.ts. scripts/check-feedback.mts covers this file.

/** 'deletion' is an account deletion request (ROADMAP 11.3): it shares the inbox but has its own flow and is never sent from the feedback form. */
export type FeedbackKind = 'idea' | 'bug' | 'deletion' | 'report';
export type FeedbackStatus = 'new' | 'planned' | 'done' | 'wontfix' | 'duplicate';

export const FEEDBACK_KINDS: FeedbackKind[] = ['idea', 'bug', 'deletion', 'report'];
export const FEEDBACK_STATUSES: FeedbackStatus[] = ['new', 'planned', 'done', 'wontfix', 'duplicate'];
export const KIND_LABELS: Record<FeedbackKind, string> = { idea: 'Suggestion', bug: 'Problem report', deletion: 'Deletion request', report: 'User report' };
export const STATUS_LABELS: Record<FeedbackStatus, string> = { new: 'New', planned: 'Planned', done: 'Done', wontfix: "Won't do", duplicate: 'Duplicate' };

/** A deletion request still waiting after this many days is overdue (people expect about a month). */
export const DELETION_OVERDUE_DAYS = 30;

export const FEEDBACK_LIMITS = {
  title: 100,
  body: 2000,
  expected: 1000,
  from: 200,
  reply: 1000,
  ua: 300,
  perDay: 5,
  /** Reports one viewer may file per UTC day (counted apart from the feedback sends). */
  reportsPerDay: 5,
  reportDetails: 1000,
  reportDetailsMin: 10,
  /** Newest items kept in the list. */
  listCap: 1000,
  /** Days a finished item is kept after it was resolved (answered, planned, done...). */
  keepDaysAfterResolved: 90,
  discordText: 500,
} as const;

/** Device details the sender agreed to include. The build stamp is added on the server, never taken from the request. */
export interface FeedbackMeta { ua?: string; screen?: string; build?: string }

export interface FeedbackItem {
  id: string;
  kind: FeedbackKind;
  user: string;
  title: string;
  body: string;
  /** Problem reports only: what they expected to happen. */
  expected?: string;
  /** Problem reports only: the page it happened on (a path on this site). For a user report: the trade or print page they linked. */
  from?: string;
  /** User reports only: the reported viewer's login, and why. Staff-only: never shown to the reported person. */
  target?: string;
  reason?: ReportReason;
  meta?: FeedbackMeta;
  at: number;
  status: FeedbackStatus;
  reply?: string;
  /** The staff login that last changed the status or wrote the reply (staff-only; never shown to the sender or in Discord). */
  repliedBy?: string;
  /** When the status first left 'new', for the retention sweep. */
  resolvedAt?: number;
}

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Single line: control characters and runs of spaces collapsed. */
export function oneLine(s: unknown, max: number): string {
  return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Several lines allowed, control characters other than newline and tab removed, trailing space trimmed. */
export function multiLine(s: unknown, max: number): string {
  return typeof s === 'string' ? s.replace(/\r\n?/g, '\n').replace(CONTROL, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '';
}

/** A page on this site: a path that starts with a single slash. Anything else (another site, a script) is dropped. */
export function cleanFrom(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.trim().slice(0, FEEDBACK_LIMITS.from);
  return /^\/(?!\/)[^\s\\]*$/.test(s) ? s : '';
}

export type FeedbackInput =
  | { ok: true; value: { kind: FeedbackKind; title: string; body: string; expected?: string; from?: string; includeDevice: boolean } }
  | { ok: false; error: string };

/** What the form sent → a clean submission or a message for the sender. */
export function parseFeedbackInput(raw: unknown): FeedbackInput {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const kind = o.kind === 'bug' ? 'bug' : o.kind === 'idea' ? 'idea' : null;
  if (!kind) return { ok: false, error: 'Choose whether this is a suggestion or a problem.' };
  const body = multiLine(o.body, FEEDBACK_LIMITS.body);
  if (body.length < 5) return { ok: false, error: kind === 'bug' ? 'Tell us what happened (at least a few words).' : 'Add a few details (at least a few words).' };
  let title = oneLine(o.title, FEEDBACK_LIMITS.title);
  if (kind === 'idea' && title.length < 3) return { ok: false, error: 'Give your suggestion a short title.' };
  if (kind === 'bug' && !title) title = oneLine(body, 60); // a problem report has no title field: the first words stand in
  const expected = kind === 'bug' ? multiLine(o.expected, FEEDBACK_LIMITS.expected) : '';
  const from = kind === 'bug' ? cleanFrom(o.from) : '';
  return { ok: true, value: { kind, title, body, ...(expected ? { expected } : {}), ...(from ? { from } : {}), includeDevice: o.includeDevice === true } };
}

/** The device details to keep, trimmed and bounded (only when the sender ticked the box). */
export function cleanMeta(raw: unknown, build: string): FeedbackMeta {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ua = oneLine(o.ua, FEEDBACK_LIMITS.ua);
  const screen = /^\d{2,5}x\d{2,5}$/.test(typeof o.screen === 'string' ? o.screen : '') ? (o.screen as string) : '';
  return { ...(ua ? { ua } : {}), ...(screen ? { screen } : {}), ...(build ? { build: oneLine(build, 40) } : {}) };
}

/** The UTC day, for the per-viewer daily counter. */
export const dayKey = (at: number) => new Date(at).toISOString().slice(0, 10);

export function isStatus(v: unknown): v is FeedbackStatus {
  return typeof v === 'string' && (FEEDBACK_STATUSES as string[]).includes(v);
}

/** Whether a sweep may delete an item now: it was resolved long enough ago. Open ('new') items are never deleted. */
export function expired(item: Pick<FeedbackItem, 'status' | 'resolvedAt'>, now: number): boolean {
  if (item.status === 'new') return false;
  const since = item.resolvedAt ?? 0;
  return since > 0 && now - since > FEEDBACK_LIMITS.keepDaysAfterResolved * 86_400_000;
}

/** What the sender hears when staff change an item. Null when there is nothing to say (nothing changed). */
export function noticeText(item: Pick<FeedbackItem, 'title' | 'status' | 'reply'> & { kind?: FeedbackKind }, changed: { status: boolean; reply: boolean }): string | null {
  if (!changed.status && !changed.reply) return null;
  if (item.kind === 'report') return changed.status ? (item.status === 'done' ? 'Thanks for your report. Staff have looked at it and dealt with it.' : item.status === 'wontfix' || item.status === 'duplicate' ? 'Thanks for your report. Staff have looked at it and no further action was needed.' : null) : null; // outcome only: never what was done to the other person, never the staff reply
  if (item.kind === 'deletion') return item.status === 'wontfix' ? `We could not delete your account yet.${item.reply ? ` Reason: ${item.reply.slice(0, 200)}` : ''}` : null; // a finished deletion has no one left to tell
  const what = `"${item.title.slice(0, 60)}"`;
  const status = item.status === 'new' ? '' : item.status === 'wontfix' ? `We won't be doing ${what}.` : item.status === 'done' ? `${what} is done.` : item.status === 'planned' ? `${what} is planned.` : `${what} was marked as a duplicate of something we already track.`;
  if (changed.reply && item.reply) return `${changed.status && status ? status + ' ' : ''}A reply on ${what}: ${item.reply.slice(0, 200)}`.trim();
  return status || null;
}

/** Text for Discord: Markdown neutralised and cut, so a post cannot format itself, link or ping. */
export function discordText(s: string, max: number = FEEDBACK_LIMITS.discordText): string {
  return s.replace(/([\\*_~`|>[\]()#:<])/g, '\\$1').replace(/@/g, '@\u200b').slice(0, max);
}


// ── User reports (ROADMAP 17.2) ──

export type ReportReason = 'offensive' | 'cheating' | 'scam' | 'other';
export const REPORT_REASONS: ReportReason[] = ['offensive', 'cheating', 'scam', 'other'];
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  offensive: 'Offensive name, bio or picture',
  cheating: 'Cheating or abuse',
  scam: 'Scam or unfair trade',
  other: 'Something else',
};

/** A trade or print page on this site (`/trade/<id>`, `/copy/<season>/<copy>`), or ''. */
export function cleanReportLink(v: unknown): string {
  const s = cleanFrom(v);
  return /^\/(trade|copy)\/[A-Za-z0-9_.:\-/]+$/.test(s) ? s : '';
}

export type ReportInput =
  | { ok: true; value: { target: string; reason: ReportReason; details: string; link?: string } }
  | { ok: false; error: string };

/** What the report dialog sent → a clean report or a message for the reporter. */
export function parseReportInput(raw: unknown): ReportInput {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const t = typeof o.target === 'string' ? o.target.trim().replace(/^@/, '').toLowerCase() : '';
  if (!/^[a-z0-9_]{3,25}$/.test(t)) return { ok: false, error: 'Who are you reporting? Open the report from their profile.' };
  const reason = (REPORT_REASONS as string[]).includes(o.reason as string) ? (o.reason as ReportReason) : null;
  if (!reason) return { ok: false, error: 'Choose a reason.' };
  const details = multiLine(o.details, FEEDBACK_LIMITS.reportDetails);
  if (reason === 'other' && details.length < FEEDBACK_LIMITS.reportDetailsMin) return { ok: false, error: `Tell us a little more (at least ${FEEDBACK_LIMITS.reportDetailsMin} characters).` };
  const link = cleanReportLink(o.link);
  return { ok: true, value: { target: t, reason, details, ...(link ? { link } : {}) } };
}
