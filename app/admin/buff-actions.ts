'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { recordAudit } from '@/lib/audit';
import { cleanBuffDefInput, describeBuffDef, type BuffDef } from '@/lib/buffs-core';
import { deleteBuffDef, getBuffDef, upsertBuffDef } from '@/lib/buffs';

export type BuffActionResult = { ok: true; def?: BuffDef } | { ok: false; message: string };

export async function createBuffAction(input: Record<string, unknown>): Promise<BuffActionResult> {
  await requireAdmin();
  const id = crypto.randomUUID();
  const cleaned = cleanBuffDefInput(input, id);
  if (!cleaned.ok) return cleaned;
  await upsertBuffDef(cleaned.def);
  await recordAudit(`buff:${id}`, 'Buff created', `${cleaned.def.name}: ${describeBuffDef(cleaned.def)}`);
  revalidatePath('/admin/buffs');
  return { ok: true, def: cleaned.def };
}

export async function updateBuffAction(id: string, input: Record<string, unknown>): Promise<BuffActionResult> {
  await requireAdmin();
  const existing = await getBuffDef(id);
  if (!existing) return { ok: false, message: 'This buff no longer exists.' };
  const cleaned = cleanBuffDefInput(input, id);
  if (!cleaned.ok) return cleaned;
  await upsertBuffDef(cleaned.def);
  await recordAudit(`buff:${id}`, 'Buff edited', `${cleaned.def.name}: ${describeBuffDef(cleaned.def)}`);
  revalidatePath('/admin/buffs');
  return { ok: true, def: cleaned.def };
}

export async function deleteBuffAction(id: string): Promise<BuffActionResult> {
  await requireAdmin();
  const existing = await getBuffDef(id);
  if (!existing) return { ok: false, message: 'This buff no longer exists.' };
  const res = await deleteBuffDef(id);
  if (!res.ok) return res;
  await recordAudit(`buff:${id}`, 'Buff deleted', `${existing.name}: ${describeBuffDef(existing)}`);
  revalidatePath('/admin/buffs');
  return { ok: true };
}
