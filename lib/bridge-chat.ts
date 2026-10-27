// Chat posts at the start and end of a stream, the Brie Bucks backup and the Brie Bucks check (ROADMAP 55.10), the server side (the pure
// parts are in bridge-chat-core.ts). Keys: `bridge:check:pending` (the stream window waiting for the app's ledger, 1 h), `bridge:check:last`.
// lib/twitch-live.ts calls streamStarted and streamEnded through a dynamic import (this file reads the Mix It Up settings, which read the live status).
import { kv, inSandbox } from './db';
import { bridgeQueue, bridgeSay, readBridge, readCharges } from './bridge';
import { closeUptimeStream, noteUptime, openUptimeStream } from './bridge-uptime';
import { CONNECTED_MS } from './bridge-core';
import { getMixItUpSettings, logMixItUp } from './mixitup';
import { CHANNEL_NAME } from './site';
import type { StreamRecap } from './stream-recap';
import { cleanLedger, compareLedgers, endLine, fillChat, summaryOf, type AppLedgerRow } from './bridge-chat-core';

const PENDING = 'bridge:check:pending';
const LAST = 'bridge:check:last';

export interface LedgerCheck { at: number; from: number; to: number; site: number; app: number; problems: string[] }

/** The stream started (the first sighting of it). Never throws; a sandbox does nothing. */
export async function streamStarted(): Promise<void> {
  try {
    if (await inSandbox()) return;
    await openUptimeStream(); // the uptime history (55.11); the bridge counts as up when it polled lately
    const seen = (await readBridge()).at;
    await noteUptime('bridge', !!seen && Date.now() - seen <= CONNECTED_MS);
    const { chat, currencyId, connection } = await getMixItUpSettings();
    if (chat.startOn) await bridgeSay(fillChat(chat.startText, { channel: CHANNEL_NAME }));
    if (chat.backup && connection === 'bridge' && currencyId) await bridgeQueue({ kind: 'backup', phase: 'start', currencyId });
  } catch { /* chat is a nicety */ }
}

/** The stream ended. `recap` is null when nothing was pulled. Never throws; a sandbox does nothing. */
export async function streamEnded(recap: StreamRecap | null, since: number, now = Date.now()): Promise<void> {
  try {
    if (await inSandbox()) return;
    await closeUptimeStream(now);
    const { chat, currencyId, connection } = await getMixItUpSettings();
    if (recap) await bridgeQueue({ kind: 'summary', summary: summaryOf(recap, await readCharges(), since, now) }); // the app's summary window (55.11), off in the app until switched on
    if (chat.endOn && recap) await bridgeSay(endLine(chat.endText, recap, CHANNEL_NAME));
    if (chat.backup && connection === 'bridge' && currencyId) await bridgeQueue({ kind: 'backup', phase: 'end', currencyId });
    if (chat.check && connection === 'bridge') {
      await kv.set(PENDING, { from: since, to: now }, { ex: 3600 });
      await bridgeQueue({ kind: 'ledger' });
    }
  } catch { /* chat is a nicety */ }
}

/** The app posted its ledger: compare it with the site's charges for the stream that just ended, once. False when no check was waiting. */
export async function receiveLedger(raw: unknown, now = Date.now()): Promise<boolean> {
  const pending = await kv.get<{ from: number; to: number }>(PENDING);
  if (!pending || (await kv.del(PENDING)) !== 1) return false; // DEL's count is the claim: a repeated post compares nothing
  const inStream = <T extends { at: number }>(r: T) => r.at >= pending.from && r.at <= pending.to;
  const site = (await readCharges()).filter(inStream);
  const app = cleanLedger(raw).filter(inStream) as AppLedgerRow[];
  const problems = compareLedgers(site, app);
  const result: LedgerCheck = { at: now, from: pending.from, to: pending.to, site: site.length, app: app.length, problems: problems.slice(0, 50) };
  await kv.set(LAST, result);
  await logMixItUp({ username: '-', what: 'check', ok: !problems.length, detail: problems.length ? `Brie Bucks check: ${problems.length} differ. ${problems[0]}` : `Brie Bucks check: ${site.length} charges match` });
  return true;
}

export async function readLedgerCheck(): Promise<LedgerCheck | null> {
  try { return (await kv.get<LedgerCheck>(LAST)) ?? null; } catch { return null; }
}
