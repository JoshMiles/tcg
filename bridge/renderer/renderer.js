// The window: draws the state main.js sends and sends the actions back. Text only (textContent), never HTML.
const $ = id => document.getElementById(id);
const SITE_TEXT = { connecting: 'Connecting', connected: 'Connected', offline: 'Cannot reach the site, trying again', revoked: 'Sign in again' };
const TRAY_TEXT = { connected: 'All connected', partly: 'Partly connected', offline: 'Not connected' };

const ago = ms => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 5 ? 'just now' : s < 60 ? `${s} seconds ago` : `${Math.round(s / 60)} minutes ago`;
};
const setDot = (id, kind) => { $(id).className = 'dot' + (kind ? ' ' + kind : ''); }; // kind: ok, warn, off or '' (red)

let state = null;
let obsFormFilled = false;
let nameFilled = false;

function overlayText(o, scene) {
  if (!o.found) return 'Not found. Add the overlay as a browser source in OBS (the address is in Admin > Settings > OBS Overlay).';
  if (!o.inProgram) return `${o.sourceName} exists but is not in the current scene (${scene})`;
  if (!o.visible) return `${o.sourceName} is in ${scene} but hidden`;
  return `${o.sourceName} is visible in ${scene}`;
}

function renderObs(obs, saved) {
  if (!obsFormFilled && saved) { // fill the form once; later renders must not overwrite what is being typed
    obsFormFilled = true;
    $('obs-on').checked = saved.enabled;
    $('obs-address').value = saved.address;
    $('obs-replay').checked = !!saved.startReplay;
    $('obs-password').placeholder = saved.hasPassword ? '(saved, type to replace)' : '';
  }
  $('obs-forget').hidden = !(saved && saved.hasPassword);
  const up = !!(obs && obs.enabled && obs.connected);
  $('obs-scene').textContent = up && obs.scene ? obs.scene : '-';
  $('obs-stream').textContent = up ? (obs.streaming === null ? '-' : obs.streaming ? `Live for ${liveText(state.liveSince)}` : 'Not streaming') : '-';
  $('obs-overlay').textContent = up ? overlayText(obs.overlay, obs.scene) : '-';
}
const liveText = since => { const m = since ? Math.floor((Date.now() - since) / 60000) : 0; return m < 1 ? 'less than a minute' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`; };

// The Connections page (59.6): a list on the left and one connection's detail on the right. The app sends the rows (src/connections.ts): dot tone,
// the one-line state, the header sentence and the fix steps. Every jump (status pill Fix, Home chip, Overlay's link) selects a connection through goTo.
const DOT_TONE = { ok: 'ok', warn: 'warn', bad: '', off: 'off' };
let selectedConn = 'account';
const fixKeys = {};
function renderConnections() {
  for (const r of state.connections || []) {
    const row = document.querySelector(`.conn-row[data-conn="${r.id}"]`);
    row.firstElementChild.className = 'dot' + (DOT_TONE[r.tone] ? ' ' + DOT_TONE[r.tone] : '');
    row.querySelector('small').textContent = r.line;
    if (r.id === selectedConn) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
    $('detail-' + r.id).hidden = r.id !== selectedConn;
    setDot(r.id + '-dot', DOT_TONE[r.tone]);
    $(r.id + '-title').textContent = r.sentence;
    const fix = $(r.id + '-fix');
    fix.hidden = r.fix.steps.length === 0;
    const key = JSON.stringify(r.fix.steps);
    if (fixKeys[r.id] === key) continue;
    fixKeys[r.id] = key;
    fix.querySelector('ol').replaceChildren(...r.fix.steps.map(text => { const li = document.createElement('li'); li.textContent = text; return li; }));
  }
}
function selectConn(id) {
  selectedConn = id;
  if (state) renderConnections();
}
for (const row of document.querySelectorAll('.conn-row')) row.addEventListener('click', () => selectConn(row.dataset.conn));

// The pre-stream checklist (57.1): one line per check, a dot for green, red or grey.
const CHECK_DOT = { ok: 'ok', bad: '', muted: 'off' };
// The Ready to go live card (59.5): the app sends the summary (src/home.ts readySummary): all green = one line, else only the red lines.
function renderChecklist(r) {
  setDot('checklist-dot', r.done ? 'ok' : r.lines.length ? '' : 'off');
  $('checklist-state').textContent = r.text;
  $('checklist-run-label').textContent = r.done || r.lines.length ? 'Run again' : 'Run';
  $('checklist-lines').replaceChildren(...r.lines.map(l => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot' + (CHECK_DOT[l.tone] ? ' ' + CHECK_DOT[l.tone] : '');
    const label = document.createElement('strong');
    label.textContent = l.label;
    const text = document.createElement('span');
    text.textContent = l.text;
    li.append(dot, label, text);
    return li;
  }));
}

// The Mix It Up command check (57.8): one line, and the names to fix. null = the site has not said yet. Site text goes in with textContent only.
function renderCommands(missing) {
  const n = Array.isArray(missing) ? missing.length : -1;
  setDot('commands-dot', n < 0 ? 'off' : n === 0 ? 'ok' : 'warn');
  $('commands-state').textContent = n < 0 ? 'Mix It Up commands: not checked yet' : n === 0 ? 'Every Mix It Up command the site expects was found' : `${n} Mix It Up command${n === 1 ? '' : 's'} missing`;
  $('commands-names').hidden = n < 1;
  $('commands-names').textContent = n < 1 ? '' : missing.join(', ');
}

// The live feed (59.5): the app sends the merged rows (src/home.ts mergeFeed), newest first. Home and Feed and history each keep their own filter.
const FILTER_KIND = { all: null, pulls: 'pull', events: 'event', jobs: 'job' }; // the same table as FEED_FILTERS in src/home.ts
const HOME_ROWS = 9; // what fits the dashboard at 1280 x 800
const feedFilter = { home: 'all', history: 'all' };
function renderFeed(which) {
  const rows = ((state.home && state.home.feed) || []).filter(r => !FILTER_KIND[feedFilter[which]] || r.kind === FILTER_KIND[feedFilter[which]]).slice(0, which === 'home' ? HOME_ROWS : 100);
  const list = document.querySelector(`.feed-list[data-feed="${which}"]`);
  document.querySelector(`.feed-empty[data-feed="${which}"]`).hidden = rows.length > 0;
  list.hidden = rows.length === 0;
  list.replaceChildren(...rows.map(feedRow)); // feedrow.js
}
for (const group of document.querySelectorAll('.filters')) {
  group.addEventListener('click', e => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    feedFilter[group.dataset.feed] = b.dataset.filter;
    for (const o of group.querySelectorAll('[data-filter]')) o.setAttribute('aria-pressed', String(o === b));
    if (state) renderFeed(group.dataset.feed);
  });
}

// "This stream" numbers: ready-made by the app (src/home.ts streamNumbers).
function renderNumbers() {
  const n = state.home && state.home.numbers;
  if (!n) return;
  $('num-pulls').textContent = n.pulls.toLocaleString('en-US');
  $('num-big').textContent = n.big.toLocaleString('en-US');
  $('num-spent').textContent = n.spent.toLocaleString('en-US');
  $('num-top').textContent = n.top ? n.top.viewer : '-';
  $('num-top-label').textContent = n.top ? `Top puller, ${n.top.pulls} pull${n.top.pulls === 1 ? '' : 's'}` : 'Top puller';
}

// The connection chips (59.5): a dot and a short state; a chip opens its Connections card. OBS and Stream Deck show only when in use.
const shortAgo = ms => { const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`; };
function setChip(id, kind, text) {
  const chip = $(id);
  chip.firstElementChild.className = 'dot' + (kind ? ' ' + kind : '');
  chip.lastElementChild.textContent = text;
}
function renderChips() {
  const svc = state.service;
  const site = svc ? svc.site : 'connecting';
  setChip('chip-site', site === 'connected' ? 'ok' : site === 'connecting' ? 'warn' : '', site === 'connected' ? (svc.lastPollAt ? shortAgo(svc.lastPollAt) : 'Connected') : site === 'revoked' ? 'Sign in again' : site === 'offline' ? 'Offline' : 'Connecting');
  const found = !!(svc && svc.mix.found);
  setChip('chip-mix', found ? 'ok' : '', found ? 'Connected' : 'API off');
  const obs = svc && svc.obs;
  $('chip-obs').hidden = !(obs && obs.enabled);
  if (obs && obs.enabled) setChip('chip-obs', obs.connected ? 'ok' : '', obs.connected ? (obs.streaming ? 'Live' : 'Connected') : 'Not connected');
  const d = state.deck;
  $('chip-deck').hidden = !(d && d.installed);
  if (d && d.installed) setChip('chip-deck', d.connected && d.on ? 'ok' : d.on ? 'warn' : 'off', d.connected && d.on ? 'Connected' : d.on ? 'Not connected' : 'Off');
  const tw = state.twitch;
  const twOn = !!(tw && (tw.state !== 'off' || tw.why === 'ended' || tw.why === 'site')); // quiet while no channel is connected on the site
  $('chip-twitch').hidden = !twOn;
  if (twOn) setChip('chip-twitch', tw.state === 'connected' && !tw.why ? 'ok' : tw.state === 'off' ? '' : 'warn', tw.state === 'connected' ? (tw.testing ? 'Listening (testing)' : 'Listening') : tw.state === 'off' ? 'Needs attention' : 'Reconnecting');
}
for (const [chip, conn] of [['chip-site', 'account'], ['chip-mix', 'mix'], ['chip-obs', 'obs'], ['chip-deck', 'deck'], ['chip-twitch', 'twitch']]) $(chip).addEventListener('click', () => goTo('conn-' + conn));

const HOTKEYS = ['refresh', 'pause', 'lastBuff'];
let hotkeysFilled = false;
let buttonsKey = '';

function renderControl() {
  const c = state.control;
  for (const id of ['control', 'buttons-wrap']) $(id).hidden = !c;
  if (!c) return;
  setDot('pulls-dot', c.paused === null ? 'off' : c.paused ? 'warn' : 'ok');
  $('pulls-state').textContent = c.paused === null ? 'Not known yet' : c.paused ? 'Paused' : 'Open';
  $('control-pause').textContent = c.paused ? 'Resume pulls' : 'Pause pulls';
  $('control-pause').disabled = c.paused === null;
  setDot('awards-dot', c.awardsPaused === null ? 'off' : c.awardsPaused ? 'warn' : 'ok');
  $('awards-state').textContent = c.awardsPaused === null ? 'Not known yet' : c.awardsPaused ? 'Paused' : 'On';
  $('control-awards').textContent = c.awardsPaused ? 'Resume channel point awards' : 'Pause channel point awards';
  $('control-awards').disabled = c.awardsPaused === null;
  const byScene = c.paused && typeof c.reason === 'string' && c.reason.startsWith('scene ');
  $('control-reason').hidden = !byScene;
  $('control-reason').textContent = byScene ? 'Paused by scene: ' + c.reason.slice(6) : '';
  if (c.last) $('control-last').textContent = c.last;
  renderHappy();
  $('control-error').textContent = c.error;
  if (!hotkeysFilled) { // once; later renders must not overwrite what is being typed
    hotkeysFilled = true;
    for (const k of HOTKEYS) $('hk-' + k).value = c.hotkeys[k] || '';
  }
  for (const k of HOTKEYS) $('hk-' + k + '-error').textContent = c.hotkeyErrors[k] || '';
  const key = JSON.stringify(c.buttons);
  if (key === buttonsKey) return;
  buttonsKey = key;
  $('control-buttons').querySelector('tbody').replaceChildren(...c.buttons.map((b, i) => {
    const tr = document.createElement('tr');
    const name = document.createElement('td');
    name.textContent = b.label;
    const url = document.createElement('td');
    url.textContent = b.url;
    url.className = 'small muted';
    const act = document.createElement('td');
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn plain';
    copy.textContent = 'Copy';
    copy.addEventListener('click', async () => {
      const r = await window.bridge.copyButton(i);
      $('control-copy-result').textContent = r.text;
      $('control-copy-result').className = 'result ' + (r.ok ? 'ok' : 'fail');
    });
    act.append(copy);
    tr.append(name, url, act);
    return tr;
  }));
}

// What's new: a card on the About page for the run after an update; main says when the window was first shown, and the page then opens once at that card.
let whatsNewDone = false; // the notes were loaded
let whatsNewOpened = false;
async function loadWhatsNew() {
  if (whatsNewDone) return;
  $('whatsnew-status').textContent = 'Loading the release notes';
  $('whatsnew-fail').hidden = true;
  $('whatsnew-empty').hidden = true;
  const r = await window.bridge.whatsNew();
  $('whatsnew-status').textContent = '';
  $('whatsnew-fail').hidden = r.ok;
  if (!r.ok) return;
  $('whatsnew-empty').hidden = r.notes.length > 0; // not remembered as done, so opening the tab again looks again
  whatsNewDone = r.notes.length > 0;
  $('whatsnew-notes').replaceChildren(...r.notes.map(n => {
    const box = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'plain-title';
    title.textContent = `Version ${n.version}`;
    box.append(title);
    let list = null;
    for (const b of n.blocks) {
      if (b.kind === 'bullet') {
        if (!list) { list = document.createElement('ul'); box.append(list); }
        const li = document.createElement('li');
        li.textContent = b.text;
        list.append(li);
        continue;
      }
      list = null;
      const el = document.createElement(b.kind === 'heading' ? 'h4' : 'p');
      el.textContent = b.text;
      if (b.kind === 'text') el.className = 'muted';
      box.append(el);
    }
    return box;
  }));
}

/** What's new card, status pill and "Updated to" toast. */
function renderStatus() {
  $('whatsnew-card').hidden = !state.whatsNew;
  if (state.whatsNew && state.whatsNew.open && !whatsNewOpened) { whatsNewOpened = true; goToCard('whatsnew-card'); }
  renderPill();
  renderToast();
}

// The status pill (59.3): the app sends the items (src/status.ts); a row is text, a short why and one button.
const pill = $('status-pill');
const pop = $('status-pop');
const setPop = open => { pop.hidden = !open; pill.setAttribute('aria-expanded', String(open)); };
pill.addEventListener('click', () => setPop(pop.hidden));
document.addEventListener('click', e => { if (!pop.hidden && !e.target.closest('.tb-status')) setPop(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { setPop(false); pill.focus(); } });
$('status-pop').addEventListener('focusout', e => { if (e.relatedTarget && !e.relatedTarget.closest('.tb-status')) setPop(false); });

/** Takes the streamer to the card that fixes an item: its tab opens, the card scrolls into view and gets the focus. */
function goToCard(id) {
  const card = $(id);
  if (!card) return;
  const panel = card.closest('[data-panel]');
  if (panel) showTab(panel.dataset.panel);
  card.scrollIntoView({ block: 'center' });
  card.tabIndex = -1;
  card.focus({ preventScroll: true });
}

/** Where a status pill Fix, a Home chip or a link goes: 'conn-<id>' opens the Connections page on that connection, 'connect' is the Connect screen's code field, anything else is a card id. */
function goTo(id) {
  if (id === 'connect') { $('code').focus(); return; }
  const conn = (state && state.connections || []).find(r => 'conn-' + r.id === id);
  if (!conn) { goToCard(id); return; }
  showTab('connections');
  selectConn(conn.id);
  $(conn.id + '-title').focus();
}

async function fixItem(item, button) {
  if (item.fix === 'restart') { window.bridge.restartToUpdate(); return; }
  if (item.fix === 'goto') { setPop(false); goTo(item.go); return; }
  button.disabled = true;
  $('status-result').className = 'result';
  $('status-result').textContent = 'Working...';
  try {
    const r = await window.bridge.checkUpdate();
    $('status-result').textContent = r.text;
    $('status-result').className = 'result ' + (r.ok ? 'ok' : 'fail');
  } catch {
    $('status-result').textContent = 'Something went wrong';
    $('status-result').className = 'result fail';
  }
  button.disabled = false;
}

let attentionKey = '';
function renderPill() {
  const items = state.attention || [];
  const n = items.length;
  setDot('status-dot', n ? 'warn' : 'ok');
  const text = n === 0 ? 'All good' : n === 1 ? '1 thing needs you' : `${n} things need you`;
  $('status-text').textContent = text;
  pill.setAttribute('aria-label', `Status: ${text}. Show the list`);
  $('status-empty').hidden = n > 0;
  const key = JSON.stringify(items);
  if (key === attentionKey) return;
  attentionKey = key;
  if (!n) $('status-result').textContent = '';
  $('status-items').replaceChildren(...items.map(item => {
    const li = document.createElement('li');
    const box = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = item.text;
    const why = document.createElement('small');
    why.textContent = item.detail;
    box.append(title, why);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn plain';
    button.textContent = item.button;
    button.setAttribute('aria-label', `${item.button}: ${item.text}`);
    button.addEventListener('click', () => { void fixItem(item, button); });
    li.append(box, button);
    return li;
  }));
}

// "Updated to x" shows once as a toast for a few seconds, only while the window is on screen; it counts as seen when it goes.
let toastTimer = 0;
function endToast() {
  clearTimeout(toastTimer);
  toastTimer = 0;
  $('toast').hidden = true;
  void window.bridge.dismissUpdated();
}
function renderToast() {
  const shown = !!state.updatedTo;
  $('toast').hidden = !shown;
  if (!shown) { clearTimeout(toastTimer); toastTimer = 0; return; }
  $('toast-version').textContent = state.updatedTo;
  if (!toastTimer && !document.hidden) toastTimer = setTimeout(endToast, 8000);
}
document.addEventListener('visibilitychange', () => { if (state) renderToast(); });
$('toast-link').addEventListener('click', () => { if (state && state.whatsNew) goToCard('whatsnew-card'); else window.bridge.openRelease(); endToast(); });

// Pause pulls on scenes (57.2): the scenes OBS reported, plus any saved one OBS no longer lists, each with a checkbox.
let scenePauseKey = '';
function saveScenePause() {
  const scenes = [...$('scene-pause-list').querySelectorAll('input')].filter(i => i.checked).map(i => i.value);
  window.bridge.setScenePause({ on: $('scene-pause-on').checked, scenes });
}
function renderScenePause() {
  const sp = state.scenePause;
  if (!sp) return;
  $('scene-pause-on').checked = sp.on;
  const names = [...new Set([...sp.obsScenes, ...sp.scenes])];
  $('scene-pause-empty').hidden = names.length > 0;
  $('scene-pause-empty').textContent = 'No scenes yet. Connect TCG Bridge to OBS (Connections page, OBS) and they appear here.';
  const key = JSON.stringify([names, sp.scenes, sp.obsScenes]);
  if (key === scenePauseKey) return;
  scenePauseKey = key;
  $('scene-pause-list').replaceChildren(...names.map(name => {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = name;
    box.checked = sp.scenes.includes(name);
    box.addEventListener('change', saveScenePause);
    label.append(box, document.createTextNode(sp.obsScenes.includes(name) ? name : name + ' (not in OBS now)'));
    li.append(label);
    return li;
  }));
}
$('scene-pause-on').addEventListener('change', saveScenePause);

// Live stats in OBS (57.4): one drop-down per stat, listing the text sources OBS reported plus a saved one OBS no longer lists.
let obsStatsKey = '';
function saveObsStats() {
  const map = {};
  for (const sel of $('obs-stats-list').querySelectorAll('select')) map[sel.dataset.stat] = sel.value;
  window.bridge.setObsStats(map);
}
function renderObsStats() {
  const os = state.obsStats;
  if (!os) return;
  $('obs-stats-empty').hidden = os.texts.length > 0;
  $('obs-stats-empty').textContent = 'No text sources yet. Connect TCG Bridge to OBS (Connections page, OBS) and add a text source to a scene, and they appear here.';
  const key = JSON.stringify([os.texts, os.map]);
  if (key === obsStatsKey) return;
  obsStatsKey = key;
  $('obs-stats-list').replaceChildren(...os.stats.map(({ id, label }) => {
    const li = document.createElement('li');
    const row = document.createElement('label');
    const sel = document.createElement('select');
    sel.dataset.stat = id;
    const names = [...new Set([...os.texts, ...(os.map[id] ? [os.map[id]] : [])])];
    for (const [value, text] of [['', 'Not shown'], ...names.map(n => [n, os.texts.includes(n) ? n : n + ' (not in OBS now)'])]) {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = text;
      sel.append(o);
    }
    sel.value = os.map[id] || '';
    sel.addEventListener('change', saveObsStats);
    row.append(document.createTextNode(label + ' '), sel);
    li.append(row);
    return li;
  }));
}

// The Stream Deck plugin (57.13): connected or not, the switch, Install and the once-only update offer, all on the Connections page.
function renderDeck() {
  const d = state.deck;
  if (!d) return;
  $('deck-app').textContent = d.found ? 'Found' : 'Not found';
  $('deck-plugin').textContent = d.installed ? `Installed (${d.installed})` : 'Not installed';
  $('deck-on').checked = d.on;
  $('deck-error').textContent = d.error;
  $('deck-offer').hidden = !d.offer;
  $('deck-offer-dismiss').hidden = !d.offer;
  $('deck-install-label').textContent = d.offer ? 'Update the Stream Deck plugin' : d.installed ? 'Reinstall Stream Deck plugin' : 'Install Stream Deck plugin';
}

// The Twitch channel (58.2): which account, since when, the last event and each subscription. textContent only.
function renderTwitch() {
  const t = state.twitch;
  const clock = ms => (ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'none yet');
  $('twitch-testing').hidden = !(t && t.testingLine);
  $('twitch-testing').textContent = t ? t.testingLine : '';
  $('twitch-login').textContent = t && t.login ? t.login : 'Not connected';
  $('twitch-since').textContent = t && t.state === 'connected' ? clock(t.since) : 'Not listening';
  $('twitch-last').textContent = t ? clock(t.lastEventAt) : 'none yet';
  const subs = t ? t.subs : [];
  $('twitch-subs-empty').hidden = subs.length > 0;
  $('twitch-subs').replaceChildren(...subs.map(s => { const li = document.createElement('li'); li.textContent = `${s.type}: ${s.status === 'enabled' ? 'on' : s.status}${s.error ? ` (${s.error})` : ''}`; return li; }));
}

function render() {
  if (!state) return;
  const svc = state.service;
  $('version').textContent = `v${state.appVersion}`;
  const about = $('about-version'); // "Version 0.12.0, built from <sha> (PR #N) on <date>", the sha opens the commit on GitHub; "dev build" in a dev run
  const aboutKey = JSON.stringify(state.about);
  if (about.dataset.key !== aboutKey) {
    about.dataset.key = aboutKey;
    const { head, sha, tail } = state.about ?? { head: `Version ${state.appVersion}, dev build`, sha: '', tail: '' }; // the demo state has none
    about.replaceChildren(head);
    if (sha) {
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = sha;
      link.addEventListener('click', e => { e.preventDefault(); window.bridge.openCommit(); });
      about.append(link, tail);
    }
  }
  $('connect').hidden = state.paired; // the first-run Connect screen takes the whole window until this PC is paired
  $('main-body').hidden = !state.paired;
  $('status').hidden = !state.paired;
  $('autostart').checked = state.startWithWindows;
  $('update').textContent = state.update || 'No update waiting.';
  $('restart-update').hidden = !state.updateVersion;
  $('alerts').checked = state.alerts;
  $('mix-autostart').checked = state.mixItUp.startWithBridge;
  $('feed-on').checked = state.tools.feed.on;
  $('feed-top').checked = state.tools.feed.onTop;
  $('feed-mute').checked = state.tools.feed.muted;
  $('feed-stars').value = String(state.tools.feed.minStars);
  if (document.activeElement !== $('feed-volume')) $('feed-volume').value = String(Math.round(state.tools.feed.volume * 100)); // not while it is being dragged
  $('summary-on').checked = state.tools.summary;
  $('obs-autostart').checked = state.tools.startObs;
  $('obs-path').textContent = state.tools.obsPath;
  renderStatus();
  renderFeed('history');
  renderControl();
  renderDeck();
  renderTwitch();
  renderScenePause();
  renderObsStats();
  const level = svc ? svc.tray : 'offline';
  setDot('rail-dot', level === 'connected' ? 'ok' : level === 'partly' ? 'warn' : '');
  $('rail-text').textContent = state.paired ? TRAY_TEXT[level] : 'Not paired';
  const pc = state.pcName && state.pcName !== state.pairedAs ? `PC: ${state.pcName}` : '';
  $('rail-pc').textContent = state.paired ? [state.account, pc].filter(Boolean).join(', ') : pc;
  if (!state.paired) {
    if (!$('site').value) $('site').value = state.site;
    renderConnect(!!(svc && svc.site === 'revoked'));
    return;
  }
  const site = svc ? svc.site : 'connecting';
  $('site-url').textContent = state.site;
  $('paired-as').textContent = state.account;
  $('last-poll').textContent = svc && svc.lastPollAt ? ago(svc.lastPollAt) : 'not yet';
  $('account-text').textContent = `${state.linked ? `Signed in with Twitch on ${state.site}` : `Paired with ${state.site} as ${state.pairedAs}`}. ${SITE_TEXT[site]}${svc && svc.siteError && site !== 'revoked' ? ` (${svc.siteError})` : ''}.`;
  unpairWord = state.linked ? 'Sign out' : 'Unpair';
  if (!unpairTimer) $('unpair-label').textContent = unpairWord;
  $('unpair-help').textContent = state.linked
    ? 'Signing out makes this PC forget its key and brings back the Connect screen; sign in with Twitch again to use it. The site is not told: to remove this PC there too, an admin presses Unlink on the Mix It Up page, Connection tab. Your role is read from the site, so a role change shows here within a minute.'
    : "Unpairing makes this PC forget the site's key; the Connect screen comes back and Sign in with Twitch (or a new code from the site) sets it up again.";
  const found = !!(svc && svc.mix.found);
  $('mix-version').textContent = found ? svc.mix.version : '-';
  $('mix-currency').textContent = svc && svc.currency ? svc.currency : 'The site chooses it; shown after the first job';
  $('mix-path').textContent = state.mixItUp.path;
  if (!nameFilled && svc && svc.channel) { // the channel name from the site, once; later renders must not overwrite what is being typed
    nameFilled = true;
    if (!$('test-name').value) $('test-name').value = svc.channel.toLowerCase();
  }
  renderObs(svc && svc.obs, state.obsSettings);
  renderConnections();
  renderChecklist(state.checklist);
  renderCommands(state.commandsMissing);
  renderChips();
  renderNumbers();
  renderFeed('home');
}

// The sidebar (59.4): one page at a time. A page is a button with data-tab and a section with the same data-panel.
function showTab(name) {
  for (const b of document.querySelectorAll('.rail-btn')) {
    if (b.dataset.tab === name) { b.setAttribute('aria-current', 'page'); $('page-title').textContent = b.querySelector('.rail-label').textContent; } else b.removeAttribute('aria-current');
  }
  for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== name;
  if (name === 'about' && state && state.whatsNew) void loadWhatsNew();
}
for (const b of document.querySelectorAll('.rail-btn')) b.addEventListener('click', () => showTab(b.dataset.tab));
$('win-min').addEventListener('click', () => window.bridge.minimize());
$('win-close').addEventListener('click', () => window.bridge.closeToTray());

// The Connect screen (59.6, 58.0b): Sign in with Twitch is the way in; the pairing code form hides behind a link. `signIn` in the state is the poll's progress (null = idle).
let showPair = false;
function renderConnect(revoked) {
  const v = state.signIn;
  const phase = v ? v.phase : 'idle';
  const waiting = phase === 'starting' || phase === 'waiting' || phase === 'allowed';
  const failed = phase === 'denied' || phase === 'expired' || phase === 'error';
  $('revoked-note').hidden = !revoked || waiting;
  $('signin-idle').hidden = showPair || waiting || failed;
  $('signin-wait').hidden = !waiting;
  $('signin-result').hidden = !failed;
  $('pair-block').hidden = !showPair || waiting || failed;
  $('signin-code').textContent = phase === 'waiting' ? v.code : '';
  $('signin-wait-text').textContent = phase === 'waiting' ? 'Check the site shows this code:' : phase === 'allowed' ? 'Signed in. Opening TCG Bridge...' : 'Asking the site for a sign-in...';
  $('signin-note').textContent = phase === 'waiting' ? [v.note, 'Your browser opened on the TCG site. Sign in there and press Allow. This waits up to 10 minutes.'].filter(Boolean).join(' ') : '';
  $('signin-message').textContent = phase === 'expired' ? 'That sign-in took too long.' : failed ? v.message : '';
}
$('signin-btn').addEventListener('click', async () => {
  $('signin-error').textContent = '';
  const r = await window.bridge.signIn($('site').value);
  if (!r.ok) $('signin-error').textContent = r.error || 'Could not start signing in';
});
$('signin-retry').addEventListener('click', async () => {
  const r = await window.bridge.signIn($('site').value);
  if (!r.ok) $('signin-message').textContent = r.error || 'Could not start signing in';
});
$('signin-cancel').addEventListener('click', () => { void window.bridge.cancelSignIn(); });
$('show-pair').addEventListener('click', () => { showPair = true; render(); });
$('hide-pair').addEventListener('click', () => { showPair = false; render(); });

$('pair-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('pair-btn').disabled = true;
  $('pair-error').textContent = '';
  const r = await window.bridge.pair($('site').value, $('code').value);
  $('pair-btn').disabled = false;
  if (r.ok) $('code').value = '';
  else $('pair-error').textContent = r.error || 'Pairing failed';
});
async function saveObs(password) {
  $('obs-error').textContent = '';
  const r = await window.bridge.setObs($('obs-on').checked, $('obs-address').value, password, $('obs-replay').checked);
  if (r.ok) { $('obs-password').value = ''; $('obs-address').value = $('obs-address').value.trim(); }
  else $('obs-error').textContent = r.error || 'Could not save';
}
$('obs-form').addEventListener('submit', e => { e.preventDefault(); void saveObs($('obs-password').value || undefined); });
$('obs-forget').addEventListener('click', () => { void saveObs(''); });
// Unpair asks twice (the site's ArmedButton way): the first press arms it for 4 seconds, the second unpairs.
let unpairTimer = 0;
let unpairWord = 'Unpair'; // "Sign out" for a PC signed in with Twitch (set in render)
function disarmUnpair() {
  clearTimeout(unpairTimer);
  unpairTimer = 0;
  $('unpair-label').textContent = unpairWord;
  $('unpair-result').textContent = '';
}
$('unpair').addEventListener('click', () => {
  if (unpairTimer) { disarmUnpair(); window.bridge.unpair(); return; }
  $('unpair-label').textContent = `Sure? ${unpairWord}`;
  $('unpair-result').textContent = `Press ${unpairWord} again within 4 seconds to ${unpairWord === 'Sign out' ? 'forget the sign-in' : 'forget the pairing'}.`;
  unpairTimer = setTimeout(disarmUnpair, 4000);
});
$('unpair').addEventListener('blur', disarmUnpair);
$('get-code').addEventListener('click', () => { void window.bridge.openPairPage($('site').value); });
for (const [button, go] of [['go-obs', 'conn-obs'], ['go-overlay', null], ['go-buttons', null]]) $(button).addEventListener('click', () => (go ? goTo(go) : showTab(button === 'go-overlay' ? 'overlay' : 'buttons')));
$('autostart').addEventListener('change', e => window.bridge.setStartWithWindows(e.target.checked));

$('alerts').addEventListener('change', e => window.bridge.setAlerts(e.target.checked));
$('deck-on').addEventListener('change', e => window.bridge.setStreamDeck(e.target.checked));
$('deck-offer-dismiss').addEventListener('click', () => window.bridge.dismissDeckOffer());
$('mix-autostart').addEventListener('change', e => window.bridge.setStartMixItUp(e.target.checked));
$('feed-on').addEventListener('change', e => window.bridge.setFeed({ on: e.target.checked }));
$('feed-top').addEventListener('change', e => window.bridge.setFeed({ onTop: e.target.checked }));
$('feed-mute').addEventListener('change', e => window.bridge.setFeed({ muted: e.target.checked }));
$('feed-stars').addEventListener('change', e => window.bridge.setFeed({ minStars: Number(e.target.value) }));
$('feed-volume').addEventListener('change', e => window.bridge.setFeed({ volume: Number(e.target.value) / 100 }));
$('summary-on').addEventListener('change', e => window.bridge.setSummary(e.target.checked));
$('obs-autostart').addEventListener('change', e => window.bridge.setStartObs(e.target.checked));
$('open-release').addEventListener('click', () => window.bridge.openReleases());
$('whatsnew-all').addEventListener('click', () => window.bridge.openReleases());
$('whatsnew-all-empty').addEventListener('click', () => window.bridge.openReleases());
$('restart-update').addEventListener('click', () => window.bridge.restartToUpdate());

// A button that runs an action in the app and writes the answer, in words, next to it.
function action(buttonId, resultId, call) {
  const button = $(buttonId);
  const result = $(resultId);
  button.addEventListener('click', async () => {
    button.disabled = true;
    result.className = 'result';
    result.textContent = 'Working...';
    try {
      const r = await call();
      result.textContent = r.text;
      result.className = 'result ' + (r.ok ? 'ok' : 'fail');
    } catch {
      result.textContent = 'Something went wrong';
      result.className = 'result fail';
    }
    button.disabled = false;
  });
}
action('test-mix', 'mix-result', () => window.bridge.testMixItUp($('test-name').value));
action('test-chat', 'mix-result', () => window.bridge.testChat());
action('test-obs', 'test-obs-result', () => window.bridge.testObs());
$('checklist-run').addEventListener('click', async () => {
  $('checklist-run').disabled = true;
  $('checklist-state').textContent = 'Checking...';
  try { await window.bridge.runChecklist(); } catch { /* the state comes back through onState */ }
  $('checklist-run').disabled = false;
  if (state) renderChecklist(state.checklist);
});
$('conns-run').addEventListener('click', async () => {
  $('conns-run').disabled = true;
  $('conns-run-result').className = 'result';
  $('conns-run-result').textContent = 'Checking...';
  try { await window.bridge.runChecklist(); } catch { /* the state comes back through onState */ }
  $('conns-run').disabled = false;
  const c = state && state.checklist;
  $('conns-run-result').textContent = c ? c.text : '';
  $('conns-run-result').className = 'result ' + (c && c.done ? 'ok' : 'fail');
});
action('mix-again', 'mix-again-result', () => window.bridge.testMixItUp($('test-name').value));
action('obs-again', 'obs-again-result', () => window.bridge.testObs());
action('mix-start', 'mix-result', () => window.bridge.startMixItUp());
action('mix-choose', 'mix-result', () => window.bridge.chooseMixItUp());
action('obs-choose', 'obs-choose-result', () => window.bridge.chooseObsExe());
action('open-logs', 'help-result', () => window.bridge.openLogs());
action('open-backups', 'backup-result', () => window.bridge.openBackups());
action('copy-diagnostics', 'help-result', () => window.bridge.copyDiagnostics());
action('check-update', 'update-result', () => window.bridge.checkUpdate());
action('clear-release-cache', 'update-result', async () => { const r = await window.bridge.clearReleaseCache(); whatsNewDone = false; return r; });
$('whatsnew-refresh').addEventListener('click', async () => {
  $('whatsnew-refresh').disabled = true;
  await window.bridge.clearReleaseCache();
  whatsNewDone = false;
  $('whatsnew-notes').replaceChildren();
  await loadWhatsNew();
  $('whatsnew-refresh').disabled = false;
});
action('deck-install', 'deck-install-result', () => window.bridge.installStreamDeck());

$('control-pause').addEventListener('click', async () => {
  const c = state && state.control;
  if (!c || c.paused === null) return;
  $('control-pause').disabled = true;
  const r = await window.bridge.setPause(!c.paused);
  $('control-pause').disabled = false;
  $('control-pause-result').textContent = r.text;
  $('control-pause-result').className = 'result ' + (r.ok ? 'ok' : 'fail');
});
$('control-awards').addEventListener('click', async () => {
  const c = state && state.control;
  if (!c || c.awardsPaused === null) return;
  $('control-awards').disabled = true;
  const r = await window.bridge.setPauseAwards(!c.awardsPaused);
  $('control-awards').disabled = false;
  $('control-awards-result').textContent = r.text;
  $('control-awards-result').className = 'result ' + (r.ok ? 'ok' : 'fail');
});
// Happy hour (57.3): the site keeps the end time; this only counts down to the `endsAt` it last sent. Home has the presets, Controls the custom form.
const clockText = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function renderHappy() {
  const h = state && state.control && state.control.happy;
  const left = h ? h.endsAt - Date.now() : 0;
  const text = h && left > 0 ? `${h.what}, ${clockText(left)} left` : 'No happy hour is running.';
  $('happy-now').textContent = h && left > 0 ? `Happy hour: ${text}` : text;
  $('home-happy-now').textContent = text;
  $('happy-end').disabled = $('home-happy-end').disabled = !(h && left > 0);
}
setInterval(renderHappy, 1000);
$('happy-kind').addEventListener('change', () => { $('happy-percent-label').hidden = $('happy-kind').value !== 'discount'; });
const happyResult = r => {
  for (const id of ['happy-result', 'home-happy-result']) { $(id).textContent = r.text; $(id).className = 'result ' + (r.ok ? 'ok' : 'fail'); }
};
$('happy-form').addEventListener('submit', async e => {
  e.preventDefault();
  happyResult(await window.bridge.happyStart($('happy-minutes').value, $('happy-kind').value, $('happy-percent').value));
});
for (const id of ['happy-end', 'home-happy-end']) $(id).addEventListener('click', async () => happyResult(await window.bridge.happyEnd()));
for (const b of document.querySelectorAll('.happy-preset')) b.addEventListener('click', async () => happyResult(await window.bridge.happyStart(b.dataset.minutes, b.dataset.kind, b.dataset.percent)));
$('happy-custom-go').addEventListener('click', () => goToCard('card-happy-custom'));
$('hotkey-form').addEventListener('submit', e => {
  e.preventDefault();
  const map = {};
  for (const k of HOTKEYS) map[k] = $('hk-' + k).value;
  void window.bridge.setHotkeys(map);
});

// The queue card (59.5) is read while Home is on screen (at most every 5 seconds; the app throttles too). It shows the first rows and "and N more".
const QUEUE_ROWS = 4;
async function loadQueue() {
  if (document.hidden || !state || !state.paired || $('status').hidden || document.querySelector('[data-panel="home"]').hidden) return;
  const r = await window.bridge.getQueue();
  if (!r.ok) { $('queue-result').textContent = r.text; $('queue-result').className = 'result fail'; }
  $('queue-empty').hidden = r.rows.length > 0;
  $('queue').hidden = r.rows.length === 0;
  $('queue-count').textContent = r.rows.length ? `${r.rows.length} waiting` : 'Nothing waiting';
  $('queue-more').hidden = r.rows.length <= QUEUE_ROWS;
  $('queue-more').textContent = `and ${r.rows.length - QUEUE_ROWS} more`;
  $('queue').querySelector('tbody').replaceChildren(...r.rows.slice(0, QUEUE_ROWS).map(row => {
    const tr = document.createElement('tr');
    for (const text of [row.username, row.pack, `${row.waitedS} s`]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    return tr;
  }));
}
setInterval(() => { void loadQueue(); }, 5000);
action('queue-skip', 'queue-result', async () => { const r = await window.bridge.queueDo('skip'); void loadQueue(); return r; });
action('queue-clear', 'queue-result', async () => { const r = await window.bridge.queueDo('clear'); void loadQueue(); return r; });

// ── Staff tab (55.12): shown only when the site says this PC has staff tools; reads only while the tab is open, at most every 5 seconds ──
let staffState = null;
let staffViewer = ''; // the viewer the card shows; '' = the search is showing
const staffTabOpen = () => !!state && state.staff && ['viewers', 'stream'].some(p => document.querySelector(`[data-panel="${p}"]`).hidden === false) && !document.hidden;
const staffAsk = req => window.bridge.staff(req);
const fill = (list, items) => list.replaceChildren(...items.map(text => { const o = document.createElement('option'); o.value = text; return o; }));

function renderStaff() {
  $('rail-staff-group').hidden = !(state && state.staff);
  // A role-limited account (58.0b) hides, not just disables, what it cannot do: data-staff lists the actions a block needs; staffCan null = everything.
  const can = state && Array.isArray(state.staffCan) ? state.staffCan : null;
  $('preview-card').hidden = !(state && state.staff) || (!!can && !can.includes('preview-url'));
  if (state && !state.staff && ['viewers', 'stream'].some(p => !document.querySelector(`[data-panel="${p}"]`).hidden)) showTab('home');
  for (const el of document.querySelectorAll('[data-staff]')) el.hidden = !!can && !el.dataset.staff.split(' ').some(a => can.includes(a));
  const s = staffState;
  if (!s) return;
  $('staff-extra-now').textContent = s.extra > 0 ? `Everyone gets ${s.extra} extra this stream.` : 'No extra pulls right now.';
  $('staff-trading').textContent = s.tradingPaused ? 'Resume trading' : 'Pause trading';
  $('staff-trading-now').textContent = s.tradingPaused ? 'Trading is paused.' : 'Trading is open.';
  const scenes = s.scenes || [];
  $('staff-scene-row').hidden = !scenes.length; // no tiny empty select: the empty state shows instead
  $('staff-scene-empty').hidden = scenes.length > 0;
  if ($('staff-scene').dataset.key !== scenes.join('|')) {
    $('staff-scene').dataset.key = scenes.join('|');
    $('staff-scene').replaceChildren(...scenes.map(name => { const o = document.createElement('option'); o.value = name; o.textContent = name; return o; }));
  }
  if (!$('staff-variant').options.length && Array.isArray(s.variants)) {
    $('staff-variant').replaceChildren(...s.variants.map(v => { const o = document.createElement('option'); o.value = v.id; o.textContent = v.label; return o; }));
  }
  const noVariants = !$('staff-variant').options.length;
  $('staff-variant').hidden = noVariants;
  $('staff-variant-empty').hidden = !noVariants;
}

async function loadStaff() {
  if (!staffTabOpen()) return;
  const r = await staffAsk({ op: 'state' });
  if (r.ok && r.data) { staffState = r.data; renderStaff(); }
}
for (const b of document.querySelectorAll('.rail-btn')) b.addEventListener('click', () => { void loadStaff(); });
setInterval(() => { void loadStaff(); }, 5000);

let cardTimer;
$('staff-card').addEventListener('input', () => {
  clearTimeout(cardTimer);
  cardTimer = setTimeout(async () => {
    const q = $('staff-card').value.trim();
    if (q.length < 2 || q.startsWith('#')) return;
    const r = await staffAsk({ op: 'cards', q });
    if (!r.ok) say('staff-viewer-result', r); // a role that may not search cards hears why
    if (r.ok && r.data && Array.isArray(r.data.cards)) fill($('staff-cards'), r.data.cards.map(c => `#${c.number} ${c.name}`));
  }, 300);
});
/** "#12 Gouda Goat" or "12" -> the card number, else null. */
const cardNumber = () => { const m = /^#?(\d+)\b/.exec($('staff-card').value.trim()); return m ? Number(m[1]) : null; };

/** A staff action; when no overlay is connected the site asks first, and the streamer is asked here. */
async function staffDo(body) {
  let r = await staffAsk({ op: 'do', ...body });
  if (!r.ok && r.data && r.data.needsForce && window.confirm(`${r.text}\n\nQueue it anyway?`)) r = await staffAsk({ op: 'do', ...body, force: true });
  void loadStaff();
  return r;
}

// Find a viewer (59.7): matching names as a list of buttons; picking one opens the viewer card.
let findTimer;
let findSeq = 0;
function say(id, r) { $(id).textContent = r.ok ? '' : r.text; $(id).className = 'result ' + (r.ok ? '' : 'fail'); }
async function runFind() {
  const q = $('staff-name').value.trim();
  const seq = ++findSeq;
  const r = q ? await staffAsk({ op: 'find', q }) : { ok: true, text: '', data: { names: [] } };
  if (seq !== findSeq) return; // a newer keystroke is already being looked up
  say('staff-find-result', r);
  const names = r.ok && r.data && Array.isArray(r.data.names) ? r.data.names : [];
  $('staff-found-empty').hidden = names.length > 0;
  $('staff-found-empty').textContent = q ? 'No viewer matches that name.' : 'Type a Twitch name to find a viewer.';
  $('staff-found').replaceChildren(...names.map(name => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn plain';
    b.textContent = name;
    b.addEventListener('click', () => { void openViewer(name); });
    li.append(b);
    return li;
  }));
}
$('staff-name').addEventListener('input', () => { clearTimeout(findTimer); findTimer = setTimeout(() => { void runFind(); }, 150); });
$('staff-name').addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(findTimer); const first = $('staff-found').querySelector('button'); if (first) first.click(); else void runFind(); } });
for (const b of document.querySelectorAll('.rail-btn')) b.addEventListener('click', () => { if (b.dataset.tab === 'viewers' && !staffViewer) void runFind(); });

/** Fills the viewer card from a viewer read (facts come ready-made from the app). */
function paintViewer(d) {
  staffViewer = d.username;
  $('staff-viewer-title').textContent = d.username;
  $('staff-viewer').replaceChildren(...(d.facts || []).flatMap(([k, v]) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; return [dt, dd]; }));
  $('staff-block').hidden = d.blocked === true;
  $('staff-unblock').hidden = d.blocked !== true;
}
async function openViewer(name) {
  const r = await staffAsk({ op: 'viewer', name });
  if (!r.ok || !r.data) return say('staff-find-result', r);
  showViewer(r.data);
}
function showViewer(d) {
  paintViewer(d);
  $('staff-viewer-result').textContent = '';
  $('staff-viewer-result').className = 'result';
  $('staff-find').hidden = true;
  $('staff-viewer-card').hidden = false;
  $('staff-viewer-title').focus(); // the heading names the viewer for a screen reader
}
async function refreshViewer() {
  const r = await staffAsk({ op: 'viewer', name: staffViewer });
  if (r.ok && r.data) paintViewer(r.data);
}
$('staff-clear').addEventListener('click', () => {
  staffViewer = '';
  $('staff-viewer-card').hidden = true;
  $('staff-find').hidden = false;
  $('staff-name').value = '';
  $('staff-card').value = '';
  void runFind();
  $('staff-name').focus();
});

/** An action on the chosen viewer; the card's facts are read again after it so they stay true. */
async function viewerDo(body) {
  const r = await staffDo({ ...body, username: staffViewer });
  if (r.ok) await refreshViewer();
  return r;
}
action('staff-admin', 'staff-viewer-result', async () => staffAsk({ op: 'open-admin', name: staffViewer }));
action('staff-gift', 'staff-viewer-result', () => viewerDo({ action: 'gift', count: Number($('staff-count').value) }));
action('staff-collection', 'staff-viewer-result', () => staffDo({ action: 'show-collection', username: staffViewer }));
action('staff-block', 'staff-viewer-result', () => viewerDo({ action: 'block', mode: $('staff-block-mode').value }));
action('staff-unblock', 'staff-viewer-result', () => viewerDo({ action: 'unblock' }));
action('staff-grant', 'staff-viewer-result', async () => {
  const n = cardNumber();
  return n === null ? { ok: false, text: 'Pick a card from the list.' } : viewerDo({ action: 'grant', cardNumber: n, variant: $('staff-variant').value });
});
action('staff-showcard', 'staff-viewer-result', async () => staffDo({ action: 'show-card', username: staffViewer, card: $('staff-card').value.trim().replace(/^(#\d+)\s.*$/, '$1') }));
action('staff-extra-set', 'staff-extra-result', () => staffDo({ action: 'stream-extra', amount: Number($('staff-extra').value) }));
action('staff-extra-clear', 'staff-extra-result', () => staffDo({ action: 'stream-extra', amount: 0 }));
action('staff-scene-go', 'staff-scene-result', async () => $('staff-scene').value ? staffAsk({ op: 'scene', name: $('staff-scene').value }) : { ok: false, text: 'OBS has no scenes yet.' });
$('preview-open').addEventListener('click', () => { void window.bridge.openPreview(); });
action('staff-trading', 'staff-trading-result', async () => { const r = await window.bridge.staffTrading(!(staffState && staffState.tradingPaused)); void loadStaff(); return r; });

// ── Shortcuts and Activity (55.13) ──
action('staff-backup', 'staff-backup-result', () => staffDo({ action: 'backup' }));

const listOf = (ul, rows) => ul.replaceChildren(...rows);
let searchTimer;
$('staff-search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const q = $('staff-search').value.trim();
    if (q.length < 2) { $('staff-search-empty').hidden = true; return listOf($('staff-search-results'), []); }
    const r = await staffAsk({ op: 'search', q });
    const found = r.ok && r.data && Array.isArray(r.data.results) ? r.data.results : [];
    say('staff-search-result', r);
    $('staff-search-empty').hidden = !r.ok || found.length > 0;
    listOf($('staff-search-results'), found.map(x => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn plain';
      b.textContent = `${x.label} (${x.hint})`;
      b.addEventListener('click', () => { void staffAsk({ op: 'open', href: x.href }); });
      li.append(b);
      return li;
    }));
  }, 300);
});

const activityTabOpen = () => !!state && state.staff && document.querySelector('[data-panel="feed"]').hidden === false && !document.hidden;
async function loadActivity() {
  if (!activityTabOpen()) return;
  const r = await staffAsk({ op: 'activity' });
  $('activity-result').textContent = r.ok ? '' : r.text;
  $('activity-result').className = 'result ' + (r.ok ? '' : 'fail');
  if (!r.ok) return;
  $('activity-empty').hidden = r.data.events.length > 0;
  listOf($('activity-list'), r.data.events.map(e => { const li = document.createElement('li'); li.textContent = e.text; return li; }));
}
for (const b of document.querySelectorAll('.rail-btn')) b.addEventListener('click', () => { void loadActivity(); void loadQueue(); });
setInterval(() => { void loadActivity(); }, 5000);

for (const kind of ['attention', 'feedback', 'refusal', 'deploy']) $('notice-' + kind).addEventListener('change', e => window.bridge.setNotice(kind, e.target.checked));
function renderNotices() {
  $('notice-card').hidden = !(state && state.staff);
  $('card-activity').hidden = !(state && state.staff); // the history is for everyone; only the staff activity is not
  if (state && state.notices) for (const kind of Object.keys(state.notices)) if ($('notice-' + kind)) $('notice-' + kind).checked = state.notices[kind];
}

window.bridge.onState(s => { state = s; render(); renderStaff(); renderNotices(); });
window.bridge.getState().then(s => { state = s; render(); renderStaff(); renderNotices(); });
setInterval(render, 5000); // keeps "5 seconds ago" honest
