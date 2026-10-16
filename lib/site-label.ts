// The alpha / beta label shown on the public site (ROADMAP 16.3): a banner strip, a pill beside the logo and a note in the admin header.
// It reads the KV key `access:settings` (written by Settings -> Access, ROADMAP 16.1) and only needs `label`, `mode` and `message` from it,
// so this helper stands on its own: it can be swapped for the access settings reader once both are in.

import { cache } from 'react';
import { prodKv } from './db';

export type SiteLabel = 'alpha' | 'beta';
export interface SiteLabelInfo { label: SiteLabel | null; mode: 'open' | 'beta' | 'alpha'; message?: string }

export const BANNER_DEFAULT: Record<SiteLabel, string> = {
  alpha: 'Alpha: things may change, and progress may be reset before launch.',
  beta: 'Beta: things may change, and progress may be reset before launch.',
};

/** Reads whatever was stored (a JSON string or an object); anything unexpected means no label. Pure, for the check. */
export function parseSiteLabel(raw: unknown): SiteLabelInfo {
  let o: unknown = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch { o = null; } }
  const r = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
  const message = typeof r.message === 'string' ? r.message.trim().slice(0, 300) : '';
  return {
    label: r.label === 'alpha' || r.label === 'beta' ? r.label : null,
    mode: r.mode === 'alpha' || r.mode === 'beta' ? r.mode : 'open',
    ...(message ? { message } : {}),
  };
}

/** The banner text: the admin's message when set, else the default for the label. */
export const bannerText = (info: SiteLabelInfo): string => info.message || (info.label ? BANNER_DEFAULT[info.label] : '');

/** The admin header's "Site: ..." text, or null when the site is open with no label. */
export function adminSiteText(info: SiteLabelInfo): string | null {
  if (info.mode !== 'open') return `closed ${info.mode}`;
  return info.label ? `open ${info.label}` : null;
}

/** Cached per request. A database error means no label, so a blip never breaks a page. */
export const getSiteLabel = cache(async (): Promise<SiteLabelInfo> => {
  try { return parseSiteLabel(await prodKv.get('access:settings')); } catch { return { label: null, mode: 'open' }; }
});
