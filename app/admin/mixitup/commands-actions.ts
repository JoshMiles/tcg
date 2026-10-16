'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { cleanCommands, argsFrom, flatReply, type ChatCommand } from '@/lib/commands-core';
import { runCommand, saveCommands } from '@/lib/commands';

export type SaveResult = { ok: true; commands: ChatCommand[] } | { ok: false; message: string };

/** Saves the whole command list (the builder keeps it in one piece, so names and aliases can be checked together). */
export async function saveCommandsAction(json: string): Promise<SaveResult> {
  await requireAdmin();
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return { ok: false, message: 'Could not read the commands.' }; }
  const r = cleanCommands(raw);
  if (!r.ok) return r;
  await saveCommands(r.commands);
  revalidatePath('/admin/mixitup');
  return { ok: true, commands: r.commands };
}

/** Try it: runs the command as it is in the editor (saved or not) as a dry run. Nothing is queued on stream and no cooldown is spent. */
export async function tryCommandAction(draftJson: string, username: string, args: string): Promise<{ json: string }> {
  await requireAdmin();
  let raw: unknown;
  try { raw = JSON.parse(draftJson); } catch { return { json: JSON.stringify({ ok: false, message: 'Could not read the command.' }) }; }
  const r = cleanCommands([raw]);
  if (!r.ok) return { json: JSON.stringify({ ok: false, message: r.message }, null, 2) };
  const who = username.trim().replace(/^@/, '').toLowerCase() || 'tester';
  const out = await runCommand({ command: r.commands[0].name, username: who, args: argsFrom({ args }), dry: true }, [{ ...r.commands[0], enabled: true }]);
  return { json: JSON.stringify(flatReply(out.ok, out.message, out.vars), null, 2) };
}
