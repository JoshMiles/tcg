'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-guard';
import { heldCardNumbers } from '@/lib/card-held';
import { notifyAdminLog } from '@/lib/discord';
import { currentStaffLogin } from '@/lib/staff-actor';
import { getPackCards, savePackCards } from '@/lib/kv';
import type { OptionalVariant } from '@/lib/types';
import { OPTIONAL, cardFromForm, disabledFromForm, withoutVariant, withVariant, type BulkCardOp } from './form-helpers';

// ── Cards ─────────────────────────────────────────────────

export async function addCard(packId: string, formData: FormData) {
  await requireAdmin();
  const cards = await getPackCards(packId);
  const maxNum = cards.reduce((m, c) => Math.max(m, c.number), 0);
  const { fields, problems } = cardFromForm(formData, cards.map(c => c.number), maxNum + 1, false); // a new card always gets the next free number
  if (problems.length > 0) redirect(`/admin/packs/${packId}?error=${encodeURIComponent(problems.join(' '))}`);
  const soundUrl = (formData.get('soundUrl') as string) || undefined;
  const fullArtImageUrl = (formData.get('fullArtImageUrl') as string) || undefined;
  await savePackCards(packId, [
    ...cards,
    {
      id: crypto.randomUUID(),
      number: maxNum + 1,
      name: fields.name,
      imageUrl: (formData.get('imageUrl') as string) || '',
      ...(soundUrl && { soundUrl }),
      ...(fullArtImageUrl && { fullArtImageUrl }),
      ...(disabledFromForm(formData).length > 0 && { disabledVariants: disabledFromForm(formData) }),
      upgradesEnabled: formData.get('upgradesEnabled') !== 'off',
      probability: fields.probability,
      stars: fields.stars,
    },
  ]);
  revalidatePath(`/admin/packs/${packId}`);
}

export async function updateCard(packId: string, cardId: string, formData: FormData) {
  await requireAdmin();
  const cards = await getPackCards(packId);
  const current = cards.find(c => c.id === cardId);
  if (!current) redirect(`/admin/packs/${packId}`);
  const { fields, problems } = cardFromForm(formData, cards.filter(c => c.id !== cardId).map(c => c.number), current.number);
  // Viewers' collections point at card numbers: once someone holds this card its number is fixed (renumbering would hand their copies to another card).
  if (fields.number !== current.number && (await heldCardNumbers(packId)).has(current.number)) problems.push(`#${current.number} has been pulled by viewers, so its number can't change.`);
  if (problems.length > 0) redirect(`/admin/packs/${packId}/cards/${cardId}?error=${encodeURIComponent(problems.join(' '))}`);
  const soundUrl = (formData.get('soundUrl') as string) || undefined;
  // The chosen still frames ride along in the form; a still only stays while it belongs to the same image (the picker clears it on a new upload).
  const nextImage = (formData.get('imageUrl') as string) || current.imageUrl;
  const nextFull = (formData.get('fullArtImageUrl') as string) || undefined;
  const stillUrl = nextImage === current.imageUrl || (formData.get('stillUrl') as string) !== (current.stillUrl ?? '') ? (formData.get('stillUrl') as string) || undefined : undefined;
  const fullArtStillUrl = nextFull && (nextFull === current.fullArtImageUrl || (formData.get('fullArtStillUrl') as string) !== (current.fullArtStillUrl ?? '')) ? (formData.get('fullArtStillUrl') as string) || undefined : undefined;
  if (stillUrl !== current.stillUrl || fullArtStillUrl !== current.fullArtStillUrl) {
    await notifyAdminLog({ action: stillUrl || fullArtStillUrl ? 'Card still frame chosen' : 'Card still frame reset', subject: current.name, by: await currentStaffLogin() });
  }
  await savePackCards(
    packId,
    cards.map(c =>
      c.id === cardId
        ? {
            ...c,
            name: fields.name,
            imageUrl: nextImage,
            soundUrl,
            fullArtImageUrl: nextFull,
            stillUrl,
            fullArtStillUrl,
            upgradesEnabled: formData.get('upgradesEnabled') === 'on',
            disabledVariants: disabledFromForm(formData, c.disabledVariants ?? []),
            probability: fields.probability,
            stars: fields.stars,
            number: fields.number,
          }
        : c
    )
  );
  revalidatePath(`/admin/packs/${packId}`);
  redirect(`/admin/packs/${packId}`);
}

export async function setCardUpgrades(packId: string, cardId: string, enabled: boolean) {
  await requireAdmin();
  const cards = await getPackCards(packId);
  await savePackCards(packId, cards.map(c => (c.id === cardId ? { ...c, upgradesEnabled: enabled } : c)));
  revalidatePath(`/admin/packs/${packId}`);
}

/** Switches one variant on or off for a single card (on top of the pack's own switches). */
export async function setCardVariant(packId: string, cardId: string, variant: OptionalVariant, enabled: boolean) {
  await requireAdmin();
  if (!OPTIONAL.includes(variant)) return;
  const cards = await getPackCards(packId);
  await savePackCards(packId, cards.map(c => {
    if (c.id !== cardId) return c;
    const next = enabled ? withoutVariant(c.disabledVariants, variant) : withVariant(c.disabledVariants, variant);
    return { ...c, disabledVariants: next.length ? next : undefined };
  }));
  revalidatePath(`/admin/packs/${packId}`);
}


/** Bulk changes across every card in a pack. Returns how many cards actually changed. */
export async function bulkCards(packId: string, op: BulkCardOp): Promise<{ changed: number }> {
  await requireAdmin();
  const cards = await getPackCards(packId);
  let changed = 0;
  const next = cards.map(c => {
    let updated = c;
    if (op === 'upgrades-on' && c.upgradesEnabled === false) updated = { ...c, upgradesEnabled: true };
    else if (op === 'upgrades-off' && c.upgradesEnabled !== false) updated = { ...c, upgradesEnabled: false };
    else if (op === 'all-variants-on' && c.disabledVariants?.length) updated = { ...c, disabledVariants: undefined };
    else if (op === 'fullart-off-without-art' && !c.fullArtImageUrl) {
      // A card with no full-art image would show its normal art as Full Art / Full Art Holo / Golden: switch those off for it.
      const off = [...new Set([...(c.disabledVariants ?? []), 'full', 'shiny', 'golden'])] as OptionalVariant[];
      if (off.length !== (c.disabledVariants ?? []).length) updated = { ...c, disabledVariants: off };
    }
    if (updated !== c) changed++;
    return updated;
  });
  if (changed > 0) await savePackCards(packId, next);
  revalidatePath(`/admin/packs/${packId}`);
  return { changed };
}

export async function deleteCard(packId: string, cardId: string) {
  await requireAdmin();
  const cards = await getPackCards(packId);
  await savePackCards(packId, cards.filter(c => c.id !== cardId));
  revalidatePath(`/admin/packs/${packId}`);
}
