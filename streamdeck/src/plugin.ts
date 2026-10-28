// Entry point of the TCG Bridge Stream Deck plugin (ROADMAP 57.13a): the only file that touches the Stream Deck SDK. It hands the SDK's events to Keys and the
// app's pushed state to the keys; it keeps no logic of its own.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import streamDeck from '@elgato/streamdeck';
import WebSocket from 'ws';
import { Keys } from './controller';
import { ACTION_KIND, type Settings } from './keys';
import { BridgeLink, type Socket } from './link';
import { MAX_MESSAGE } from './protocol';

// The manifest's version (the bridge's, "x.y.z.0") for the app's log; Stream Deck runs the plugin from its folder, so the manifest is in the working directory.
const VERSION = ((JSON.parse(readFileSync(join(process.cwd(), 'manifest.json'), 'utf8')) as { Version?: string }).Version ?? '').replace(/\.0$/, '');

function socket(url: string): Socket {
  const ws = new WebSocket(url, { maxPayload: MAX_MESSAGE * 8 });
  let closed: (() => void) | undefined;
  let done = false;
  const end = () => { if (!done) { done = true; closed?.(); } };
  ws.on('close', end);
  ws.on('error', end);
  return {
    send: d => ws.send(d),
    close: () => ws.close(),
    onOpen: cb => ws.on('open', cb),
    onMessage: cb => ws.on('message', d => cb(d.toString())),
    onClose: cb => { closed = cb; if (done) cb(); },
  };
}

const link: BridgeLink = new BridgeLink({
  file: join(process.env.APPDATA ?? '', 'TCG Bridge', 'streamdeck.json'),
  version: VERSION,
  connect: socket,
  onChange: () => { keys.drawAll(); void tellInspector(); },
});
const keys = new Keys(link);

/** Tells an open Property Inspector what the app offers (the buff list, and on a staff PC the OBS scenes) and whether it is reachable. */
async function tellInspector(): Promise<void> {
  const s = link.state;
  try { await streamDeck.ui.sendToPropertyInspector({ connected: !!s, ready: !!s?.ready, buffs: s?.buffs ?? [], staff: !!s?.staff, scenes: s?.staff?.scenes ?? [] }); } catch { /* no Property Inspector is open */ }
}

const kindOf = (uuid: string) => ACTION_KIND[uuid];

streamDeck.actions.onWillAppear(ev => {
  const kind = kindOf(ev.action.manifestId);
  if (kind && ev.action.isKey()) keys.add(ev.action.id, kind, ev.action, ev.payload.settings as Settings);
});
streamDeck.actions.onWillDisappear(ev => keys.remove(ev.action.id));
streamDeck.settings.onDidReceiveSettings(ev => keys.setSettings(ev.action.id, ev.payload.settings as Settings));
streamDeck.actions.onKeyDown(ev => { if (kindOf(ev.action.manifestId)) void keys.down(ev.action.id); });
streamDeck.actions.onKeyUp(ev => { if (kindOf(ev.action.manifestId)) void keys.up(ev.action.id); });
streamDeck.ui.onDidAppear(() => void tellInspector());
streamDeck.ui.onSendToPlugin(() => void tellInspector());

// The happy hour counts down: redraw once a second (a key only talks to the Stream Deck when its text changed).
setInterval(() => keys.drawAll(), 1000);

link.start();
await streamDeck.connect();
