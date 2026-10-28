'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { recordAudit } from '@/lib/audit';
import { bridgePullTest, bridgeRunCommand, listBridges, readBridge, readObs } from '@/lib/bridge';
import { cleanRulesInput, pullArgs, rulesFromForm, SAMPLE_PULL, shoutText } from '@/lib/pull-rules-core';
import { getMixItUpSettings, saveMixItUpSettings } from '@/lib/mixitup';
import { runBalanceTest, runSendTest } from './test-calls';
import { EVENT_NAMES } from '@/lib/event-rewards-core';
import { saveRewardAwards } from '@/lib/twitch-awards';
import { cardHref, type CardId } from '@/lib/viewers-cards';
import { saveChat, saveEventRewards, savePaidFields, type Fields } from '@/lib/viewers-save';
import { setupHref } from '@/lib/mixitup-wizard';
import { connHref } from '@/lib/stream-connections';

const go = (href: string, kind: 'saved' | 'error' | 'note', text: string): never => redirect(`${href}${href.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(text)}`);
/** Back to the Test section, where Try it lives (63.4). */
const backToTest = (kind: 'error' | 'note', text: string): never => go('/admin/stream?section=test', kind, text);
/** Back to the card that was saved (63.3): What viewers get with that card open. */
const onCard = (id: CardId, kind: 'saved' | 'error' | 'note', text: string): never => go(cardHref(id), kind, text);
/** Back to a connection in Connections (63.4). */
const onConn = (id: Parameters<typeof connHref>[0], kind: 'saved' | 'error' | 'note', text: string): never => go(connHref(id), kind, text);
const getter = (formData: FormData) => (k: string) => { const v = formData.get(k); return typeof v === 'string' ? v : undefined; };

/**
 * Saves one of the two settings forms: the Paid pulls card or the Connection form (see savePaidFields; lib/viewers-save.ts keeps every field the form does
 * not show). The setup wizard posts the same forms with `returnTo=setup` and comes back to its own step.
 */
async function saveSettings(formData: FormData, form: 'paid' | 'connection'): Promise<never> {
  await requireAdmin();
  const fields: Fields = Object.fromEntries([...formData.entries()].filter((e): e is [string, string] => typeof e[1] === 'string'));
  const setup = formData.get('returnTo') === 'setup';
  const step = setupHref(form === 'paid' ? 'rules' : 'outgoing');
  const r = await savePaidFields(fields, form);
  if (!r.ok) return setup ? go(step, 'error', r.message) : form === 'paid' ? onCard('paid', 'error', r.message) : onConn('mixitup', 'error', r.message);
  revalidatePath('/admin/stream');
  return setup ? go(step, 'note', 'Saved.') : form === 'paid' ? onCard('paid', 'saved', 'mixitup') : onConn('mixitup', 'saved', 'mixitup');
}

/** Saves the Paid pulls card: the switch, price, limits and messages. */
export async function saveMixItUpAction(formData: FormData): Promise<void> {
  return saveSettings(formData, 'paid');
}

/** Saves the Mix It Up connection forms: how the site talks to Mix It Up, the currency and the direct addresses. The addresses must be public https ones (the server calls them). */
export async function saveConnectionAction(formData: FormData): Promise<void> {
  return saveSettings(formData, 'connection');
}

/** Saves the Big pull rules (ROADMAP 55.6d). Each command must be one TCG Bridge reported; the first matching rule runs. */
export async function savePullRulesAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const s = await getMixItUpSettings();
  const obs = await readObs();
  const r = cleanRulesInput(rulesFromForm(formData), (await readBridge()).commands.map(c => c.id), s.pullRules, { scenes: obs?.scenes ?? [], sources: obs?.sources ?? [] });
  if (!r.ok) return onCard('bigpulls', 'error', r.message);
  await saveMixItUpSettings({ ...s, pullRules: r.rules });
  await recordAudit('everyone', 'Big pull rules saved', `${r.rules.length} rule${r.rules.length === 1 ? '' : 's'}, ${r.rules.filter(x => x.on).length} on`);
  revalidatePath('/admin/stream');
  return onCard('bigpulls', 'note', 'Big pull rules saved.');
}

/** Switches the overlay watchdog (ROADMAP 55.8) on or off. It is a switch on the OBS connection in Connections. */
export async function saveWatchdogAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const on = formData.get('overlayWatchdog') === 'on';
  await saveMixItUpSettings({ ...(await getMixItUpSettings()), overlayWatchdog: on });
  await recordAudit('everyone', `Overlay watchdog ${on ? 'on' : 'off'}`);
  revalidatePath('/admin/stream');
  return onConn('obs', 'note', on ? 'The overlay watchdog is on.' : 'The overlay watchdog is off.');
}

/** Saves the Stream start and end card (ROADMAP 55.10): the post when the stream starts and the one when it ends. The Brie Bucks backup and check are not on it. */
export async function saveChatAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const { chat } = await saveChat(getter(formData), 'lines');
  await recordAudit('everyone', 'Stream start and end saved', `start post ${chat.startOn ? 'on' : 'off'}, end post ${chat.endOn ? 'on' : 'off'}`);
  revalidatePath('/admin/stream');
  return onCard('startend', 'note', 'Stream start and end saved.');
}

/** Saves the Brie Bucks safety panel in Connections (ROADMAP 55.10): the backup and the check of the charges. Unticked means off. The chat posts stay as saved. */
export async function saveChatSafetyAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const { chat } = await saveChat(getter(formData), 'safety');
  await recordAudit('everyone', 'Brie Bucks safety saved', `backup ${chat.backup ? 'on' : 'off'}, check ${chat.check ? 'on' : 'off'}`);
  revalidatePath('/admin/stream');
  return onConn('mixitup', 'note', 'Brie Bucks safety saved.');
}

/** Saves the Event rewards card (ROADMAP 55.4g): what gifted subs, bits, raids and redeems earn. The raid shout-out is its own card and stays as saved. */
export async function saveEventRewardsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const r = await saveEventRewards(getter(formData), 'events');
  if (!r.ok) return onCard('events', 'error', r.message);
  const rewards = (await getMixItUpSettings()).eventRewards;
  await recordAudit('everyone', 'Event rewards saved', EVENT_NAMES.map(n => `${n} ${rewards[n].on ? 'on' : 'off'}`).join(', '));
  revalidatePath('/admin/stream');
  return onCard('events', 'note', 'Event rewards saved.');
}

/** Saves the Raid shout-out card (ROADMAP 57.6): the switch and the smallest raid. The four event rewards stay as saved. */
export async function saveRaidShoutoutAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const r = await saveEventRewards(getter(formData), 'shoutout');
  if (!r.ok) return onCard('shoutout', 'error', r.message);
  const s = (await getMixItUpSettings()).eventRewards.raidShoutout;
  await recordAudit('everyone', 'Raid shout-out saved', s.on ? `on from ${s.minViewers}` : 'off');
  revalidatePath('/admin/stream');
  return onCard('shoutout', 'note', 'Raid shout-out saved.');
}

/** Saves the Channel points card (ROADMAP 58.3): the award for each reward the form listed. Admin only; every field is checked in saveRewardAwards. */
export async function saveRewardAwardsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const r = await saveRewardAwards(getter(formData), formData.getAll('reward').filter((v): v is string => typeof v === 'string'));
  if (r.ok) revalidatePath('/admin/stream');
  return onCard('points', r.ok ? 'note' : 'error', r.message);
}

/** Removes one saved rule. Other edits on the form are not saved. */
export async function deletePullRuleAction(id: string): Promise<void> {
  await requireAdmin();
  const s = await getMixItUpSettings();
  await saveMixItUpSettings({ ...s, pullRules: s.pullRules.filter(r => r.id !== id) });
  await recordAudit('everyone', 'Big pull rule deleted');
  revalidatePath('/admin/stream');
  return onCard('bigpulls', 'note', 'Rule deleted.');
}

/** Runs a saved rule's command once with a made-up pull, so the sound or lights can be tried without a pull. Does not wait for Mix It Up. */
export async function testPullRuleAction(id: string): Promise<void> {
  await requireAdmin();
  const rule = (await getMixItUpSettings()).pullRules.find(r => r.id === id);
  if (!rule) return onCard('bigpulls', 'error', 'Save the rule first, then test it.');
  if (!(await listBridges()).length) return onCard('bigpulls', 'error', 'Pair TCG Bridge first.');
  const queued = (rule.commandId ? await bridgeRunCommand(rule.commandId, pullArgs(SAMPLE_PULL)) : false) || (rule.obs || rule.say ? await bridgePullTest({ ...rule.obs, ...(rule.say ? { text: shoutText(rule.say, SAMPLE_PULL) } : {}) }) : false);
  return queued ? onCard('bigpulls', 'note', 'Sent to TCG Bridge with a sample pull. Nothing waits for Mix It Up: if it did not run, look at the job list in the TCG Bridge window.') : onCard('bigpulls', 'error', 'The command could not be queued.');
}

/** Asks Mix It Up for one viewer's balance using the saved settings. Nothing is charged. (Try it, in the Test section.) */
export async function checkBalanceAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const r = await runBalanceTest(String(formData.get('who') ?? '').trim().toLowerCase().replace(/^@/, ''));
  return backToTest(r.ok ? 'note' : 'error', r.message);
}

/** Sends the message with a made-up viewer and an amount of 0, so the command can be tried without a pull. (Try it, in the Test section.) */
export async function sendTestAction(): Promise<void> {
  await requireAdmin();
  const r = await runSendTest();
  return backToTest(r.ok ? 'note' : 'error', r.message);
}
