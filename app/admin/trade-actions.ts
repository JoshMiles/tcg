'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-guard';
import { sanitizeTradeSettings } from '@/lib/trade-core';
import { cancelTrade, saveTradeSettings } from '@/lib/trades';

export async function saveTradeSettingsAction(formData: FormData) {
  await requireAdmin();
  await saveTradeSettings(sanitizeTradeSettings({
    enabled: formData.get('enabled') === 'on',
    expiryHours: Number(formData.get('expiryHours')),
    maxOpenPerUser: Number(formData.get('maxOpenPerUser')),
    cooldownSeconds: Number(formData.get('cooldownSeconds')),
    maxStacksPerSide: Number(formData.get('maxStacksPerSide')),
  }));
  revalidatePath('/admin/trades');
  redirect('/admin/trades?saved=1');
}

/** Cancels an open offer and returns the escrowed cards to their owner. Works while trading is paused. */
export async function adminCancelTradeAction(id: string) {
  await requireAdmin();
  await cancelTrade(id, 'admin', { admin: true, reason: 'Cancelled by an admin' });
  revalidatePath('/admin/trades');
  redirect('/admin/trades?cancelled=1');
}
