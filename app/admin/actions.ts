'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  saveSeason, deleteSeason, listSeasons,
  getSeasonCards, saveSeasonCards,
  getCollection, saveCollection,
} from '@/lib/kv';
import type { Season, Card } from '@/lib/types';

// ── Seasons ───────────────────────────────────────────────

export async function createSeason(formData: FormData) {
  const id = crypto.randomUUID();
  const season: Season = {
    id,
    name: formData.get('name') as string,
    collectionName: (formData.get('collectionName') as string).replace(/\s+/g, ''),
    coverImageUrl: (formData.get('coverImageUrl') as string) || '',
    active: formData.get('active') === 'true',
    createdAt: Date.now(),
    accentColor: (formData.get('accentColor') as string) || 'rgb(241,187,6)',
    tearBorderColor: (formData.get('tearBorderColor') as string) || 'rgb(218,163,18)',
    holoMinStars: Number(formData.get('holoMinStars')) || 5,
    cardTime: Number(formData.get('cardTime')) || 3,
    cooldownTime: Number(formData.get('cooldownTime')) || 1,
  };

  if (season.active) {
    // deactivate all others
    const all = await listSeasons();
    await Promise.all(all.map(s => saveSeason({ ...s, active: false })));
  }

  await saveSeason(season);
  redirect(`/admin/seasons/${id}`);
}

export async function updateSeason(id: string, formData: FormData) {
  const existing = await import('@/lib/kv').then(m => m.getSeason(id));
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
    coverImageUrl: (formData.get('coverImageUrl') as string) || existing.coverImageUrl,
    active: willBeActive,
    accentColor: formData.get('accentColor') as string,
    tearBorderColor: formData.get('tearBorderColor') as string,
    holoMinStars: Number(formData.get('holoMinStars')),
    cardTime: Number(formData.get('cardTime')),
    cooldownTime: Number(formData.get('cooldownTime')),
  });
  revalidatePath('/admin/seasons');
  revalidatePath(`/admin/seasons/${id}`);
}

export async function deleteSeasonAction(id: string) {
  await deleteSeason(id);
  revalidatePath('/admin/seasons');
  redirect('/admin/seasons');
}

// ── Cards ─────────────────────────────────────────────────

export async function addCard(seasonId: string, formData: FormData) {
  const cards = await getSeasonCards(seasonId);
  const maxNum = cards.reduce((m, c) => Math.max(m, c.number), 0);
  const card: Card = {
    id: crypto.randomUUID(),
    number: maxNum + 1,
    name: formData.get('name') as string,
    imageUrl: (formData.get('imageUrl') as string) || '',
    probability: Number(formData.get('probability')),
    stars: Number(formData.get('stars')),
  };
  await saveSeasonCards(seasonId, [...cards, card]);
  revalidatePath(`/admin/seasons/${seasonId}`);
}

export async function updateCard(seasonId: string, cardId: string, formData: FormData) {
  const cards = await getSeasonCards(seasonId);
  await saveSeasonCards(
    seasonId,
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
  revalidatePath(`/admin/seasons/${seasonId}`);
  redirect(`/admin/seasons/${seasonId}`);
}

export async function deleteCard(seasonId: string, cardId: string) {
  const cards = await getSeasonCards(seasonId);
  await saveSeasonCards(seasonId, cards.filter(c => c.id !== cardId));
  revalidatePath(`/admin/seasons/${seasonId}`);
}

// ── Seed ──────────────────────────────────────────────────

export async function seedSeason1() {
  const { listSeasonIds, saveSeason, saveSeasonCards } = await import('@/lib/kv');
  const { SEED_SEASON, SEED_CARDS } = await import('@/lib/seed');
  const ids = await listSeasonIds();
  if (ids.includes('season1')) return;
  await saveSeason(SEED_SEASON);
  await saveSeasonCards('season1', SEED_CARDS);
  revalidatePath('/admin');
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
