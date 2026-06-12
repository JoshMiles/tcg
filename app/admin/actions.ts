'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  saveSeason, getSeason, deleteSeason, listSeasons, listSeasonIds,
  savePack, getPack, deletePack, listAllPackIds,
  getPackCards, savePackCards,
  getCollection, saveCollection, deleteCollection,
  getUserProfile, saveUserProfile,
} from '@/lib/kv';
import type { Season, Pack, Card, UserProfile } from '@/lib/types';
import { SEED_SEASON, SEED_PACK, SEED_CARDS } from '@/lib/seed';

// ── Seasons ───────────────────────────────────────────────

export async function createSeason(formData: FormData) {
  const id = crypto.randomUUID();
  const willBeActive = formData.get('active') === 'true';

  if (willBeActive) {
    const all = await listSeasons();
    await Promise.all(all.map(s => saveSeason({ ...s, active: false })));
  }

  await saveSeason({
    id,
    name: formData.get('name') as string,
    collectionName: (formData.get('collectionName') as string).replace(/\s+/g, ''),
    active: willBeActive,
    createdAt: Date.now(),
    maxConcurrentPacks: Number(formData.get('maxConcurrentPacks')) || 1,
    packIds: [],
  });

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

  revalidatePath(`/admin/seasons/${id}`);
  revalidatePath('/admin/seasons');
  revalidatePath('/admin');
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

// ── Season ↔ Pack assignment ──────────────────────────────

export async function addPackToSeason(seasonId: string, formData: FormData) {
  const packId = formData.get('packId') as string;
  if (!packId) return;
  const season = await getSeason(seasonId);
  if (!season || season.packIds.includes(packId)) return;
  await saveSeason({ ...season, packIds: [...season.packIds, packId] });
  revalidatePath(`/admin/seasons/${seasonId}`);
}

export async function removePackFromSeason(seasonId: string, packId: string) {
  const season = await getSeason(seasonId);
  if (!season) return;
  await saveSeason({ ...season, packIds: season.packIds.filter(id => id !== packId) });
  revalidatePath(`/admin/seasons/${seasonId}`);
}

// ── Packs (global) ────────────────────────────────────────

export async function createPack(formData: FormData) {
  const id = crypto.randomUUID();
  await savePack({
    id,
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
  });
  redirect(`/admin/packs/${id}`);
}

export async function updatePack(packId: string, formData: FormData) {
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
  revalidatePath(`/admin/packs/${packId}`);
  revalidatePath('/admin/packs');
}

export async function deletePackAction(packId: string) {
  await deletePack(packId);
  revalidatePath('/admin/packs');
  redirect('/admin/packs');
}

// ── Cards ─────────────────────────────────────────────────

export async function addCard(packId: string, formData: FormData) {
  const cards = await getPackCards(packId);
  const maxNum = cards.reduce((m, c) => Math.max(m, c.number), 0);
  const soundUrl = (formData.get('soundUrl') as string) || undefined;
  await savePackCards(packId, [
    ...cards,
    {
      id: crypto.randomUUID(),
      number: maxNum + 1,
      name: formData.get('name') as string,
      imageUrl: (formData.get('imageUrl') as string) || '',
      ...(soundUrl && { soundUrl }),
      probability: Number(formData.get('probability')),
      stars: Number(formData.get('stars')),
    },
  ]);
  revalidatePath(`/admin/packs/${packId}`);
}

export async function updateCard(packId: string, cardId: string, formData: FormData) {
  const cards = await getPackCards(packId);
  const soundUrl = (formData.get('soundUrl') as string) || undefined;
  await savePackCards(
    packId,
    cards.map(c =>
      c.id === cardId
        ? {
            ...c,
            name: formData.get('name') as string,
            imageUrl: (formData.get('imageUrl') as string) || c.imageUrl,
            soundUrl,
            probability: Number(formData.get('probability')),
            stars: Number(formData.get('stars')),
            number: Number(formData.get('number')),
          }
        : c
    )
  );
  revalidatePath(`/admin/packs/${packId}`);
  redirect(`/admin/packs/${packId}`);
}

export async function deleteCard(packId: string, cardId: string) {
  const cards = await getPackCards(packId);
  await savePackCards(packId, cards.filter(c => c.id !== cardId));
  revalidatePath(`/admin/packs/${packId}`);
}

// ── Users ─────────────────────────────────────────────────

export async function updateUserProfile(username: string, formData: FormData) {
  const existing = await getUserProfile(username);
  const profile: UserProfile = {
    username: username.toLowerCase(),
    displayName: ((formData.get('displayName') as string) ?? '').trim() || username,
    twitchId: ((formData.get('twitchId') as string) || '').trim() || existing?.twitchId,
    notes: ((formData.get('notes') as string) || '').trim(),
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await saveUserProfile(profile);
  revalidatePath('/admin/users');
}

// Reset a user across ALL seasons
export async function resetUser(username: string) {
  const seasons = await listSeasons();
  await Promise.all(
    seasons.map(async season => {
      const data = await getCollection(season.collectionName);
      const lower = username.toLowerCase();
      if (lower in data) {
        delete data[lower];
        await saveCollection(season.collectionName, data);
      }
    })
  );
  revalidatePath('/admin/users');
}

// Reset all users across ALL seasons
export async function resetAllUsers() {
  const seasons = await listSeasons();
  await Promise.all(seasons.map(s => deleteCollection(s.collectionName)));
  revalidatePath('/admin/users');
}


// ── Seed ──────────────────────────────────────────────────

export async function seedSeason1() {
  const ids = await listSeasonIds();
  const packIds = await listAllPackIds();

  if (!packIds.includes('pack1')) {
    await savePack(SEED_PACK);
    await savePackCards('pack1', SEED_CARDS);
  }

  if (!ids.includes('season1')) {
    await saveSeason(SEED_SEASON);
  } else {
    // ensure pack1 is assigned to the existing season1
    const existing = await getSeason('season1');
    if (existing && !existing.packIds.includes('pack1')) {
      await saveSeason({ ...existing, packIds: [...existing.packIds, 'pack1'] });
    }
  }

  revalidatePath('/admin');
  revalidatePath('/admin/packs');
  revalidatePath('/admin/seasons');
}

