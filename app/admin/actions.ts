'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import { requireAdmin } from '@/lib/admin-guard';
import { recordAudit } from '@/lib/audit';
import { takeUserSnapshot } from '@/lib/user-admin';
import { activateWithWrapUp } from '@/lib/season-wrap';
import { validateSeason } from '@/lib/draft-validation';
import { cardProblems, cleanPackInput } from '@/lib/pack-clean';
import { heldCardNumbers } from '@/lib/card-held';
import { checkWebhookUrl, cleanWebhookFields } from '@/lib/webhook-clean';
import {
  saveSeason, getSeason, deleteSeason, listSeasons, setActiveSeason,
  savePack, getPack, deletePack, listAllPackIds,
  getPackCards, savePackCards,
  getCollection, saveCollection, deleteCollection, removeUserFromCollection, addCollectionEntryWithSerial, withCollectionLock,
  getUserProfile, saveUserProfile, deleteUserProfile,
  seedSeason1 as seedSeason1Data, getActiveSeasonWithPacks, ensureUserProfile,
} from '@/lib/kv';
import type { OptionalVariant, UserProfile, Variant } from '@/lib/types';
import {
  VARIANTS, VARIANT_LABELS, DEFAULT_VARIANT_WEIGHTS, DEFAULT_UPGRADE_COSTS, encodeEntry, decodeEntry,
} from '@/lib/variants';
import { recordActivity } from '@/lib/activity';
import { deleteUnusedBlobs } from '@/lib/assets';
import { getOverlayStatus } from '@/lib/overlay';
import { getActivity } from '@/lib/activity';
import {
  saveDiscordSettings, cleanDiscordInput, notifyAdminLog, deliver, buildMessage, buildTestMessage, buildRecapMessage, buildDigestMessage,
} from '@/lib/discord';
import { currentStaffLogin } from '@/lib/staff-actor';
import { getLatestRecap } from '@/lib/twitch-live';
import { sampleRecap } from '@/lib/stream-recap';
import { sampleDigest } from '@/lib/weekly-digest';
import type { ActionResult } from './action-types';
import { getWebhookSettings, saveWebhookSettings, enqueueEvent, clearQueue } from '@/lib/webhooks';
import { getOverlaySettings, saveOverlaySettings, savePackOverrides, savePreset, deletePreset, bumpReloadToken, updateScene } from '@/lib/overlay-settings';
import { listVersions, recordVersion } from '@/lib/overlay-versions';
import { sanitizePropValues } from '@/lib/overlay-props';
import { sanitizeLayout, sceneLayout, type OverlayLayout } from '@/lib/overlay-layout';
import { DEFAULT_SCORING, sanitizeScoring, saveScoringSettings, resetScoringSettings } from '@/lib/scoring';

// ── Seasons ───────────────────────────────────────────────

/** A finite positive number from a form field (a date as milliseconds), or undefined. */
const num = (v: FormDataEntryValue | null): number | undefined => {
  const n = Number(v);
  return v !== null && String(v).trim() !== '' && Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
};

export async function updateSeason(id: string, formData: FormData) {
  await requireAdmin();
  const existing = await getSeason(id);
  if (!existing) return;

  const wantsActive = formData.get('active') === 'true' && existing.status === 'published';
  // Switching a different season on goes through activateWithWrapUp (below) so the one it replaces gets its final standings.
  const willBeActive = wantsActive && existing.active;

  // The same checks the wizard makes, again on the server (a form can be posted without the browser's own checks): a name, a
  // collection name with no spaces that no other season uses (a clash would merge two seasons' viewer collections), a sane end date.
  const name = String(formData.get('name') ?? '').trim();
  const collectionName = String(formData.get('collectionName') ?? '').replace(/\s+/g, '');
  const startsAt = num(formData.get('startsAt'));
  const endsAt = num(formData.get('endsAt'));
  const others = (await listSeasons()).filter(x => x.id !== id).map(x => x.collectionName);
  const problems = validateSeason({ name, collectionName, packIds: existing.packIds, startsAt, endsAt }, others).filter(i => i.step !== 'packs');
  if (problems.length > 0) redirect(`/admin/seasons/${id}?tab=settings&error=${encodeURIComponent(problems.map(p => p.message).join(' '))}`);
  const maxConcurrentPacks = Math.max(1, Math.floor(Number(formData.get('maxConcurrentPacks'))) || 1);

  await saveSeason({
    ...existing,
    name,
    collectionName,
    active: willBeActive,
    maxConcurrentPacks,
    startsAt,
    endsAt,
    autoStart: formData.get('autoStart') === 'true' && startsAt !== undefined ? true : undefined,
  });
  if (wantsActive && !existing.active) await activateWithWrapUp(id);

  revalidatePath(`/admin/seasons/${id}`);
  revalidatePath('/admin/seasons');
  revalidatePath('/admin');
}

export async function activateSeason(id: string) {
  // Wraps up the season it replaces (final standings snapshot, ended, trading frozen) before switching.
  await requireAdmin();
  await activateWithWrapUp(id);
  await notifyAdminLog({ action: 'Season activated', subject: (await getSeason(id))?.name ?? id, detail: 'The season it replaced was wrapped up', by: await currentStaffLogin() });
  revalidatePath('/admin/seasons');
  revalidatePath(`/admin/seasons/${id}`);
  revalidatePath('/admin');
}

export async function deleteSeasonAction(id: string) {
  await requireAdmin();
  await deleteSeason(id);
  revalidatePath('/admin/seasons');
  redirect('/admin/seasons');
}

// ── Season ↔ Pack assignment ──────────────────────────────

export async function addPackToSeason(seasonId: string, formData: FormData) {
  await requireAdmin();
  const packId = formData.get('packId') as string;
  if (!packId) return;
  const season = await getSeason(seasonId);
  if (!season || season.packIds.includes(packId)) return;
  await saveSeason({ ...season, packIds: [...season.packIds, packId] });
  revalidatePath(`/admin/seasons/${seasonId}`);
}

export async function removePackFromSeason(seasonId: string, packId: string) {
  await requireAdmin();
  const season = await getSeason(seasonId);
  if (!season) return;
  await saveSeason({ ...season, packIds: season.packIds.filter(id => id !== packId) });
  revalidatePath(`/admin/seasons/${seasonId}`);
}

// ── Upgrade/variant form parsing ──────────────────────────

function parseVariant(raw: FormDataEntryValue | null): Variant {
  const v = String(raw ?? 'regular');
  return (VARIANTS as readonly string[]).includes(v) ? (v as Variant) : 'regular';
}

function positiveInt(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

function nonNegative(raw: FormDataEntryValue | null, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const OPTIONAL: OptionalVariant[] = ['reverse', 'full', 'shiny'];

// A form that carries the variant switches (marker `variant_switches`) lists the ones that are ticked; a form without them
// leaves whatever is stored alone, so no other form can switch variants off by accident.
function disabledFromForm(formData: FormData, fallback: OptionalVariant[] = []): OptionalVariant[] {
  if (formData.get('variant_switches') !== '1') return fallback;
  return OPTIONAL.filter(v => formData.get(`variant_on_${v}`) !== 'on');
}

function upgradeSettings(formData: FormData) {
  return {
    upgradesEnabled: formData.get('upgradesEnabled') === 'on',
    ...(formData.get('variant_switches') === '1' && { disabledVariants: disabledFromForm(formData) }),
    variantWeights: {
      regular: nonNegative(formData.get('weight_regular'), DEFAULT_VARIANT_WEIGHTS.regular),
      reverse: nonNegative(formData.get('weight_reverse'), DEFAULT_VARIANT_WEIGHTS.reverse),
      full:    nonNegative(formData.get('weight_full'),    DEFAULT_VARIANT_WEIGHTS.full),
      shiny:   nonNegative(formData.get('weight_shiny'),   DEFAULT_VARIANT_WEIGHTS.shiny),
    },
    upgradeCosts: {
      reverse: positiveInt(formData.get('cost_reverse'), DEFAULT_UPGRADE_COSTS.reverse),
      full:    positiveInt(formData.get('cost_full'),    DEFAULT_UPGRADE_COSTS.full),
      shiny:   positiveInt(formData.get('cost_shiny'),   DEFAULT_UPGRADE_COSTS.shiny),
    },
  };
}

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

// ── Cards ─────────────────────────────────────────────────

/** Reads a card form into clean fields, or says what is wrong. `otherNumbers` are the pack's other cards' numbers. */
function cardFromForm(formData: FormData, otherNumbers: number[], fallbackNumber: number, useFormNumber = true) {
  const numberRaw = useFormNumber ? formData.get('number') : null;
  const fields = {
    name: String(formData.get('name') ?? '').trim().slice(0, 80),
    stars: Number(formData.get('stars')),
    probability: Number(formData.get('probability')),
    number: numberRaw === null || String(numberRaw).trim() === '' ? fallbackNumber : Number(numberRaw),
  };
  return { fields, problems: cardProblems(fields, otherNumbers) };
}

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
  await savePackCards(
    packId,
    cards.map(c =>
      c.id === cardId
        ? {
            ...c,
            name: fields.name,
            imageUrl: (formData.get('imageUrl') as string) || c.imageUrl,
            soundUrl,
            fullArtImageUrl: (formData.get('fullArtImageUrl') as string) || undefined,
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

// ── Quick variant / upgrade switches (the pack page) ──────

const withoutVariant = (list: OptionalVariant[] | undefined, v: OptionalVariant) => (list ?? []).filter(x => x !== v);
const withVariant = (list: OptionalVariant[] | undefined, v: OptionalVariant) => [...new Set([...(list ?? []), v])];

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

export type BulkCardOp = 'upgrades-on' | 'upgrades-off' | 'fullart-off-without-art' | 'all-variants-on';

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
      // A card with no full-art image would show its normal art as Full Art / Shiny: switch those off for it.
      const off = [...new Set([...(c.disabledVariants ?? []), 'full', 'shiny'])] as OptionalVariant[];
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

// ── Users ─────────────────────────────────────────────────

/** A server action is a public endpoint, so a collection name that arrives as an argument must be one of the seasons' own. */
async function requireSeasonCollection(collectionName: string): Promise<void> {
  if (!(await listSeasons()).some(s => s.collectionName === collectionName)) throw new Error('That is not a season collection.');
}

export async function updateUserProfile(username: string, formData: FormData) {
  await requireAdmin();
  const existing = await getUserProfile(username);
  const profile: UserProfile = {
    ...existing,
    username: username.toLowerCase(),
    displayName: String(formData.get('displayName') ?? '').trim().slice(0, 60) || username,
    twitchId: String(formData.get('twitchId') ?? '').trim().slice(0, 60) || existing?.twitchId,
    notes: String(formData.get('notes') ?? '').trim().slice(0, 2000),
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await saveUserProfile(profile);
  await recordAudit(username, 'Profile edited', [profile.displayName !== existing?.displayName && `name: ${profile.displayName}`, profile.twitchId !== existing?.twitchId && 'Twitch username changed', profile.notes !== (existing?.notes ?? '') && 'notes updated'].filter(Boolean).join(' · ') || undefined);
  revalidatePath(`/admin/users/${username.toLowerCase()}`);
  revalidatePath('/admin/users');
}

// Remove one instance of a card from a user's collection. `entry` is the encoded card + variant (see lib/variants.ts).
export async function removeUserCard(username: string, collectionName: string, entry: number) {
  await requireAdmin();
  await requireSeasonCollection(collectionName);
  const lower = username.toLowerCase();
  const { cardNumber, variant } = decodeEntry(entry);
  const removed = await withCollectionLock(collectionName, async () => {
    const data = await getCollection(collectionName);
    const idx = data[lower]?.indexOf(entry) ?? -1;
    if (idx === -1) return false;
    data[lower] = [...data[lower].slice(0, idx), ...data[lower].slice(idx + 1)];
    if (data[lower].length === 0) delete data[lower];
    await saveCollection(collectionName, data);
    return true;
  });
  if (removed) {
    await recordActivity({ type: 'remove', username: lower, cardNumber, variant, collectionName });
    await recordAudit(lower, 'Card removed', `#${cardNumber}${variant === 'regular' ? '' : ` (${VARIANT_LABELS[variant]})`}`);
  }
  revalidatePath(`/admin/users/${lower}`);
  revalidatePath('/admin/users');
}

// Remove a user from a single season's collection
export async function resetUserSeason(username: string, collectionName: string) {
  await requireAdmin();
  await requireSeasonCollection(collectionName);
  const lower = username.toLowerCase();
  await takeUserSnapshot(lower, `Before resetting ${collectionName}`);
  if (await removeUserFromCollection(collectionName, lower)) {
    await recordActivity({ type: 'reset', scope: 'season', username: lower, collectionName });
    await recordAudit(lower, 'Season reset', collectionName);
  }
  revalidatePath(`/admin/users/${lower}`);
  revalidatePath('/admin/users');
}

// Fully delete a user, removes all cards and their profile, then redirects
export async function deleteUser(username: string) {
  await requireAdmin();
  const lower = username.toLowerCase();
  await takeUserSnapshot(lower, 'Before deleting the account');
  await recordAudit(lower, 'Account deleted', 'cards and profile removed (a restore point is kept for 14 days)');
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
export async function resetUser(rawUsername: string) {
  await requireAdmin();
  const username = rawUsername.toLowerCase();
  await takeUserSnapshot(username, 'Before resetting every season');
  await recordAudit(username, 'All seasons reset');
  const seasons = await listSeasons();
  await Promise.all(seasons.map(s => removeUserFromCollection(s.collectionName, username)));
  await recordActivity({ type: 'reset', scope: 'all', username });
  revalidatePath(`/admin/users/${username}`);
  revalidatePath('/admin/users');
}

// Reset all users across ALL seasons
export async function resetAllUsers() {
  await requireAdmin();
  const seasons = await listSeasons();
  await Promise.all(seasons.map(s => deleteCollection(s.collectionName)));
  await recordActivity({ type: 'reset', scope: 'everyone', username: '' });
  revalidatePath('/admin/users');
}

// ── Seed ──────────────────────────────────────────────────

export async function seedSeason1() {
  await requireAdmin();
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
  await requireAdmin();
  // The server POSTs to this address, so it has to be a public http(s) one; the fields must be well-formed (a bad paste must not crash the page).
  const target = checkWebhookUrl(String(formData.get('url') ?? ''));
  if (!target.ok) redirect(`/admin/settings?tab=webhooks&error=${encodeURIComponent(target.error)}`);
  let fields: unknown = [];
  try { fields = JSON.parse(String(formData.get('fieldsJson') ?? '[]')); } catch { redirect(`/admin/settings?tab=webhooks&error=${encodeURIComponent('The fields are not valid JSON.')}`); }
  const settings = await getWebhookSettings();
  settings.outgoing[event] = {
    url:     target.url,
    enabled: formData.get('enabled') === 'true' && target.url !== '',
    fields:  cleanWebhookFields(fields),
  };
  await saveWebhookSettings(settings);
  revalidatePath('/admin/settings');
  redirect('/admin/settings?tab=webhooks&saved=webhook');
}

export async function regenerateWebhookSecret() {
  await requireAdmin();
  const settings = await getWebhookSettings();
  settings.incomingSecret = randomBytes(16).toString('hex');
  await saveWebhookSettings(settings);
  revalidatePath('/admin/settings');
  redirect('/admin/settings?tab=webhooks&saved=webhook-secret');
}

// ── Overlay settings ──────────────────────────────────────

// ── Scoring ───────────────────────────────────────────────

/** Saves the scoring settings. Values are clamped to their allowed ranges (see lib/scoring.ts), never rejected. */
export async function saveScoringSettingsAction(formData: FormData) {
  await requireAdmin();
  const raw: Record<string, FormDataEntryValue | null> = {};
  for (const key of Object.keys(DEFAULT_SCORING)) raw[key] = formData.get(key);
  await saveScoringSettings(sanitizeScoring(raw));
  await notifyAdminLog({ action: 'Scoring settings changed', by: await currentStaffLogin() });
  // Public pages compute values live (force-dynamic), but the admin pages that show them need refreshing.
  revalidatePath('/admin/settings');
  revalidatePath('/admin');
  redirect('/admin/settings?tab=scoring&saved=scoring');
}

export async function resetScoringSettingsAction() {
  await requireAdmin();
  await resetScoringSettings();
  await notifyAdminLog({ action: 'Scoring settings reset to defaults', by: await currentStaffLogin() });
  revalidatePath('/admin/settings');
  revalidatePath('/admin');
  redirect('/admin/settings?tab=scoring&saved=scoring-reset');
}

export async function saveOverlaySettingsAction(formData: FormData) {
  await requireAdmin();
  const current = await getOverlaySettings();
  await saveOverlaySettings({
    ...current,
    livePacksOnly:       formData.get('livePacksOnly') === 'on',
    liveCollectionsOnly: formData.get('liveCollectionsOnly') === 'on',
  });
  revalidatePath('/admin/settings');
  redirect('/admin/settings?tab=overlay&saved=overlay');
}

// Saves the Overlay Editor. `payload` is JSON: { layout?, global?, packs? } with only the parts that changed:
//  - layout: the stage size and the pack / collection placements (sanitizeLayout clamps everything);
//  - global: look & animation properties, stored sparsely (defaults dropped);
//  - packs: { [packId]: values } per-pack overrides, which keep every value (an override equal to the default must survive).
export async function saveOverlayEditorAction(formData: FormData) {
  await requireAdmin();
  let payload: { layout?: unknown; global?: unknown; packs?: Record<string, unknown>; scenes?: Record<string, { props?: unknown; layout?: unknown }> } = {};
  try { payload = JSON.parse(String(formData.get('payload') ?? '{}')); } catch { /* ignore: saves nothing */ }
  const autoReload = formData.get('autoReload') === 'on';
  const before = await getOverlaySettings();
  // Keep a restore point of what is being replaced the first time (so even the very first save can be undone), then of every save.
  if ((await listVersions()).length === 0) await recordVersion('Before versions were kept');
  await saveOverlaySettings({
    ...before,
    layout: payload.layout !== undefined ? sanitizeLayout(payload.layout) : before.layout,
    props: payload.global !== undefined ? sanitizePropValues(payload.global) : before.props,
    autoReload,
  });
  // Per-pack overrides only for packs that exist (a crafted payload must not leave stray keys behind).
  const knownPacks = new Set(await listAllPackIds());
  for (const [packId, values] of Object.entries(payload.packs ?? {})) {
    if (!knownPacks.has(packId)) continue;
    await savePackOverrides(packId, sanitizePropValues(values, { keepDefaults: true }));
  }
  // Scenes (presets with their own overlay URL): each carries its own values and/or layout.
  for (const [id, scene] of Object.entries(payload.scenes ?? {})) {
    await updateScene(id, {
      ...(scene.props !== undefined ? { props: sanitizePropValues(scene.props, { keepDefaults: true }) } : {}),
      ...(scene.layout !== undefined ? { layout: sanitizeLayout(scene.layout) } : {}),
    });
  }
  await recordVersion(String(formData.get('note') ?? ''));
  if (autoReload) await bumpReloadToken();
  revalidatePath('/admin/overlay');
  const scope = String(formData.get('scope') ?? 'global');
  redirect(`/admin/overlay?scope=${encodeURIComponent(scope)}&saved=${autoReload ? 'saved-reload' : 'saved'}`);
}

export async function saveOverlayPresetAction(formData: FormData) {
  await requireAdmin();
  let values: unknown = {};
  try { values = JSON.parse(String(formData.get('props') ?? '{}')); } catch { /* empty preset is ignored below */ }
  // A new scene starts from a layout (a landscape copy of the current one, or a vertical stage); a plain preset sends none.
  const kind = String(formData.get('sceneKind') ?? '');
  let layout: OverlayLayout | null = null;
  if (kind === 'landscape' || kind === 'vertical') {
    let base: unknown;
    try { base = JSON.parse(String(formData.get('layout') ?? 'null')); } catch { base = null; }
    layout = sceneLayout(kind, sanitizeLayout(base));
  }
  const id = await savePreset(String(formData.get('name') ?? ''), sanitizePropValues(values), layout);
  revalidatePath('/admin/overlay');
  // A new scene opens in the editor so its layout can be set straight away.
  redirect(`/admin/overlay?scope=${encodeURIComponent(layout && id ? 'scene:' + id : String(formData.get('scope') ?? 'global'))}&saved=${layout ? 'scene' : 'preset'}`);
}

export async function deleteOverlayPresetAction(formData: FormData) {
  await requireAdmin();
  await deletePreset(String(formData.get('id') ?? ''));
  revalidatePath('/admin/overlay');
  redirect(`/admin/overlay?scope=${encodeURIComponent(String(formData.get('scope') ?? 'global'))}&saved=preset-deleted`);
}

// ── Assets ────────────────────────────────────────────────

// Deletes Blob files that nothing references (urls come from the form, but are re-verified server-side).
export async function deleteUnusedAssets(formData: FormData) {
  await requireAdmin();
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
  await requireAdmin();
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
  const variant = parseVariant(formData.get('variant'));
  const made = await addCollectionEntryWithSerial(collectionName, username, encodeEntry(card.number, variant), 'grant');
  await ensureUserProfile(username);
  await recordActivity({ type: 'grant', source: 'admin', username, cardNumber: card.number, variant, collectionName, ...(made.copyId ? { copyId: made.copyId } : {}), ...(made.uid ? { uid: made.uid } : {}) });
  revalidatePath('/admin');
  revalidatePath('/admin/users');
  return { ok: true, message: `Granted ${variant === 'regular' ? '' : VARIANT_LABELS[variant] + ' '}${card.name} (#${card.number}) to ${username}.` };
}

export async function clearQueueAction(): Promise<ActionResult> {
  await requireAdmin();
  const n = await clearQueue();
  revalidatePath('/admin');
  return { ok: true, message: n > 0 ? `Cleared ${n} waiting event${n !== 1 ? 's' : ''}.` : 'The queue was already empty.' };
}

// ── Discord activity feed ─────────────────────────────────
// One form: the whole settings object travels as JSON in the `settings` field, and the submit button's intent is
// save | test:<channelId> | last:<channelId>. Test and "last" use the channel as currently typed, so a webhook can be
// verified before it is saved.

export async function discordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const intent = String(formData.get('intent') ?? 'save');
  let raw: unknown;
  try { raw = JSON.parse(String(formData.get('settings') ?? '')); } catch { raw = null; }
  const cleaned = cleanDiscordInput(raw);
  if (!cleaned.ok) return { ok: false, message: cleaned.message };
  const { settings } = cleaned;

  if (intent === 'save') {
    await saveDiscordSettings(settings);
    revalidatePath('/admin/settings');
    const live = settings.enabled && settings.channels.some(c => c.enabled && c.url);
    return { ok: true, message: live ? 'Saved. Activity will be posted to Discord.' : 'Saved. Posting to Discord is off.' };
  }

  const [kind, id] = intent.split(':');
  const channel = settings.channels.find(c => c.id === id);
  if (!channel || (kind !== 'test' && kind !== 'last' && kind !== 'recap' && kind !== 'digest')) return { ok: false, message: 'That channel is not in the form any more.' };
  if (!channel.url) return { ok: false, message: `${channel.name}: paste a webhook URL first.` };

  let result;
  if (kind === 'test') {
    result = await deliver(channel, buildTestMessage(), 'test');
  } else if (kind === 'digest') {
    result = await deliver(channel, buildDigestMessage(sampleDigest(), { footer: 'Test digest, made-up numbers' }), 'digest');
  } else {
    const { events } = await getActivity({ limit: 1 });
    if (!events[0]) return { ok: false, message: 'There is no activity to send yet.' };
    result = await deliver(channel, await buildMessage(events[0], { footer: 'Resent from admin' }), 'last');
  }

  if (!result.ok) {
    return { ok: false, message: `${channel.name}: Discord didn’t accept it: ${result.error}${result.status ? ` (HTTP ${result.status})` : ''}` };
  }
  return { ok: true, message: kind === 'digest' ? `Test digest sent to ${channel.name}.` : kind === 'recap' ? `Test recap sent to ${channel.name}.` : kind === 'test' ? `Test message sent to ${channel.name}. Check your Discord channel.` : `Sent the most recent activity to ${channel.name}.` };
}
