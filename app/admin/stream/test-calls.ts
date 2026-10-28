// What the Mix It Up page's test buttons do, as plain functions that answer in words. The 'use server' actions (mixitup-actions.ts for the
// Connection tab, overview-actions.ts for the Overview tab) call these after requireAdmin(); this file is not itself an action.
import { revalidatePath } from 'next/cache';
import { recordAudit } from '@/lib/audit';
import { hasBalanceRoute } from '@/lib/mixitup-core';
import { currentStreamKey, fetchBalance, getMixItUpSettings, logMixItUp, sendTest } from '@/lib/mixitup';
import { setStreamPullBuff } from '@/lib/pull-limit';
import { streamAmount } from '@/lib/pull-limit-core';

export interface TestResult { ok: boolean; message: string }

/** Asks Mix It Up for one viewer's balance using the saved settings. Nothing is charged. */
export async function runBalanceTest(user: string): Promise<TestResult> {
  if (!user) return { ok: false, message: 'Type a viewer name to check.' };
  const s = await getMixItUpSettings();
  if (!hasBalanceRoute(s)) return { ok: false, message: s.connection === 'bridge' ? 'Pair TCG Bridge and save the currency first.' : 'Save the balance address first.' };
  const { balance, error } = await fetchBalance(s, user);
  await logMixItUp({ username: user, what: 'balance', ok: balance !== null, detail: balance !== null ? `${balance} ${s.currency} (test)` : `${error ?? 'no answer'} (test)` });
  revalidatePath('/admin/stream');
  return balance === null ? { ok: false, message: `Mix It Up did not give a balance: ${error ?? 'no answer'}.` } : { ok: true, message: `${user} has ${balance.toLocaleString()} ${s.currency}.` };
}

/** Sends the message with a made-up viewer and an amount of 0, so the command can be tried without a pull. */
export async function runSendTest(): Promise<TestResult> {
  const s = await getMixItUpSettings();
  if (s.connection === 'addresses' && !s.balanceUrl && !s.deductUrl) return { ok: false, message: 'Save an address first.' };
  const r = await sendTest(s);
  await logMixItUp({ username: 'tcg-test', what: 'test', ok: r.ok, detail: r.ok ? `HTTP ${r.status}` : r.error ?? `HTTP ${r.status}` });
  revalidatePath('/admin/stream');
  return r.ok ? { ok: true, message: `Mix It Up answered (HTTP ${r.status}). The test message was sent with an amount of 0.` } : { ok: false, message: `Mix It Up did not accept the test: ${r.error ?? `HTTP ${r.status}`}.` };
}

/** Extra pulls for every viewer until this stream ends. 0 clears it. `raw` is what was typed. */
export async function runStreamExtra(raw: string, by: string): Promise<TestResult> {
  const n = streamAmount(raw.trim());
  if (n === null) return { ok: false, message: 'Type a whole number, 0 or more.' };
  await setStreamPullBuff(n, await currentStreamKey(), by);
  await recordAudit('everyone', n === 0 ? 'Stream pull bonus cleared' : 'Stream pull bonus set', n === 0 ? undefined : `+${n} pulls while this stream lasts`);
  revalidatePath('/admin/stream');
  return { ok: true, message: n === 0 ? 'The extra pulls for this stream are cleared.' : `Everyone gets ${n} extra pull${n === 1 ? '' : 's'} this stream.` };
}
