'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { recordAudit } from '@/lib/audit';
import { cleanMixItUpInput } from '@/lib/mixitup-core';
import { bridgePullTest, bridgeRunCommand, listBridges, readBridge, readObs } from '@/lib/bridge';
import { cleanRulesInput, pullArgs, rulesFromForm, SAMPLE_PULL } from '@/lib/pull-rules-core';
import { getMixItUpSettings, saveMixItUpSettings } from '@/lib/mixitup';
import { runBalanceTest, runSendTest } from './test-calls';

const back = (tab: string, kind: 'saved' | 'error' | 'note', text: string): never => redirect(`/admin/mixitup?tab=${tab}&${kind}=${encodeURIComponent(text)}`);

/**
 * Saves one of the two settings forms. Each form posts only its own fields, so they are laid over what is stored: the Paid pulls form
 * (tab `paid`) brings the switch, price, limits and message, the Connection form (tab `connection`) brings the connection, currency and
 * addresses. The Big pulls rules are never on either form, so they stay.
 */
async function saveSettings(formData: FormData, tab: 'paid' | 'connection'): Promise<never> {
  await requireAdmin();
  const cur = await getMixItUpSettings();
  const fields = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string'));
  // The setup wizard posts the same forms with `returnTo=setup` and comes back to its own step.
  const end = (kind: 'saved' | 'error', text: string): never => formData.get('returnTo') === 'setup'
    ? redirect(`/admin/mixitup/setup?step=${tab === 'paid' ? 'rules' : 'outgoing'}&${kind === 'saved' ? 'note=Saved.' : `error=${encodeURIComponent(text)}`}`)
    : back(tab, kind, text);
  const r = cleanMixItUpInput({ ...cur, ...fields, enabled: tab === 'paid' ? formData.get('enabled') === 'on' : cur.enabled });
  if (!r.ok) return end('error', r.message);
  if (r.settings.connection === 'bridge') { // the currency's name comes from what the bridge announced
    const c = (await readBridge()).currencies.find(x => x.id === r.settings.currencyId);
    if (c) r.settings.currency = c.name;
  }
  await saveMixItUpSettings(r.settings);
  revalidatePath('/admin/mixitup');
  return end('saved', 'mixitup');
}

/** Saves the Paid pulls form: the switch, price, limits and message. */
export async function saveMixItUpAction(formData: FormData): Promise<void> {
  return saveSettings(formData, 'paid');
}

/** Saves the Connection form: how the site talks to Mix It Up, the currency and the direct addresses. The addresses must be public https ones (the server calls them). */
export async function saveConnectionAction(formData: FormData): Promise<void> {
  return saveSettings(formData, 'connection');
}

/** Saves the Big pulls rules (ROADMAP 55.6d). Each command must be one TCG Bridge reported; the first matching rule runs. */
export async function savePullRulesAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const s = await getMixItUpSettings();
  const obs = await readObs();
  const r = cleanRulesInput(rulesFromForm(formData), (await readBridge()).commands.map(c => c.id), s.pullRules, { scenes: obs?.scenes ?? [], sources: obs?.sources ?? [] });
  if (!r.ok) return back('bigpulls', 'error', r.message);
  await saveMixItUpSettings({ ...s, pullRules: r.rules });
  await recordAudit('everyone', 'Big pull rules saved', `${r.rules.length} rule${r.rules.length === 1 ? '' : 's'}, ${r.rules.filter(x => x.on).length} on`);
  revalidatePath('/admin/mixitup');
  return back('bigpulls', 'note', 'Big pull rules saved.');
}

/** Switches the overlay watchdog (ROADMAP 55.8) on or off. */
export async function saveWatchdogAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const on = formData.get('overlayWatchdog') === 'on';
  await saveMixItUpSettings({ ...(await getMixItUpSettings()), overlayWatchdog: on });
  await recordAudit('everyone', `Overlay watchdog ${on ? 'on' : 'off'}`);
  revalidatePath('/admin/mixitup');
  return back('bigpulls', 'note', on ? 'The overlay watchdog is on.' : 'The overlay watchdog is off.');
}

/** Removes one saved rule. Other edits on the form are not saved. */
export async function deletePullRuleAction(id: string): Promise<void> {
  await requireAdmin();
  const s = await getMixItUpSettings();
  await saveMixItUpSettings({ ...s, pullRules: s.pullRules.filter(r => r.id !== id) });
  await recordAudit('everyone', 'Big pull rule deleted');
  revalidatePath('/admin/mixitup');
  return back('bigpulls', 'note', 'Rule deleted.');
}

/** Runs a saved rule's command once with a made-up pull, so the sound or lights can be tried without a pull. Does not wait for Mix It Up. */
export async function testPullRuleAction(id: string): Promise<void> {
  await requireAdmin();
  const rule = (await getMixItUpSettings()).pullRules.find(r => r.id === id);
  if (!rule) return back('bigpulls', 'error', 'Save the rule first, then test it.');
  if (!(await listBridges()).length) return back('bigpulls', 'error', 'Pair TCG Bridge first.');
  const queued = (rule.commandId ? await bridgeRunCommand(rule.commandId, pullArgs(SAMPLE_PULL)) : false) || (rule.obs ? await bridgePullTest(rule.obs) : false);
  return queued ? back('bigpulls', 'note', 'Sent to TCG Bridge with a sample pull. Nothing waits for Mix It Up: if it did not run, look at the job list in the TCG Bridge window.') : back('bigpulls', 'error', 'The command could not be queued.');
}

/** Asks Mix It Up for one viewer's balance using the saved settings. Nothing is charged. (The Connection tab's Try it.) */
export async function checkBalanceAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const r = await runBalanceTest(String(formData.get('who') ?? '').trim().toLowerCase().replace(/^@/, ''));
  return back('connection', r.ok ? 'note' : 'error', r.message);
}

/** Sends the message with a made-up viewer and an amount of 0, so the command can be tried without a pull. (The Connection tab's Try it.) */
export async function sendTestAction(): Promise<void> {
  await requireAdmin();
  const r = await runSendTest();
  return back('connection', r.ok ? 'note' : 'error', r.message);
}
