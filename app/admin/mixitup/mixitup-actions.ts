'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { recordAudit } from '@/lib/audit';
import { cleanMixItUpInput, hasBalanceRoute } from '@/lib/mixitup-core';
import { bridgeRunCommand, listBridges, readBridge } from '@/lib/bridge';
import { cleanRulesInput, pullArgs, rulesFromForm, SAMPLE_PULL } from '@/lib/pull-rules-core';
import { currentStreamKey, fetchBalance, getMixItUpSettings, logMixItUp, saveMixItUpSettings, sendTest } from '@/lib/mixitup';
import { setStreamPullBuff } from '@/lib/pull-limit';
import { streamAmount } from '@/lib/pull-limit-core';

const back = (kind: 'saved' | 'error' | 'note', text: string): never => redirect(`/admin/mixitup?${kind}=${encodeURIComponent(text)}`);

/** Saves the Paid pulls form. The addresses must be public http(s) ones (the server calls them). */
export async function saveMixItUpAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const raw = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string'));
  const r = cleanMixItUpInput({ ...raw, enabled: formData.get('enabled') === 'on' });
  if (!r.ok) return back('error', r.message);
  if (r.settings.connection === 'bridge') { // the currency's name comes from what the bridge announced
    const c = (await readBridge()).currencies.find(x => x.id === r.settings.currencyId);
    if (c) r.settings.currency = c.name;
  }
  r.settings.pullRules = (await getMixItUpSettings()).pullRules; // this form has no rules: keep the Big pulls ones
  await saveMixItUpSettings(r.settings);
  revalidatePath('/admin/mixitup');
  return back('saved', 'mixitup');
}

/** Saves the Big pulls rules (ROADMAP 55.6d). Each command must be one TCG Bridge reported; the first matching rule runs. */
export async function savePullRulesAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const s = await getMixItUpSettings();
  const r = cleanRulesInput(rulesFromForm(formData), (await readBridge()).commands.map(c => c.id), s.pullRules);
  if (!r.ok) return back('error', r.message);
  await saveMixItUpSettings({ ...s, pullRules: r.rules });
  await recordAudit('everyone', 'Big pull rules saved', `${r.rules.length} rule${r.rules.length === 1 ? '' : 's'}, ${r.rules.filter(x => x.on).length} on`);
  revalidatePath('/admin/mixitup');
  return back('note', 'Big pull rules saved.');
}

/** Removes one saved rule. Other edits on the form are not saved. */
export async function deletePullRuleAction(id: string): Promise<void> {
  await requireAdmin();
  const s = await getMixItUpSettings();
  await saveMixItUpSettings({ ...s, pullRules: s.pullRules.filter(r => r.id !== id) });
  await recordAudit('everyone', 'Big pull rule deleted');
  revalidatePath('/admin/mixitup');
  return back('note', 'Rule deleted.');
}

/** Runs a saved rule's command once with a made-up pull, so the sound or lights can be tried without a pull. Does not wait for Mix It Up. */
export async function testPullRuleAction(id: string): Promise<void> {
  await requireAdmin();
  const rule = (await getMixItUpSettings()).pullRules.find(r => r.id === id);
  if (!rule) return back('error', 'Save the rule first, then test it.');
  if (!(await listBridges()).length) return back('error', 'Pair TCG Bridge first.');
  const queued = await bridgeRunCommand(rule.commandId, pullArgs(SAMPLE_PULL));
  return queued ? back('note', 'Sent to TCG Bridge with a sample pull. Nothing waits for Mix It Up: if it did not run, look at the job list in the TCG Bridge window.') : back('error', 'The command could not be queued.');
}

/** Extra pulls for every viewer until this stream ends. 0 clears it. */
export async function setStreamBuffAction(formData: FormData): Promise<void> {
  const staff = await requireAdmin();
  const n = streamAmount(String(formData.get('amount') ?? '').trim());
  if (n === null) return back('error', 'Type a whole number, 0 or more.');
  await setStreamPullBuff(n, await currentStreamKey(), staff.login);
  await recordAudit('everyone', n === 0 ? 'Stream pull bonus cleared' : 'Stream pull bonus set', n === 0 ? undefined : `+${n} pulls while this stream lasts`);
  revalidatePath('/admin/mixitup');
  return back('note', n === 0 ? 'The extra pulls for this stream are cleared.' : `Everyone gets ${n} extra pull${n === 1 ? '' : 's'} this stream.`);
}

/** Removes the extra pulls for this stream. */
export async function clearStreamBuffAction(): Promise<void> {
  const staff = await requireAdmin();
  await setStreamPullBuff(0, await currentStreamKey(), staff.login);
  await recordAudit('everyone', 'Stream pull bonus cleared');
  revalidatePath('/admin/mixitup');
  return back('note', 'The extra pulls for this stream are cleared.');
}

/** Asks Mix It Up for one viewer's balance using the saved settings. Nothing is charged. */
export async function checkBalanceAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const user = String(formData.get('who') ?? '').trim().toLowerCase().replace(/^@/, '');
  if (!user) return back('error', 'Type a viewer name to check.');
  const s = await getMixItUpSettings();
  if (!hasBalanceRoute(s)) return back('error', s.connection === 'bridge' ? 'Pair TCG Bridge and save the currency first.' : 'Save the balance address first.');
  const { balance, error } = await fetchBalance(s, user);
  await logMixItUp({ username: user, what: 'balance', ok: balance !== null, detail: balance !== null ? `${balance} ${s.currency} (test)` : `${error ?? 'no answer'} (test)` });
  revalidatePath('/admin/mixitup');
  return balance === null ? back('error', `Mix It Up did not give a balance: ${error ?? 'no answer'}.`) : back('note', `${user} has ${balance.toLocaleString()} ${s.currency}.`);
}

/** Sends the message with a made-up viewer and an amount of 0, so the command can be tried without a pull. */
export async function sendTestAction(): Promise<void> {
  await requireAdmin();
  const s = await getMixItUpSettings();
  if (s.connection === 'addresses' && !s.balanceUrl && !s.deductUrl) return back('error', 'Save an address first.');
  const r = await sendTest(s);
  await logMixItUp({ username: 'tcg-test', what: 'test', ok: r.ok, detail: r.ok ? `HTTP ${r.status}` : r.error ?? `HTTP ${r.status}` });
  revalidatePath('/admin/mixitup');
  return r.ok ? back('note', `Mix It Up answered (HTTP ${r.status}). The test message was sent with an amount of 0.`) : back('error', `Mix It Up did not accept the test: ${r.error ?? `HTTP ${r.status}`}.`);
}
