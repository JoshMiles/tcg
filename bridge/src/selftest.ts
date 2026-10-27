// The window's self-tests. Each one answers in words for the streamer; none throws. Plain TypeScript, no Electron.
import { MixItUpClient, MixItUpDown, MixItUpError } from './mixitup';
import type { ObsWatcher, OverlayCheck } from './obs';

export interface TestResult { ok: boolean; text: string }

export const TEST_CHAT_MESSAGE = 'TCG Bridge test message';
const LOGIN = /^[a-z0-9_]{1,25}$/;

const why = (e: unknown): string =>
  e instanceof MixItUpDown || e instanceof MixItUpError ? e.message : `Unexpected error${e instanceof Error && e.message ? `: ${e.message}` : ''}`;

/** The Developer API answers (and its version), the currency the site chose is found by id and by name, and a balance is read for a Twitch name. */
export async function testMixItUp(mix: MixItUpClient, nameRaw: string, currencyId: string): Promise<TestResult> {
  const name = nameRaw.trim().toLowerCase();
  if (!LOGIN.test(name)) return { ok: false, text: 'Type a Twitch name to read the balance of (letters, numbers and underscores).' };
  try {
    const version = await mix.version();
    if (version === null) return { ok: false, text: 'Mix It Up does not answer. Open it and switch on Services > Developer API > Connect.' };
    let text = `Mix It Up ${version} answers.`;
    if (!currencyId) return { ok: false, text: `${text} The site has not chosen a currency yet (Admin > Mix It Up > Paid pulls).` };
    const found = (await mix.currencies()).find(c => c.id.toLowerCase() === currencyId.toLowerCase());
    if (!found) return { ok: false, text: `${text} The currency the site chose is not in Mix It Up (it may have been deleted there). Choose it again on the site.` };
    text += ` The currency is ${found.name}.`;
    const user = await mix.twitchUser(name);
    if (!user) return { ok: true, text: `${text} Mix It Up does not know ${name} yet, so they have 0 ${found.name}.` };
    const amount = user.amounts.find(a => a.id.toLowerCase() === currencyId.toLowerCase());
    if (!amount) return { ok: false, text: `${text} Mix It Up knows ${name} but lists no ${found.name} for them.` };
    return { ok: true, text: `${text} ${name} has ${amount.amount} ${found.name}.` };
  } catch (e) {
    return { ok: false, text: why(e) };
  }
}

export async function sendTestChat(mix: MixItUpClient): Promise<TestResult> {
  try {
    await mix.say(TEST_CHAT_MESSAGE);
    return { ok: true, text: `Sent "${TEST_CHAT_MESSAGE}". Look for it in chat.` };
  } catch (e) {
    return { ok: false, text: why(e) };
  }
}

function overlayText(o: OverlayCheck, scene: string): string {
  if (!o.found) return 'The overlay browser source is not in OBS.';
  if (!o.inProgram) return `${o.sourceName} exists but is not in the current scene.`;
  if (!o.visible) return `${o.sourceName} is in ${scene} but hidden.`;
  return `${o.sourceName} is visible in ${scene}.`;
}

/** Runs the overlay check now and says what OBS shows, or why it cannot. */
export async function checkObs(obs: ObsWatcher): Promise<TestResult> {
  try {
    const s = await obs.checkNow();
    return { ok: true, text: `Connected. Scene ${s.scene || 'unknown'}, ${s.streaming === null ? 'stream state unknown' : s.streaming ? 'live' : 'not streaming'}. ${overlayText(s.overlay, s.scene)}` };
  } catch (e) {
    return { ok: false, text: e instanceof Error && e.message ? e.message : 'Could not check OBS' };
  }
}
