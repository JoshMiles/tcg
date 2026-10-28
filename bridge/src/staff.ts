// The Staff tab's logic (ROADMAP 55.12): what the window asks for, checked and sent to the site's /api/bridge/staff, plus the two things that
// stay on this PC (a viewer's Brie Bucks from Mix It Up, and the OBS scene). Plain TypeScript, no Electron: the checks run it with a fake site.
import { Unauthorized, type SiteClient } from './site';
import { siteUrl } from './notices';
import type { MixItUpClient } from './mixitup';
import type { ObsWatcher } from './obs';
import { previewAddress } from './preview';
import { findViewers, viewerFacts } from './staffpages';

export interface StaffReply { ok: boolean; text: string; data?: Record<string, unknown> }
export interface StaffDeps {
  client: Pick<SiteClient, 'base' | 'staff' | 'staffGet'>;
  mix: Pick<MixItUpClient, 'twitchUser'>;
  obs: Pick<ObsWatcher, 'sceneNames' | 'setScene' | 'canvasSize'> & { state: { scene: string } };
  /** The Brie Bucks currency id the site chose ('' = none yet). */
  currencyId: () => string;
  openExternal: (url: string) => unknown;
  now?: () => number;
}

/** The only actions the window may send; anything else is turned away here before it reaches the site. */
const ACTIONS = new Set(['gift', 'show-collection', 'show-card', 'grant', 'stream-extra', 'trading', 'block', 'unblock', 'backup', 'test-pull']);
const NAME = /^[a-z0-9_]{2,25}$/;
const USERS_TTL_MS = 5 * 60_000;

const clean = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
/** A Twitch name as typed: no @, lowercase, or '' when it cannot be one. */
export const cleanViewer = (v: unknown): string => { const n = clean(v, 40).replace(/^@/, '').toLowerCase(); return NAME.test(n) ? n : ''; };

/** The fields of one staff action that the site reads, each of the right type; the rest is dropped. */
export function cleanStaffAction(raw: Record<string, unknown>): Record<string, unknown> | null {
  const action = clean(raw.action, 30);
  if (!ACTIONS.has(action)) return null;
  const out: Record<string, unknown> = { action };
  if (action === 'test-pull') { // always a free pull; the site uses the first test viewer when none is named
    const username = cleanViewer(raw.username);
    if (username) out.username = username;
    out.force = raw.force === true;
  } else if (action !== 'stream-extra' && action !== 'trading' && action !== 'backup') {
    const username = cleanViewer(raw.username);
    if (!username) return null;
    out.username = username;
  }
  if (action === 'gift') out.count = Math.min(10, Math.max(1, Math.trunc(Number(raw.count)) || 1));
  if (action === 'gift' || action === 'show-collection') out.force = raw.force === true;
  if (action === 'show-card') out.card = clean(raw.card, 80);
  if (action === 'grant') { out.cardNumber = Math.trunc(Number(raw.cardNumber)); out.variant = clean(raw.variant, 30) || 'regular'; }
  if (action === 'stream-extra') out.amount = Math.max(0, Math.trunc(Number(raw.amount)) || 0);
  if (action === 'trading') out.on = raw.on === true;
  if (action === 'block') out.mode = raw.mode === 'until-lifted' ? 'until-lifted' : 'stream';
  return out;
}

export class StaffTools {
  private users: { at: number; list: string[] } | null = null;
  constructor(private d: StaffDeps) {}

  async run(req: Record<string, unknown>): Promise<StaffReply> {
    try {
      switch (req.op) {
        case 'state': return await this.state();
        case 'users': return await this.userList();
        case 'find': return await this.find(req.q);
        case 'cards': return await this.read('cards', clean(req.q, 60));
        case 'viewer': return await this.viewer(req.name);
        case 'do': return await this.act(req);
        case 'scene': return await this.scene(req.name);
        case 'open-admin': return this.openAdmin(req.name);
        case 'activity': return await this.read('activity');
        case 'search': return await this.read('search', clean(req.q, 60));
        case 'open': return this.open(req.href);
        case 'preview-url': return await this.preview();
        default: return { ok: false, text: 'Unknown request.' };
      }
    } catch (e) {
      if (e instanceof Unauthorized) throw e;
      return { ok: false, text: e instanceof Error && e.message ? e.message : 'Something went wrong' };
    }
  }

  private async read(what: string, q = ''): Promise<StaffReply> {
    const json = await this.d.client.staffGet(what, q);
    if (!json) return { ok: false, text: 'Staff tools are off for this PC.' };
    if (typeof json.error === 'string' && json.error) return { ok: false, text: json.error }; // the site's refusal (a role that cannot read this) or "Type a Twitch name"
    return { ok: true, text: '', data: json };
  }

  /** The switches' state from the site, with the OBS scenes (which only this PC knows). */
  private async state(): Promise<StaffReply> {
    const r = await this.read('state');
    return r.ok ? { ...r, data: { ...r.data, scenes: this.d.obs.sceneNames(), scene: this.d.obs.state.scene } } : r;
  }

  /** Viewer names to complete while typing: read again after five minutes, never on every key. */
  private async userList(): Promise<StaffReply> {
    const now = (this.d.now ?? Date.now)();
    if (!this.users || now - this.users.at > USERS_TTL_MS) {
      const r = await this.read('users');
      if (!r.ok) return r;
      this.users = { at: now, list: Array.isArray(r.data?.users) ? (r.data!.users as unknown[]).filter((u): u is string => typeof u === 'string') : [] };
    }
    return { ok: true, text: '', data: { users: this.users.list } };
  }

  /** "Find a viewer": the names that match what was typed, from the cached list. */
  private async find(q: unknown): Promise<StaffReply> {
    const r = await this.userList();
    return r.ok ? { ok: true, text: '', data: { names: findViewers(r.data!.users as string[], clean(q, 40)) } } : r;
  }

  /** The site's side of a viewer (cards, rank, pulls, refusals) plus their Brie Bucks, which only Mix It Up on this PC knows. */
  private async viewer(rawName: unknown): Promise<StaffReply> {
    const name = cleanViewer(rawName);
    if (!name) return { ok: false, text: 'Type a Twitch name.' };
    const r = await this.read('viewer', name);
    if (!r.ok) return r;
    let bucks: number | null = null;
    const currency = this.d.currencyId().toLowerCase();
    if (currency) {
      const u = await this.d.mix.twitchUser(name).catch(() => null);
      bucks = u?.amounts.find(a => a.id.toLowerCase() === currency)?.amount ?? null;
    }
    const data = { ...r.data, bucks };
    return { ok: true, text: '', data: { ...data, facts: viewerFacts(data) } };
  }

  private async act(req: Record<string, unknown>): Promise<StaffReply> {
    const body = cleanStaffAction(req);
    if (!body) return { ok: false, text: 'Check the name and try again.' };
    const r = await this.d.client.staff(body);
    return { ok: r.ok, text: r.message, ...(r.needsForce ? { data: { needsForce: true } } : {}) };
  }

  /** The Preview overlay window's address (57.10): the site's read-only preview key on its own overlay page, and OBS's canvas size (1920x1080 without OBS). */
  private async preview(): Promise<StaffReply> {
    const r = await this.d.client.staff({ action: 'preview-url' });
    const src = r.ok ? previewAddress(this.d.client.base, r.url) : null;
    if (!src) return { ok: false, text: r.ok ? 'The site did not give a preview address.' : r.message };
    return { ok: true, text: '', data: { src, expiresAt: r.expiresAt ?? 0, ...(await this.d.obs.canvasSize()) } };
  }

  /** Switches the OBS program scene on this PC, then tells the site so the change is in the audit log. */
  private async scene(rawName: unknown): Promise<StaffReply> {
    const name = clean(rawName, 80);
    if (!name || !this.d.obs.sceneNames().includes(name)) return { ok: false, text: 'OBS has no such scene.' };
    await this.d.obs.setScene(name);
    const r = await this.d.client.staff({ action: 'scene', name }).catch(() => null);
    return { ok: true, text: r?.ok ? `Switched to ${name}.` : `Switched to ${name} (the site did not log it).` };
  }

  /** A search result's admin page (Quick search): only a path under /admin on the paired site's own address. */
  private open(href: unknown): StaffReply {
    const url = typeof href === 'string' && /^\/admin(\/|\?|#|$)/.test(href) ? siteUrl(this.d.client.base, href) : null;
    if (!url) return { ok: false, text: 'That is not an admin page.' };
    void this.d.openExternal(url);
    return { ok: true, text: 'Opened in your browser.' };
  }

  /** The viewer's page in the admin site, in the default browser. Only the paired site's address, only a valid name. */
  private openAdmin(rawName: unknown): StaffReply {
    const name = cleanViewer(rawName);
    if (!name) return { ok: false, text: 'Type a Twitch name.' };
    void this.d.openExternal(`${this.d.client.base}/admin/users/${name}`);
    return { ok: true, text: 'Opened in your browser.' };
  }
}
