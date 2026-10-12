'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-guard';
import { getPack, getPackCards, savePack, savePackCards } from '@/lib/kv';
import type { Pack } from '@/lib/types';

/**
 * A copy of a pack as a draft: same settings and cards (new ids), named "<name> (copy)", never drawn until it is published.
 * Card numbers are copied as they are, so if both packs end up in one season, renumber one (viewer collections point at numbers).
 */
export async function duplicatePackAction(packId: string) {
  await requireAdmin();
  const source = await getPack(packId);
  if (!source) redirect('/admin/packs');
  const cards = await getPackCards(packId);
  const id = crypto.randomUUID();
  const { archived: _a, archivedAt: _b, ...rest } = source;
  void _a; void _b;
  const copy: Pack = { ...rest, id, name: `${source.name} (copy)`.slice(0, 80), status: 'draft', active: false, createdAt: Date.now() };
  await savePack(copy);
  await savePackCards(id, cards.map(c => ({ ...c, id: crypto.randomUUID() })));
  revalidatePath('/admin/packs');
  redirect(`/admin/packs/new?draft=${id}`);
}

/** Retires a pack: hidden from the library by default, never drawn. Its cards stay, so collections keep working. */
export async function archivePackAction(packId: string) {
  await requireAdmin();
  const pack = await getPack(packId);
  if (!pack) return;
  await savePack({ ...pack, active: false, archived: true, archivedAt: Date.now() });
  revalidatePath('/admin/packs');
  revalidatePath(`/admin/packs/${packId}`);
}

/** Brings an archived pack back (inactive: switch it on when ready). */
export async function restorePackAction(packId: string) {
  await requireAdmin();
  const pack = await getPack(packId);
  if (!pack) return;
  const { archived: _a, archivedAt: _b, ...rest } = pack;
  void _a; void _b;
  await savePack({ ...rest, active: false });
  revalidatePath('/admin/packs');
  revalidatePath(`/admin/packs/${packId}`);
}

/** Saves new probabilities for cards of a pack: { [cardId]: probability }. Unknown ids and bad numbers are ignored. */
export async function savePackOddsAction(packId: string, odds: Record<string, number>): Promise<{ changed: number }> {
  await requireAdmin();
  const cards = await getPackCards(packId);
  let changed = 0;
  const next = cards.map(c => {
    const v = odds[c.id];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1_000_000 || v === c.probability) return c;
    changed++;
    return { ...c, probability: Math.round(v * 10_000) / 10_000 };
  });
  if (changed > 0) await savePackCards(packId, next);
  revalidatePath(`/admin/packs/${packId}`);
  revalidatePath('/admin/packs');
  return { changed };
}
