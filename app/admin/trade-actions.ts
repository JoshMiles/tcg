'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-guard';
import { sanitizeTradeSettings } from '@/lib/trade-core';
import { recordAudit } from '@/lib/audit';
import { getSeason, getUserProfile, saveSeason } from '@/lib/kv';
import { saveFlags } from '@/lib/user-admin';
import { cancelOpenTrades, cancelTrade, extendOpenTrades, saveTradeSettings } from '@/lib/trades';

export interface TradeActionResult { ok: boolean; message: string }

export async function saveTradeSettingsAction(formData: FormData) {
  await requireAdmin();
  await saveTradeSettings(sanitizeTradeSettings({
    enabled: formData.get('enabled') === 'on',
    expiryHours: Number(formData.get('expiryHours')),
    maxOpenPerUser: Number(formData.get('maxOpenPerUser')),
    cooldownSeconds: Number(formData.get('cooldownSeconds')),
    maxStacksPerSide: Number(formData.get('maxStacksPerSide')),
    minAccountHours: Number(formData.get('minAccountHours')),
  }));
  revalidatePath('/admin/trades');
  redirect('/admin/trades?tab=settings&saved=1');
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
  revalidatePath('/admin/trades');
  revalidatePath(`/admin/seasons/${seasonId}`);
  revalidatePath('/trade', 'layout');
  return { ok: true, message: frozen ? `Trading closed for ${season.name}.` : `Trading reopened for ${season.name}.` };
}

/** One-click "stop this viewer trading" from a flagged trade; their open offers are cancelled and refunded too. */
export async function blockViewerTradingAction(username: string, reason: string): Promise<TradeActionResult> {
  await requireAdmin();
  const name = username.toLowerCase();
  const profile = await getUserProfile(name);
  await saveFlags(name, { noTrading: true, hideFromBoard: !!profile?.flags?.hideFromBoard, reason: reason.slice(0, 200) || 'Blocked from the Trades page' });
  const n = await cancelOpenTrades({ username: name }, 'Trading was turned off for a viewer in this offer');
  revalidatePath('/admin/trades');
  revalidatePath(`/admin/users/${name}`);
  return { ok: true, message: `${name} can no longer trade${n ? `; ${n} open offer${n === 1 ? '' : 's'} cancelled` : ''}.` };
}

/** Cancels one open offer without redirecting (for the detail panel). */
export async function cancelOneTradeAction(id: string): Promise<TradeActionResult> {
  await requireAdmin();
  const res = await cancelTrade(id, 'admin', { admin: true, reason: 'Cancelled by an admin' });
  revalidatePath('/admin/trades');
  return res.ok ? { ok: true, message: 'Offer cancelled and the cards returned.' } : { ok: false, message: res.error };
}
