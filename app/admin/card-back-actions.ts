'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { recordAudit } from '@/lib/audit';
import { DEFAULT_CARD_BACK, sanitizeCardBack, type CardBackStyle } from '@/lib/card-back';
import { getCardBack, saveCardBack, deleteCardBack } from '@/lib/card-back-store';
import { getPack } from '@/lib/kv';

// The designed back of a pack's prints (ROADMAP 20.1). Self-contained so the pack workspace (20.2) can host the editor unchanged.

function refresh(packId: string) {
  revalidatePath(`/admin/packs/${packId}`);
  // Prints, binders, dialogs and share images on the public site read the design.
  revalidatePath('/', 'layout');
}

/** Saves the design (validated by `sanitizeCardBack`); a design equal to the classic look removes it. Returns what was stored. */
export async function saveCardBackAction(packId: string, input: unknown): Promise<CardBackStyle> {
  await requireAdmin();
  const pack = await getPack(packId);
  if (!pack) throw new Error('Pack not found');
  const style = await saveCardBack(packId, input);
  await recordAudit(`pack:${packId}`, 'Card back saved', pack.name);
  refresh(packId);
  return style;
}

/** Back to the classic look. */
export async function resetCardBackAction(packId: string): Promise<CardBackStyle> {
  await requireAdmin();
  const pack = await getPack(packId);
  if (!pack) throw new Error('Pack not found');
  await deleteCardBack(packId);
  await recordAudit(`pack:${packId}`, 'Card back reset', pack.name);
  refresh(packId);
  return sanitizeCardBack(DEFAULT_CARD_BACK);
}

/** The design of another pack (or the classic look when it has none), to load into the editor. Nothing is saved until Save. */
export async function loadCardBackAction(fromPackId: string): Promise<CardBackStyle> {
  await requireAdmin();
  return (await getCardBack(fromPackId)) ?? sanitizeCardBack(DEFAULT_CARD_BACK);
}
