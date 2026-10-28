'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { recordAudit } from '@/lib/audit';
import { createPairCode, revokeBridge, setBridgeStaff } from '@/lib/bridge';
import { liftPullBlock } from '@/lib/pull-block';
import { showCode } from '@/lib/bridge-core';
import { disconnectChannel } from '@/lib/twitch-channel';
import { disconnectBot, readBotStatus, setReplyAs } from '@/lib/twitch-bot';

/** Makes a one-time code (good for 10 minutes) to type into TCG Bridge. Returned to the page, never put in a URL. */
export async function createPairCodeAction(): Promise<{ code: string; until: string }> {
  const staff = await requireAdmin();
  const r = await createPairCode(staff.login);
  await recordAudit('everyone', 'TCG Bridge pair code made');
  return { code: showCode(r.code), until: `${new Date(r.expiresAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC` };
}

/** Revokes a paired bridge: its token stops working at once. */
export async function revokeBridgeAction(id: string): Promise<void> {
  await requireAdmin();
  const name = await revokeBridge(String(id));
  if (name) await recordAudit('everyone', 'TCG Bridge revoked', name);
  revalidatePath('/admin/mixitup');
}

/** Switches "Staff tools on this PC" on or off (ROADMAP 55.12). Off by default; revoking the PC ends it too. */
export async function setBridgeStaffAction(id: string, on: boolean): Promise<void> {
  await requireAdmin();
  const name = await setBridgeStaff(String(id), on === true);
  if (name) await recordAudit('everyone', on ? 'TCG Bridge staff tools switched on' : 'TCG Bridge staff tools switched off', name);
  revalidatePath('/admin/mixitup');
}

/** Disconnects the Twitch channel (ROADMAP 58.1): the token is revoked at Twitch and the stored one deleted. */
export async function disconnectTwitchChannelAction(): Promise<void> {
  await requireAdmin();
  await disconnectChannel();
  revalidatePath('/admin/mixitup');
}

/** Disconnects the chat bot account (ROADMAP 58.6): the token is revoked at Twitch, the stored one deleted and an audit line written; replies go back to the channel account. */
export async function disconnectTwitchBotAction(): Promise<void> {
  await requireAdmin();
  await disconnectBot();
  revalidatePath('/admin/mixitup');
}

/** "Reply as: channel / bot" (ROADMAP 58.6). The bot choice needs a connected bot account. */
export async function setReplyAsAction(value: string): Promise<void> {
  await requireAdmin();
  if (value === 'bot' && !(await readBotStatus())) return;
  await setReplyAs(value === 'bot' ? 'bot' : 'channel');
  revalidatePath('/admin/mixitup');
}

/** Lifts a block from pulls (the Blocked from pulls list on the Mix It Up page). */
export async function liftPullBlockAction(username: string): Promise<void> {
  await requireAdmin();
  const lower = String(username).toLowerCase();
  if (await liftPullBlock(lower)) await recordAudit(lower, 'Pull block lifted');
  revalidatePath('/admin/mixitup');
}
