'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { recordAudit } from '@/lib/audit';
import { createPairCode, revokeBridge } from '@/lib/bridge';
import { showCode } from '@/lib/bridge-core';

/** Makes a one-time code (good for 10 minutes) to type into TCG Bridge. Returned to the page, never put in a URL. */
export async function createPairCodeAction(): Promise<{ code: string; until: string }> {
  const staff = await requireAdmin();
  const r = await createPairCode(staff.login);
  await recordAudit('everyone', 'TCG Bridge pair code made');
  return { code: showCode(r.code), until: `${new Date(r.expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC` };
}

/** Revokes a paired bridge: its token stops working at once. */
export async function revokeBridgeAction(id: string): Promise<void> {
  await requireAdmin();
  const name = await revokeBridge(String(id));
  if (name) await recordAudit('everyone', 'TCG Bridge revoked', name);
  revalidatePath('/admin/mixitup');
}
