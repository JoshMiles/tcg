'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { cleanMixItUpInput } from '@/lib/mixitup-core';
import { fetchBalance, getMixItUpSettings, logMixItUp, saveMixItUpSettings, sendTest } from '@/lib/mixitup';

const back = (kind: 'saved' | 'error' | 'note', text: string): never => redirect(`/admin/mixitup?${kind}=${encodeURIComponent(text)}`);

/** Saves the Paid pulls form. The addresses must be public http(s) ones (the server calls them). */
export async function saveMixItUpAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const raw = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === 'string'));
  const r = cleanMixItUpInput({ ...raw, enabled: formData.get('enabled') === 'on' });
  if (!r.ok) return back('error', r.message);
  await saveMixItUpSettings(r.settings);
  revalidatePath('/admin/mixitup');
  return back('saved', 'mixitup');
}

/** Asks Mix It Up for one viewer's balance using the saved settings. Nothing is charged. */
export async function checkBalanceAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const user = String(formData.get('who') ?? '').trim().toLowerCase().replace(/^@/, '');
  if (!user) return back('error', 'Type a viewer name to check.');
  const s = await getMixItUpSettings();
  if (!s.balanceUrl) return back('error', 'Save the balance address first.');
  const { balance, error } = await fetchBalance(s, user);
  await logMixItUp({ username: user, what: 'balance', ok: balance !== null, detail: balance !== null ? `${balance} ${s.currency} (test)` : `${error ?? 'no answer'} (test)` });
  revalidatePath('/admin/mixitup');
  return balance === null ? back('error', `Mix It Up did not give a balance: ${error ?? 'no answer'}.`) : back('note', `${user} has ${balance.toLocaleString()} ${s.currency}.`);
}

/** Sends the message with a made-up viewer and an amount of 0, so the command can be tried without a pull. */
export async function sendTestAction(): Promise<void> {
  await requireAdmin();
  const s = await getMixItUpSettings();
  if (!s.balanceUrl && !s.deductUrl) return back('error', 'Save an address first.');
  const r = await sendTest(s);
  await logMixItUp({ username: 'tcg-test', what: 'test', ok: r.ok, detail: r.ok ? `HTTP ${r.status}` : r.error ?? `HTTP ${r.status}` });
  revalidatePath('/admin/mixitup');
  return r.ok ? back('note', `Mix It Up answered (HTTP ${r.status}). The test message was sent with an amount of 0.`) : back('error', `Mix It Up did not accept the test: ${r.error ?? `HTTP ${r.status}`}.`);
}
