'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import {
  saveSeason, getSeason, deleteSeason, listSeasons, setActiveSeason,
  savePack, getPack, deletePack,
  getPackCards, savePackCards,
  getCollection, saveCollection, deleteCollection, removeUserFromCollection,
  getUserProfile, saveUserProfile, deleteUserProfile,
  seedSeason1 as seedSeason1Data, getActiveSeasonWithPacks, ensureUserProfile,
} from '@/lib/kv';
import type { UserProfile } from '@/lib/types';
import { recordActivity } from '@/lib/activity';
import { deleteUnusedBlobs } from '@/lib/assets';
import { getOverlayStatus } from '@/lib/overlay';
import { getActivity } from '@/lib/activity';
import {
  saveDiscordSettings, isValidDiscordWebhookUrl, postToDiscord, buildMessage, buildTestMessage,
  type DiscordSettings,
} from '@/lib/discord';
import type { ActionResult } from './action-types';
import { getWebhookSettings, saveWebhookSettings, enqueueEvent, clearQueue } from '@/lib/webhooks';
import { getOverlaySettings, saveOverlaySettings } from '@/lib/overlay-settings';
import { sanitizeLayout } from '@/lib/overlay-layout';

// ── Seasons ───────────────────────────────────────────────

export async function createSeason(formData: FormData) {
  const id = crypto.randomUUID();
  const willBeActive = formData.get('active') === 'true';

  if (willBeActive) await setActiveSeason();

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
  if (willBeActive && !existing.active) await setActiveSeason();

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
  await setActiveSeason(id);
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
  revalidatePath(`/admin/users/${username.toLowerCase()}`);
  revalidatePath('/admin/users');
}

// Remove one instance of a card from a user's collection
export async function removeUserCard(username: string, collectionName: string, cardNumber: number) {
  const lower = username.toLowerCase();
  const data = await getCollection(collectionName);
  if (data[lower]) {
    const idx = data[lower].indexOf(cardNumber);
    if (idx !== -1) {
      data[lower] = [...data[lower].slice(0, idx), ...data[lower].slice(idx + 1)];
    }
    if (data[lower].length === 0) delete data[lower];
    await saveCollection(collectionName, data);
    await recordActivity({ type: 'remove', username: lower, cardNumber, collectionName });
  }
  revalidatePath(`/admin/users/${lower}`);
  revalidatePath('/admin/users');
}

// Add a card to a user's collection in a specific season
export async function grantUserCard(username: string, collectionName: string, formData: FormData) {
  const cardNumber = parseInt(formData.get('cardNumber') as string, 10);
  if (!cardNumber || cardNumber < 1) return;
  const lower = username.toLowerCase();
  const data = await getCollection(collectionName);
  data[lower] = [...(data[lower] ?? []), cardNumber];
  await saveCollection(collectionName, data);
  await recordActivity({ type: 'grant', source: 'admin', username: lower, cardNumber, collectionName });
  revalidatePath(`/admin/users/${lower}`);
  revalidatePath('/admin/users');
}

// Remove a user from a single season's collection
export async function resetUserSeason(username: string, collectionName: string) {
  const lower = username.toLowerCase();
  if (await removeUserFromCollection(collectionName, lower)) {
    await recordActivity({ type: 'reset', scope: 'season', username: lower, collectionName });
  }
  revalidatePath(`/admin/users/${lower}`);
  revalidatePath('/admin/users');
}

// Fully delete a user — removes all cards and their profile, then redirects
export async function deleteUser(username: string) {
  const lower = username.toLowerCase();
  const seasons = await listSeasons();
  await Promise.all([
    ...seasons.map(s => removeUserFromCollection(s.collectionName, lower)),
    deleteUserProfile(lower),
  ]);
  await recordActivity({ type: 'delete', username: lower });
  revalidatePath('/admin/users');
  redirect('/admin/users');
}

// Reset a user across ALL seasons
export async function resetUser(username: string) {
  const seasons = await listSeasons();
  await Promise.all(seasons.map(s => removeUserFromCollection(s.collectionName, username)));
  await recordActivity({ type: 'reset', scope: 'all', username });
  revalidatePath(`/admin/users/${username.toLowerCase()}`);
  revalidatePath('/admin/users');
}

// Reset all users across ALL seasons
export async function resetAllUsers() {
  const seasons = await listSeasons();
  await Promise.all(seasons.map(s => deleteCollection(s.collectionName)));
  await recordActivity({ type: 'reset', scope: 'everyone', username: '' });
  revalidatePath('/admin/users');
}

// ── Seed ──────────────────────────────────────────────────

export async function seedSeason1() {
  await seedSeason1Data();
  revalidatePath('/admin');
  revalidatePath('/admin/packs');
  revalidatePath('/admin/seasons');
}

// ── Webhooks ──────────────────────────────────────────────

export async function saveOutgoingWebhook(
  event: 'cardPulled' | 'collectionShown',
  formData: FormData,
) {
  const settings = await getWebhookSettings();
  settings.outgoing[event] = {
    url:     (formData.get('url') as string) || '',
    enabled: formData.get('enabled') === 'true',
    fields:  JSON.parse((formData.get('fieldsJson') as string) || '[]'),
  };
  await saveWebhookSettings(settings);
  revalidatePath('/admin/webhooks');
}

export async function regenerateWebhookSecret() {
  const settings = await getWebhookSettings();
  settings.incomingSecret = randomBytes(16).toString('hex');
  await saveWebhookSettings(settings);
  revalidatePath('/admin/webhooks');
}

// ── Overlay settings ──────────────────────────────────────

export async function saveOverlaySettingsAction(formData: FormData) {
  const current = await getOverlaySettings();
  await saveOverlaySettings({
    ...current,
    livePacksOnly:       formData.get('livePacksOnly') === 'on',
    liveCollectionsOnly: formData.get('liveCollectionsOnly') === 'on',
  });
  revalidatePath('/admin/settings');
}

export async function saveOverlayLayoutAction(formData: FormData) {
  const current = await getOverlaySettings();
  await saveOverlaySettings({
    ...current,
    layout: sanitizeLayout({
      width:   formData.get('width'),
      height:  formData.get('height'),
      scale:   formData.get('scale'),
      offsetX: formData.get('offsetX'),
      offsetY: formData.get('offsetY'),
    }),
  });
  revalidatePath('/admin/settings');
}

// ── Assets ────────────────────────────────────────────────

// Deletes Blob files that nothing references (urls come from the form, but are re-verified server-side).
export async function deleteUnusedAssets(formData: FormData) {
  const urls = formData.getAll('url').map(String);
  await deleteUnusedBlobs(urls);
  revalidatePath('/admin/assets');
}

// ── Dashboard quick actions ───────────────────────────────
// Each returns a result message for the UI (via useActionState) instead of redirecting.

function cleanUsername(raw: FormDataEntryValue | null): string | null {
  const u = String(raw ?? '').trim().replace(/^@/, '').toLowerCase();
  return /^[a-z0-9_]{1,25}$/.test(u) ? u : null;
}

const BAD_USERNAME: ActionResult = { ok: false, message: 'Enter a valid Twitch username (letters, numbers and underscores).' };

// Queue overlay events (the overlay polls the queue every 2s and plays them on stream).
async function queueForOverlay(kind: 'pull' | 'collection', formData: FormData, count: number): Promise<ActionResult> {
  const username = cleanUsername(formData.get('username'));
  if (!username) return BAD_USERNAME;

  const status = await getOverlayStatus();
  const force = formData.get('force') === 'on';
  if (status.connected === 0 && !force) {
    return {
      ok: false,
      needsForce: true,
      message: 'No overlay is connected, so nothing would play on stream. Open the overlay in OBS first, or queue it anyway to play when one connects.',
    };
  }

  for (let i = 0; i < count; i++) {
    await enqueueEvent({ id: crypto.randomUUID(), type: kind, username, queuedAt: Date.now() });
  }
  await recordActivity({ type: 'trigger', kind, username, source: 'admin', count });
  revalidatePath('/admin');
  revalidatePath('/admin/activity');

  const waiting = status.connected === 0 ? ' It will play when an overlay connects.' : '';
  return kind === 'pull'
    ? { ok: true, message: `Queued ${count} pack${count !== 1 ? 's' : ''} for ${username}.${waiting}` }
    : { ok: true, message: `Showing ${username}'s collection on stream.${waiting}` };
}

async function giftPack(formData: FormData): Promise<ActionResult> {
  const count = Math.min(10, Math.max(1, parseInt(String(formData.get('count') ?? '1'), 10) || 1));
  return queueForOverlay('pull', formData, count);
}

async function showCollection(formData: FormData): Promise<ActionResult> {
  return queueForOverlay('collection', formData, 1);
}

// One form, several submit buttons: the clicked button's name="intent" value picks the action.
export async function quickAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  switch (formData.get('intent')) {
    case 'gift': return giftPack(formData);
    case 'show': return showCollection(formData);
    case 'grant': return grantCard(formData);
    default: return { ok: false, message: 'Unknown action.' };
  }
}

async function grantCard(formData: FormData): Promise<ActionResult> {
  const username = cleanUsername(formData.get('username'));
  if (!username) return BAD_USERNAME;

  const cardNumber = parseInt(String(formData.get('cardNumber') ?? ''), 10);
  const active = await getActiveSeasonWithPacks();
  if (!active) return { ok: false, message: 'There is no active season to grant a card in.' };
  const card = active.packs.flatMap(p => p.cards).find(c => c.number === cardNumber);
  if (!card) return { ok: false, message: 'Pick a card from the list.' };

  const collectionName = active.season.collectionName;
  const data = await getCollection(collectionName);
  data[username] = [...(data[username] ?? []), card.number];
  await saveCollection(collectionName, data);
  await ensureUserProfile(username);
  await recordActivity({ type: 'grant', source: 'admin', username, cardNumber: card.number, collectionName });
  revalidatePath('/admin');
  revalidatePath('/admin/users');
  return { ok: true, message: `Granted ${card.name} (#${card.number}) to ${username}.` };
}

export async function clearQueueAction(): Promise<ActionResult> {
  const n = await clearQueue();
  revalidatePath('/admin');
  return { ok: true, message: n > 0 ? `Cleared ${n} waiting event${n !== 1 ? 's' : ''}.` : 'The queue was already empty.' };
}

// ── Discord activity feed ─────────────────────────────────
// One form, three submit buttons (intent = save | test | last). Test and "last" use the URL currently
// in the form, so a webhook can be verified before it is saved.

const NOT_A_WEBHOOK = 'That doesn’t look like a Discord webhook URL. It should start with https://discord.com/api/webhooks/…';

export async function discordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const on = (name: string) => formData.get(name) === 'on';
  const url = String(formData.get('url') ?? '').trim();
  const intent = String(formData.get('intent') ?? 'save');

  if (intent === 'save') {
    const settings: DiscordSettings = {
      url,
      enabled: on('enabled'),
      categories: { pulls: on('cat_pulls'), cards: on('cat_cards'), stream: on('cat_stream'), resets: on('cat_resets') },
      minStars: Math.min(5, Math.max(1, parseInt(String(formData.get('minStars') ?? '1'), 10) || 1)),
      newOnly: on('newOnly'),
    };
    if (url && !isValidDiscordWebhookUrl(url)) return { ok: false, message: NOT_A_WEBHOOK };
    if (settings.enabled && !url) return { ok: false, message: 'Add a webhook URL before turning it on.' };
    await saveDiscordSettings(settings);
    revalidatePath('/admin/webhooks');
    return { ok: true, message: settings.enabled ? 'Saved. Activity will be posted to Discord.' : 'Saved. Posting to Discord is off.' };
  }

  if (!url) return { ok: false, message: 'Paste a webhook URL first.' };
  if (!isValidDiscordWebhookUrl(url)) return { ok: false, message: NOT_A_WEBHOOK };

  let result;
  if (intent === 'test') {
    result = await postToDiscord(url, buildTestMessage());
  } else {
    const { events } = await getActivity({ limit: 1 });
    if (!events[0]) return { ok: false, message: 'There is no activity to send yet.' };
    result = await postToDiscord(url, await buildMessage(events[0], { footer: 'Resent from admin' }));
  }

  if (!result.ok) {
    return { ok: false, message: `Discord didn’t accept it: ${result.error}${result.status ? ` (HTTP ${result.status})` : ''}` };
  }
  return { ok: true, message: intent === 'test' ? 'Test message sent. Check your Discord channel.' : 'Sent the most recent activity to Discord.' };
}
