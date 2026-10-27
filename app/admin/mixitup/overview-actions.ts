'use server';
import { requireAdmin } from '@/lib/admin-guard';
import { CHANNEL_LOGIN } from '@/lib/site';
import type { ActionResult } from '../action-types';
import { revalidatePath } from 'next/cache';
import { recordAudit } from '@/lib/audit';
import { setPauseChat, setPullsPaused } from '@/lib/pull-pause';
import { runBalanceTest, runSendTest, runStreamExtra } from './test-calls';

// The Overview tab's quick actions. Each answers with a message the page shows under its button (useActionState), instead of redirecting.

/** A balance check for the streamer's own account, through whatever the connection is. Nothing is charged. */
export async function testBalanceAction(): Promise<ActionResult> {
  await requireAdmin();
  return runBalanceTest(CHANNEL_LOGIN);
}

/** A test chat message, sent with an amount of 0. */
export async function sendTestMessageAction(): Promise<ActionResult> {
  await requireAdmin();
  return runSendTest();
}

/** Extra pulls for everyone this stream: the Set button sends the number, Clear sends 0. */
export async function setStreamExtraAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireAdmin();
  return runStreamExtra(formData.get('intent') === 'clear' ? '0' : String(formData.get('amount') ?? ''), staff.login);
}

/** Pause or resume pulls (ROADMAP 55.9). The checkbox says whether TCG Bridge also posts a line in chat when this changes. */
export async function setPausedAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const staff = await requireAdmin();
  const on = formData.get('intent') === 'pause';
  await setPauseChat(formData.get('chat') === 'on');
  if (await setPullsPaused(on)) await recordAudit('everyone', `Pulls ${on ? 'paused' : 'resumed'}`, `By ${staff.login} on the Mix It Up page`);
  revalidatePath('/admin/mixitup');
  return { ok: true, message: on ? 'Pulls are paused. Viewers are told "Packs are paused, back soon".' : 'Pulls are open.' };
}
