'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  saveSeason, getSeason, deleteSeason, listSeasons,
  savePack, getPack, deletePack, listPacks,
  getPackCards, savePackCards,
  getCollection, saveCollection,
  listSeasonIds,
} from '@/lib/kv';
import type { Season, Pack, Card } from '@/lib/types';
import { SEED_SEASON, SEED_PACK, SEED_CARDS } from '@/lib/seed';

// ── Seasons ───────────────────────────────────────────────

export async function createSeason(formData: FormData) {
  const id = crypto.randomUUID();
  const willBeActive = formData.get('active') === 'true';

  if (willBeActive) {
    const all = await listSeasons();
    await Promise.all(all.map(s => saveSeason({ ...s, active: false })));
  }

  const season: Season = {
    id,
    name: formData.get('name') as string,
    collectionName: (formData.get('collectionName') as string).replace(/\s+/g, ''),
    active: willBeActive,
    createdAt: Date.now(),
    maxConcurrentPacks: Number(formData.get('maxConcurrentPacks')) || 1,
  };

  await saveSeason(season);
  redirect(`/admin/seasons/${id}`);
}

export async function updateSeason(id: string, formData: FormData) {
  const existing = await getSeason(id);
  if (!existing) return;

  const willBeActive = formData.get('active') === 'true';
  if (willBeActive && !existing.active) {
    const all = await listSeasons();
    await Promise.all(all.map(s => saveSeason({ ...s, active: false })));
  }

  await saveSeason({
    ...existing,
    name: formData.get('name') as string,
    collectionName: (formData.get('collectionName') as string).replace(/\s+/g, ''),
    active: willBeActive,
    maxConcurrentPacks: Number(formData.get('maxConcurrentPacks')) || 1,
  });
  revalidatePath('/admin/seasons');
  revalidatePath(`/admin/seasons/${id}`);
}

export async function activateSeason(id: string) {
  const all = await listSeasons();
  await Promise.all(all.map(s => saveSeason({ ...s, active: s.id === id })));
  revalidatePath('/admin/seasons');
  revalidatePath('/admin');
}

export async function deleteSeasonAction(id: string) {
  await deleteSeason(id);
  revalidatePath('/admin/seasons');
  redirect('/admin/seasons');
}

// ── Packs ─────────────────────────────────────────────────

export async function createPack(seasonId: string, formData: FormData) {
  const id = crypto.randomUUID();
  const pack: Pack = {
    id,
    seasonId,
    name: formData.get('name') as string,
    coverImageUrl: (formData.get('coverImageUrl') as string) || '',
    active: formData.get('active') === 'true',
    weight: Number(formData.get('weight')) || 1,
    accentColor: (formData.get('accentColor') as string) || 'rgb(241,187,6)',
    tearBorderColor: (formData.get('tearBorderColor') as string) || 'rgb(218,163,18)',
    holoMinStars: Number(formData.get('holoMinStars')) || 5,
    cardTime: Number(formData.get('cardTime')) || 3,
    cooldownTime: Number(formData.get('cooldownTime')) || 1,
    soundVolume: Number(formData.get('soundVolume')) || 1.0,
    createdAt: Date.now(),
  };
  await savePack(pack);
  redirect(`/admin/seasons/${seasonId}/packs/${id}`);
}

export async function updatePack(seasonId: string, packId: string, formData: FormData) {
  const existing = await getPack(packId);
  if (!existing) return;

  await savePack({
    ...existing,
    name: formData.get('name') as string,
    coverImageUrl: (formData.get('coverImageUrl') as string) || existing.coverImageUrl,
    active: formData.get('active') === 'true',
    weight: Number(formData.get('weight')) || 1,
    accentColor: formData.get('accentColor') as string,
    tearBorderColor: formData.get('tearBorderColor') as string,
    holoMinStars: Number(formData.get('holoMinStars')),
    cardTime: Number(formData.get('cardTime')),
    cooldownTime: Number(formData.get('cooldownTime')),
    soundVolume: Number(formData.get('soundVolume')) || 1.0,
  });
  revalidatePath(`/admin/seasons/${seasonId}`);
  revalidatePath(`/admin/seasons/${seasonId}/packs/${packId}`);
}

export async function deletePackAction(seasonId: string, packId: string) {
  await deletePack(packId);
  revalidatePath(`/admin/seasons/${seasonId}`);
  redirect(`/admin/seasons/${seasonId}`);
}

// ── Cards ─────────────────────────────────────────────────

export async function addCard(seasonId: string, packId: string, formData: FormData) {
  const cards = await getPackCards(packId);
  const maxNum = cards.reduce((m, c) => Math.max(m, c.number), 0);
  const card: Card = {
    id: crypto.randomUUID(),
    number: maxNum + 1,
    name: formData.get('name') as string,
    imageUrl: (formData.get('imageUrl') as string) || '',
    probability: Number(formData.get('probability')),
    stars: Number(formData.get('stars')),
  };
  await savePackCards(packId, [...cards, card]);
  revalidatePath(`/admin/seasons/${seasonId}/packs/${packId}`);
}

export async function updateCard(seasonId: string, packId: string, cardId: string, formData: FormData) {
  const cards = await getPackCards(packId);
  await savePackCards(
    packId,
    cards.map(c =>
      c.id === cardId
        ? {
            ...c,
            name: formData.get('name') as string,
            imageUrl: (formData.get('imageUrl') as string) || c.imageUrl,
            probability: Number(formData.get('probability')),
            stars: Number(formData.get('stars')),
            number: Number(formData.get('number')),
          }
        : c,
    ),
  );
  revalidatePath(`/admin/seasons/${seasonId}/packs/${packId}`);
  redirect(`/admin/seasons/${seasonId}/packs/${packId}`);
}

export async function deleteCard(seasonId: string, packId: string, cardId: string) {
  const cards = await getPackCards(packId);
  await savePackCards(packId, cards.filter(c => c.id !== cardId));
  revalidatePath(`/admin/seasons/${seasonId}/packs/${packId}`);
}

// ── Users ─────────────────────────────────────────────────

export async function resetUser(collectionName: string, username: string) {
  const data = await getCollection(collectionName);
  delete data[username.toLowerCase()];
  await saveCollection(collectionName, data);
  revalidatePath('/admin/users');
}

export async function resetAllUsers(collectionName: string) {
  await import('@/lib/kv').then(m => m.deleteCollection(collectionName));
  revalidatePath('/admin/users');
}

// ── Seed ──────────────────────────────────────────────────

export async function seedSeason1() {
  const ids = await listSeasonIds();
  if (!ids.includes('season1')) {
    await saveSeason(SEED_SEASON);
  }
  const existingPack = await getPack('pack1');
  if (!existingPack) {
    await savePack(SEED_PACK);
    await savePackCards('pack1', SEED_CARDS);
  }
  revalidatePath('/admin');
}
