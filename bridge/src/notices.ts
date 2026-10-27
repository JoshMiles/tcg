// Staff notices (ROADMAP 55.13): which kinds the app shows (a switch each) and the one rule for links: a link opens in the browser only when it is on the
// paired site's own address. Plain TypeScript, no Electron: the checks run it.

export const NOTICE_KINDS = ['attention', 'feedback', 'refusal', 'deploy'] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];
export type NoticeSwitches = Record<NoticeKind, boolean>;
export const NOTICE_LABELS: Record<NoticeKind, string> = { attention: 'Needs attention', feedback: 'New reports and feedback', refusal: 'Paid pull refusals', deploy: 'Deploys' };

/** Every kind is on until the streamer switches it off (the site sends none to a PC without staff tools). */
export const defaultNotices = (): NoticeSwitches => ({ attention: true, feedback: true, refusal: true, deploy: true });

export function cleanNoticeSwitches(raw: unknown, base: NoticeSwitches = defaultNotices()): NoticeSwitches {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = { ...base };
  for (const k of NOTICE_KINDS) if (typeof o[k] === 'boolean') out[k] = o[k] as boolean;
  return out;
}

/** `path` on the paired `site` as a full address, or null when it is not a plain path on that site (another host, `//host`, a backslash, a scheme). */
export function siteUrl(site: string, path: unknown): string | null {
  if (typeof path !== 'string' || path.length > 300 || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
  try {
    const base = new URL(site);
    const url = new URL(path, base);
    return url.origin === base.origin ? url.href : null;
  } catch {
    return null;
  }
}

export interface Notice { kind: NoticeKind; title: string; text: string; url: string }

/** The notice a job carries, ready to show; null when its shape is wrong, its kind is switched off here, or its link is not on the paired site. */
export function cleanNotice(raw: unknown, site: string, on: NoticeSwitches): Notice | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const kind = NOTICE_KINDS.find(k => k === o.kind);
  const url = siteUrl(site, o.href);
  const title = typeof o.title === 'string' ? o.title.trim().slice(0, 100) : '';
  if (!kind || !on[kind] || !url || !title) return null;
  return { kind, title, text: typeof o.text === 'string' ? o.text.trim().slice(0, 300) : '', url };
}
