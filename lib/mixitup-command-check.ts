import { readBridge } from './bridge';
import { getCommands } from './commands';
import { getMixItUpSettings } from './mixitup';
import { checkCommands, expectedCommands, type CommandCheckRow } from './mixitup-command-check-core';
import type { BuffDef } from './buffs-core';

/** The expected Mix It Up commands, each found or not (ROADMAP 57.8). Null until the app has reported its commands, so nothing is shown for a bridge that has never reported. Read only. */
export async function readCommandCheck(buffs: BuffDef[]): Promise<CommandCheckRow[] | null> {
  const bridge = await readBridge();
  // shortcut: an app older than 0.4.0 and a Mix It Up with no enabled command both report none, so both read as "never reported"
  if (bridge.at === null || bridge.commands.length === 0) return null;
  const [chat, settings] = await Promise.all([getCommands(), getMixItUpSettings()]);
  return checkCommands(expectedCommands({ chat, buffs, events: settings.eventRewards }), bridge.commands);
}
