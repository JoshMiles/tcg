// Shared by the two Property Inspector pages. Stream Deck calls connectElgatoStreamDeckSocket; the plugin answers with {connected, ready, buffs}.
// Settings are saved on every change; the plugin redraws the key from them.
let ws = null;
let uuid = '';
let action = '';
let settings = {};
let offer = { connected: false, ready: false, buffs: [] };
let onSettings = () => {};
let onOffer = () => {};

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function save(patch) {
  settings = Object.assign({}, settings, patch);
  send({ event: 'setSettings', context: uuid, payload: settings });
}

function connectElgatoStreamDeckSocket(port, inUuid, registerEvent, _info, actionInfo) {
  uuid = inUuid;
  const info = JSON.parse(actionInfo);
  action = info.action;
  settings = (info.payload && info.payload.settings) || {};
  ws = new WebSocket('ws://127.0.0.1:' + port);
  ws.onopen = () => {
    send({ event: registerEvent, uuid });
    send({ event: 'sendToPlugin', context: uuid, action, payload: { hello: true } });
    onSettings(settings);
  };
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.event === 'didReceiveSettings') { settings = m.payload.settings || {}; onSettings(settings); }
    if (m.event === 'sendToPropertyInspector' && m.payload) { offer = m.payload; onOffer(offer); }
  };
}
