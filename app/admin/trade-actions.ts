'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-guard';
import { requireStaff } from '@/lib/staff-guard';
import { checkModerate } from '@/lib/staff';
import { sanitizeTradeSettings } from '@/lib/trade-core';
import { recordAudit } from '@/lib/audit';
import { getSeason, getUserProfile, saveSeason } from '@/lib/kv';
import { saveFlags } from '@/lib/user-admin';
import { cancelOpenTrades, cancelTrade, extendOpenTrades, releaseStuckEscrow, reverseTrade, getTradeSettings, saveTradeSettings } from '@/lib/trades';
import { notifyAdminLog } from '@/lib/discord';
import { finishMove } from '@/lib/account-move';
import { currentStaffLogin } from '@/lib/staff-actor';

export interface TradeActionResult { ok: boolean; message: string }

export async function saveTradeSettingsAction(formData: FormData) {
  await requireAdmin();
  const was = (await getTradeSettings()).enabled;
  await saveTradeSettings(sanitizeTradeSettings({
    enabled: formData.get('enabled') === 'on',
    expiryHours: Number(formData.get('expiryHours')),
    maxOpenPerUser: Number(formData.get('maxOpenPerUser')),
    cooldownSeconds: Number(formData.get('cooldownSeconds')),
    maxStacksPerSide: Number(formData.get('maxStacksPerSide')),
    minAccountHours: Number(formData.get('minAccountHours')),
  }));
  const now = formData.get('enabled') === 'on';
  if (now !== was) await notifyAdminLog({ action: now ? 'Trading resumed' : 'Trading paused', by: await currentStaffLogin() });
  revalidatePath('/admin/trades');
  redirect('/admin/trades?tab=settings&saved=1');
}

/** Returns the prints of one closed offer that is still marked escrowed, then clears the flag. Safe to run again. */
export async function releaseStuckEscrowAction(id: string) {
  await requireAdmin();
  const res = await releaseStuckEscrow(id);
  revalidatePath('/admin/settings');
  if (!res.ok) redirect(`/admin/settings?tab=environment&error=${encodeURIComponent(res.error)}`);
  if (res.cleared) await recordAudit(res.trade.from, 'Stuck trade returned', `${res.trade.id}: editions returned and the escrow flag cleared`);
  redirect(`/admin/settings?tab=environment&note=${encodeURIComponent(res.cleared ? 'Editions returned and the escrow flag cleared.' : 'That offer was not marked escrowed.')}`);
}

/** Resumes a Move aside that stopped part way (Data health). Safe to repeat: every step skips what is already done. */
export async function finishMoveAction(from: string) {
  await requireAdmin();
  const res = await finishMove(from);
  revalidatePath('/admin/settings');
  revalidatePath('/admin/users');
  if (!res.ok) redirect(`/admin/settings?tab=environment&error=${encodeURIComponent(res.error)}`);
  redirect(`/admin/settings?tab=environment&note=${encodeURIComponent(`Move finished: ${from} is now ${res.to}.`)}`);
}

/** Cancels an open offer and returns the escrowed cards to their owner. Works while trading is paused. */
export async function adminCancelTradeAction(id: string) {
  await requireAdmin();
  await cancelTrade(id, 'admin', { admin: true, reason: 'Cancelled by an admin' });
  revalidatePath('/admin/trades');
  redirect('/admin/trades?cancelled=1');
}

/** Cancels every open offer that matches (everything, one viewer's, or one season's) and refunds the escrow. */
export async function cancelOpenTradesAction(scope: { username?: string; seasonId?: string }): Promise<TradeActionResult> {
  await requireAdmin();
  const username = scope.username?.trim().toLowerCase().replace(/^@/, '') || undefined;
  const n = await cancelOpenTrades({ username, seasonId: scope.seasonId || undefined });
  if (username) await recordAudit(username, 'Open trade offers cancelled', `${n} offer${n === 1 ? '' : 's'}, cards returned`);
  revalidatePath('/admin/trades');
  return { ok: true, message: n === 0 ? 'No open offers matched.' : `Cancelled ${n} offer${n === 1 ? '' : 's'} and returned the cards.` };
}

/** Pushes open offers' expiry back (all open offers, or the ids given). */
export async function extendOpenTradesAction(hours: number, ids: string[] | null = null): Promise<TradeActionResult> {
  await requireAdmin();
  const n = await extendOpenTrades(ids, hours);
  revalidatePath('/admin/trades');
  return { ok: true, message: n === 0 ? 'No open offers to extend.' : `Extended ${n} offer${n === 1 ? '' : 's'}.` };
}

/** Closes or reopens trading for one season (offers already open stay and can be cancelled). */
export async function setSeasonTradingAction(seasonId: string, frozen: boolean): Promise<TradeActionResult> {
  await requireAdmin();
  const season = await getSeason(seasonId);
  if (!season) return { ok: false, message: 'That season no longer exists.' };
  await saveSeason({ ...season, tradingFrozen: frozen ? true : undefined });
  await notifyAdminLog({ action: frozen ? 'Trading closed for a season' : 'Trading reopened for a season', subject: season.name, by: await currentStaffLogin() });
  revalidatePath('/admin/trades');
  revalidatePath(`/admin/seasons/${seasonId}`);
  revalidatePath('/trade', 'layout');
  return { ok: true, message: frozen ? `Trading closed for ${season.name}.` : `Trading reopened for ${season.name}.` };
}

/** One-click "stop this viewer trading" from a flagged trade; their open offers are cancelled and refunded too. */
export async function blockViewerTradingAction(username: string, reason: string): Promise<TradeActionResult> {
  const staff = await requireStaff('mod'); // mods moderate trades too
  const name = username.toLowerCase();
  const allowed = await checkModerate(staff, [name], 'block-trading');
  if (!allowed.ok) return { ok: false, message: allowed.error };
  const profile = await getUserProfile(name);
  const saved = await saveFlags(name, { noTrading: true, hideFromBoard: !!profile?.flags?.hideFromBoard, reason: reason.slice(0, 200) || 'Blocked from the Trades page' });
  if (!saved.ok) return { ok: false, message: saved.error };
  const n = await cancelOpenTrades({ username: name }, 'Trading was turned off for a viewer in this offer');
  revalidatePath('/admin/trades');
  revalidatePath('/mod/trades');
  revalidatePath(`/admin/users/${name}`);
  return { ok: true, message: `${name} can no longer trade${n ? `; ${n} open offer${n === 1 ? '' : 's'} cancelled` : ''}.` };
}

/** Cancels one open offer without redirecting (for the detail panel). */
export async function cancelOneTradeAction(id: string): Promise<TradeActionResult> {
  const staff = await requireStaff('mod'); // mods moderate trades too
  const res = await cancelTrade(id, 'admin', { admin: true, reason: 'Cancelled by staff', actor: staff });
  revalidatePath('/admin/trades');
  revalidatePath('/mod/trades');
  return res.ok ? { ok: true, message: 'Offer cancelled and the cards returned.' } : { ok: false, message: res.error };
}

/** Staff put every print of a completed trade back where it started (all or nothing). A reason is required; both people are told. */
export async function reverseTradeAction(id: string, reason: string): Promise<TradeActionResult> {
  const staff = await requireStaff('mod'); // mods moderate trades too; reverseTrade asks canModerate about both people
  const res = await reverseTrade(id, staff, reason);
  if (!res.ok) return { ok: false, message: res.error };
  const t = res.trade;
  for (const u of [t.from, t.resolvedBy]) if (u) await recordAudit(u, 'Trade reversed', `${t.id.slice(0, 8)} with ${u === t.from ? t.resolvedBy : t.from}: ${t.reverseReason}`);
  revalidatePath('/admin/trades');
  revalidatePath('/mod/trades');
  revalidatePath(`/trade/${id}`);
  return { ok: true, message: 'Trade reversed: every edition went back where it started.' };
}
