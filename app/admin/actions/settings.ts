'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import { requireAdmin } from '@/lib/admin-guard';
import { checkWebhookUrl, cleanWebhookFields } from '@/lib/webhook-clean';
import { listAllPackIds } from '@/lib/kv';
import { deleteUnusedBlobs } from '@/lib/assets';
import { getActivity } from '@/lib/activity';
import {
  saveDiscordSettings, cleanDiscordInput, notifyAdminLog, deliver, buildMessage, buildTestMessage, newestMatchingEvent, DISCORD_CATEGORIES,
} from '@/lib/discord';
import { sampleMessage } from '@/lib/discord-samples';
import { currentStaffLogin } from '@/lib/staff-actor';
import type { ActionResult } from '../action-types';
import { getWebhookSettings, saveWebhookSettings } from '@/lib/webhooks';
import { getOverlaySettings, saveOverlaySettings, savePackOverrides, savePreset, deletePreset, bumpReloadToken, updateScene } from '@/lib/overlay-settings';
import { listVersions, recordVersion } from '@/lib/overlay-versions';
import { sanitizePropValues } from '@/lib/overlay-props';
import { sanitizeLayout, sceneLayout, type OverlayLayout } from '@/lib/overlay-layout';
import { DEFAULT_SCORING, sanitizeScoring, saveScoringSettings, resetScoringSettings } from '@/lib/scoring';
import { achievementSettingsFromForm, saveAchievementSettings } from '@/lib/achievement-settings';

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

/** Saves which built-in achievements are on, and any replacement title or detail. A missing checkbox means off. */
export async function saveAchievementSettingsAction(formData: FormData) {
  await requireAdmin();
  await saveAchievementSettings(achievementSettingsFromForm(formData));
  await notifyAdminLog({ action: 'Achievement list changed', by: await currentStaffLogin() });
  revalidatePath('/admin/settings');
  redirect('/admin/settings?tab=achievements&saved=achievements');
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

// ── Discord activity feed ─────────────────────────────────
// One form: the whole settings object travels as JSON in the `settings` field, and the submit button's intent is
// save | test:<channelId> | last:<channelId> | sample:<channelId>:<category>. Test and "last" use the channel as currently typed, so a webhook can be
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

  const [kind, id, category] = intent.split(':');
  const channel = settings.channels.find(c => c.id === id);
  const sampleCategory = DISCORD_CATEGORIES.find(c => c.key === category);
  if (!channel || (kind !== 'test' && kind !== 'last' && !(kind === 'sample' && sampleCategory))) return { ok: false, message: 'That channel is not in the form any more.' };
  if (!channel.url) return { ok: false, message: `${channel.name}: paste a webhook URL first.` };

  let result;
  if (kind === 'test') {
    result = await deliver(channel, buildTestMessage(), 'test');
  } else if (sampleCategory) {
    result = await deliver(channel, await sampleMessage(sampleCategory.key), `test ${sampleCategory.key}`);
  } else {
    const { events } = await getActivity({ limit: 200 });
    if (!events[0]) return { ok: false, message: 'There is no activity to send yet.' };
    const event = newestMatchingEvent(events, channel);
    if (!event) return { ok: false, message: 'No recent activity matches this channel’s filters.' };
    result = await deliver(channel, await buildMessage(event, { footer: 'Resent from admin' }), 'last');
  }

  if (!result.ok) {
    return { ok: false, message: `${channel.name}: Discord didn’t accept it: ${result.error}${result.status ? ` (HTTP ${result.status})` : ''}` };
  }
  return { ok: true, message: sampleCategory ? `Test ${sampleCategory.label} sent to ${channel.name}.` : kind === 'test' ? `Test message sent to ${channel.name}. Check your Discord channel.` : `Sent the most recent matching activity to ${channel.name}.` };
}
