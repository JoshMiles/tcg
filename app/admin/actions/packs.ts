'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-guard';
import { cleanPackInput } from '@/lib/pack-clean';
import { savePack, getPack, deletePack } from '@/lib/kv';
import type { OptionalVariant } from '@/lib/types';
import { OPTIONAL, upgradeSettings, withoutVariant, withVariant } from './form-helpers';

// ── Packs (global) ────────────────────────────────────────

export async function updatePack(packId: string, formData: FormData) {
  await requireAdmin();
  const existing = await getPack(packId);
  if (!existing) return;
  // The same limits the wizard's autosave applies (cleanPackInput), again on the server: the form's own checks are not the only ones.
  // A blank field keeps what is saved; a number outside its range is brought inside it (a volume of 0 is a real setting: mute).
  const field = (key: string, fallback: number) => { const v = formData.get(key); return v === null || String(v).trim() === '' ? fallback : Number(v); };
  const up = upgradeSettings(formData);
  const clean = cleanPackInput({
    name: String(formData.get('name') ?? ''),
    coverImageUrl: String(formData.get('coverImageUrl') ?? '') || existing.coverImageUrl,
    active: formData.get('active') === 'true',
    weight: field('weight', existing.weight),
    accentColor: String(formData.get('accentColor') ?? ''),
    tearBorderColor: String(formData.get('tearBorderColor') ?? ''),
    holoMinStars: field('holoMinStars', existing.holoMinStars),
    cardTime: field('cardTime', existing.cardTime),
    cooldownTime: field('cooldownTime', existing.cooldownTime),
    soundVolume: field('soundVolume', existing.soundVolume),
    upgradesEnabled: up.upgradesEnabled,
    variantWeights: up.variantWeights,
    upgradeCosts: up.upgradeCosts,
    disabledVariants: up.disabledVariants ?? existing.disabledVariants,
    price: existing.price, // this form has no price field; the pack workspace owns it
  });
  if (!clean.name) redirect(`/admin/packs/${packId}?tab=settings&error=${encodeURIComponent('Give the pack a name.')}`);
  await savePack({ ...existing, ...clean });
  revalidatePath(`/admin/packs/${packId}`);
  revalidatePath('/admin/packs');
}

// One-click Live / Inactive switch (the pack list and the pack page). Drafts can't be switched: they're never drawn.
export async function setPackActive(packId: string, active: boolean) {
  await requireAdmin();
  const existing = await getPack(packId);
  if (!existing || existing.status === 'draft' || existing.archived) return;
  await savePack({ ...existing, active });
  revalidatePath('/admin/packs');
  revalidatePath(`/admin/packs/${packId}`);
}

export async function deletePackAction(packId: string) {
  await requireAdmin();
  await deletePack(packId);
  revalidatePath('/admin/packs');
  redirect('/admin/packs');
}

// ── Quick variant / upgrade switches (the pack page) ──────

/** Switches one variant on or off for a whole pack. Off = never rolled, and upgrades skip it. */
export async function setPackVariant(packId: string, variant: OptionalVariant, enabled: boolean) {
  await requireAdmin();
  if (!OPTIONAL.includes(variant)) return;
  const pack = await getPack(packId);
  if (!pack) return;
  await savePack({ ...pack, disabledVariants: enabled ? withoutVariant(pack.disabledVariants, variant) : withVariant(pack.disabledVariants, variant) });
  revalidatePath(`/admin/packs/${packId}`);
  revalidatePath('/admin/packs');
}
