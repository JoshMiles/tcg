// What TCG Bridge's Staff tab asks the site to do (ROADMAP 55.12). POST /api/bridge/staff runs one fixed action and GET reads what the tab shows;
// both behind bridgeStaffGuard (a bearer token whose PC has "Staff tools on this PC" switched on, Mix It Up page). Each action calls the function the
// dashboard or admin page calls (lib/staff-actions.ts, lib/pull-limit.ts, lib/trades.ts, lib/pull-block.ts) and writes one audit line that names the PC
// and the admin who paired it; the audit line also reaches the Discord admin log like any staff action.
import { revalidatePath } from 'next/cache';
import { cleanUsername, parseVariant } from '@/app/admin/actions/form-helpers';
import { recordAudit } from './audit';
import { runBackup } from './backup';
import { formatBytes } from './data-health';
import { reportBackup } from './system-notices';
import { categoryOf, plainText } from './activity-view';
import { paletteRecords } from './palette-items';
import { rankItems } from './palette';
import type { BridgeToken } from './bridge';
import { getActivity } from './activity';
import { getActiveSeasonWithPacks, getAllCollectionUsers, getUserCards } from './kv';
import { getSeasonLeaderboardCached } from './leaderboard';
import { currentStreamKey, getMixItUpLog } from './mixitup';
import { REFUSAL_LABELS } from './mixitup-core';
import { getStreamBuff, setStreamPullBuff } from './pull-limit';
import { streamAmount, streamBuffAmount } from './pull-limit-core';
import { blockPulls, liftPullBlock, listPullBlocks } from './pull-block';
import { grantCardTo, queueOverlayEvents, queueShowOff } from './staff-actions';
import { getTradeSettings, saveTradeSettings } from './trades';
import { VARIANTS, VARIANT_LABELS, decodeEntry } from './variants';

export interface StaffResult { ok: boolean; message: string; needsForce?: boolean }
const done = (ok: boolean, message: string, extra: Partial<StaffResult> = {}): StaffResult => ({ ok, message, ...extra });
const NO_USER = 'Type a valid Twitch name (letters, numbers and underscores).';

/** "via TCG Bridge on Stream PC, paired by cheesygidds": the end of every audit line this file writes. */
const via = (pc: BridgeToken) => `via TCG Bridge on ${pc.name}, paired by ${pc.by ?? 'an admin'}`;

export async function runStaffAction(pc: BridgeToken, body: Record<string, unknown>): Promise<StaffResult> {
  const user = cleanUsername(typeof body.username === 'string' ? body.username : null);
  const audit = (who: string | null, what: string, detail?: string) => recordAudit(who ?? 'everyone', `${what} ${via(pc)}`, detail);
  switch (body.action) {
    case 'gift': {
      if (!user) return done(false, NO_USER);
      const count = Math.min(10, Math.max(1, Math.floor(Number(body.count)) || 1));
      const r = await queueOverlayEvents('pull', user, count, body.force === true);
      if (r.ok) await audit(user, `Gifted ${count} pack${count === 1 ? '' : 's'}`);
      return r;
    }
    case 'show-collection': {
      if (!user) return done(false, NO_USER);
      const r = await queueOverlayEvents('collection', user, 1, body.force === true);
      if (r.ok) await audit(user, 'Showed collection on stream');
      return r;
    }
    case 'show-card': {
      if (!user) return done(false, NO_USER);
      const r = await queueShowOff(user, typeof body.card === 'string' ? body.card : '');
      if (r.ok) await audit(user, 'Showed a card on stream', r.card);
      return done(r.ok, r.ok ? r.message : r.message || r.error);
    }
    case 'grant': {
      if (!user) return done(false, NO_USER);
      const r = await grantCardTo(user, Math.floor(Number(body.cardNumber)), parseVariant(typeof body.variant === 'string' ? body.variant : null));
      if (r.ok) await audit(user, 'Card granted', r.message);
      return r;
    }
    case 'stream-extra': {
      const n = streamAmount(typeof body.amount === 'number' ? body.amount : String(body.amount ?? '').trim());
      if (n === null) return done(false, 'Type a whole number, 0 or more.');
      await setStreamPullBuff(n, await currentStreamKey(), `TCG Bridge (${pc.by ?? pc.name})`);
      await audit(null, n === 0 ? 'Stream pull bonus cleared' : 'Stream pull bonus set', n === 0 ? undefined : `+${n} pulls while this stream lasts`);
      revalidatePath('/admin/mixitup');
      return done(true, n === 0 ? 'The extra pulls for this stream are cleared.' : `Everyone gets ${n} extra pull${n === 1 ? '' : 's'} this stream.`);
    }
    case 'trading': { // on = true resumes trading
      const settings = await getTradeSettings();
      const on = body.on === true;
      if (settings.enabled !== on) {
        await saveTradeSettings({ ...settings, enabled: on });
        await audit(null, on ? 'Trading resumed' : 'Trading paused');
        revalidatePath('/admin/trades');
      }
      return done(true, on ? 'Trading is open.' : 'Trading is paused.');
    }
    case 'block': {
      if (!user) return done(false, NO_USER);
      const thisStream = body.mode !== 'until-lifted';
      await blockPulls(user, pc.by ?? pc.name, thisStream);
      await audit(user, 'Blocked from pulls', thisStream ? 'for this stream' : 'until lifted');
      revalidatePath('/admin/mixitup');
      return done(true, `${user} is blocked from pulls ${thisStream ? 'for this stream' : 'until you lift it'}.`);
    }
    case 'unblock': {
      if (!user) return done(false, NO_USER);
      if (!(await liftPullBlock(user))) return done(false, `${user} was not blocked.`);
      await audit(user, 'Pull block lifted');
      revalidatePath('/admin/mixitup');
      return done(true, `${user} can pull again.`);
    }
    case 'backup': { // the same backup as Admin Settings > Back up now (ROADMAP 55.13)
      try {
        const run = await runBackup();
        await reportBackup(run);
        await audit(null, 'Backup taken', `${run.name}, ${formatBytes(run.bytes)}`);
        revalidatePath('/admin/settings');
        return done(true, `Backup saved: ${run.keys} keys, ${formatBytes(run.bytes)}.`);
      } catch (e) {
        const why = e instanceof Error && e.message ? e.message : 'Backup failed.';
        await reportBackup({ error: why });
        await audit(null, 'Backup failed', why.slice(0, 200));
        return done(false, why);
      }
    }
    case 'scene': { // the app has already switched the scene in OBS; this is the audit line
      const name = typeof body.name === 'string' ? body.name.slice(0, 80) : '';
      if (!name) return done(false, 'No scene was named.');
      await audit(null, 'OBS scene switched', name);
      return done(true, `Switched to ${name}.`);
    }
    default:
      return done(false, 'Unknown action.');
  }
}

/** The reads: `state` (what the controls show), `users` (the names to complete), `cards` (a search of the active season) and `viewer` (a look-up). */
export async function runStaffRead(what: string | null, q: string): Promise<Record<string, unknown>> {
  switch (what) {
    case 'state': {
      const [trading, buff, blocks, stream] = await Promise.all([getTradeSettings(), getStreamBuff(), listPullBlocks(), currentStreamKey()]);
      return { tradingPaused: !trading.enabled, extra: streamBuffAmount(buff, stream), blocks, variants: VARIANTS.map(id => ({ id, label: VARIANT_LABELS[id] })) };
    }
    case 'users':
      return { users: (await getAllCollectionUsers().catch(() => [])).slice(0, 600).map(u => u.username).sort() };
    case 'cards': {
      const needle = q.trim().toLowerCase().replace(/^#/, '');
      const cards = (await getActiveSeasonWithPacks().catch(() => null))?.packs.flatMap(p => p.cards) ?? [];
      return { cards: !needle ? [] : cards.filter(c => c.name.toLowerCase().includes(needle) || String(c.number) === needle).slice(0, 15).map(c => ({ number: c.number, name: c.name })) };
    }
    case 'activity': { // the dashboard's recent activity: pulls, grants and trades, newest first
      const events = (await getActivity({ limit: 200 })).events.filter(e => ['pulls', 'grants', 'trades'].includes(categoryOf(e))).slice(0, 15);
      return { events: events.map(e => ({ at: e.at, text: plainText(e, () => undefined) })) };
    }
    case 'search': { // the admin palette's records (viewers, packs, seasons) plus the active season's cards, each with its admin page
      const needle = q.trim().toLowerCase().replace(/^#/, '');
      if (!needle) return { results: [] };
      const found: { label: string; hint: string; href: string }[] = rankItems((await paletteRecords()).items, q, 8).filter(i => i.href).map(i => ({ label: i.label, hint: i.hint ?? i.group, href: i.href! }));
      const packs = (await getActiveSeasonWithPacks().catch(() => null))?.packs ?? [];
      for (const p of packs) for (const c of p.cards) if (c.name.toLowerCase().includes(needle) || String(c.number) === needle) found.push({ label: c.name, hint: `Card #${c.number}`, href: `/admin/packs/${p.pack.id}` });
      return { results: found.slice(0, 12) };
    }
    case 'viewer': {
      const user = cleanUsername(q);
      if (!user) return { error: NO_USER };
      const active = await getActiveSeasonWithPacks().catch(() => null);
      const entries = active ? await getUserCards(active.season.collectionName, user) : [];
      const board = active ? await getSeasonLeaderboardCached(active.season).catch(() => null) : null;
      const rank = board ? board.rows.findIndex(r => r.username === user) + 1 : 0;
      const pulls = (await getActivity({ limit: 500 })).events.filter(e => e.type === 'pull' && e.username === user).slice(0, 5)
        .map(e => ({ at: e.at, text: e.type === 'pull' ? `${e.cardName}${e.variant && e.variant !== 'regular' ? ` (${VARIANT_LABELS[e.variant]})` : ''}` : '' }));
      const refusals = (await getMixItUpLog()).filter(e => e.username === user && e.what === 'refused').slice(0, 5)
        .map(e => ({ at: e.at, text: REFUSAL_LABELS[e.detail.split(':')[0].trim()] ?? e.detail }));
      return {
        username: user, copies: entries.length, unique: new Set(entries.map(e => decodeEntry(e).cardNumber)).size,
        rank: rank > 0 ? rank : null, of: board?.rows.length ?? 0, pulls, refusals, blocked: (await listPullBlocks()).some(b => b.username === user),
      };
    }
    default:
      return { error: 'Unknown read.' };
  }
}
