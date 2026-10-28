// The window: draws the state main.js sends and sends the actions back. Text only (textContent), never HTML.
const $ = id => document.getElementById(id);
const SITE_TEXT = { connecting: 'Connecting', connected: 'Connected', offline: 'Cannot reach the site, trying again', revoked: 'Pair again' };
const TRAY_TEXT = { connected: 'All connected', partly: 'Partly connected', offline: 'Not connected' };

const time = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
  const on = !!(obs && obs.enabled);
  const up = on && obs.connected;
  setDot('obs-dot', up ? 'ok' : on ? '' : 'off');
  $('obs-state').textContent = !on ? 'Off. Open "OBS connection" below to switch it on.' : up ? (obs.streaming ? 'Connected, and the stream is live' : 'Connected') : `Not connected${obs && obs.error ? ` (${obs.error})` : ''}`;
  $('obs-scene').textContent = up && obs.scene ? obs.scene : '-';
  $('obs-stream').textContent = up ? (obs.streaming === null ? '-' : obs.streaming ? 'Live' : 'Not streaming') : '-';
  $('obs-overlay').textContent = up ? overlayText(obs.overlay, obs.scene) : '-';
}

// The pre-stream checklist (57.1): one line per check, a dot for green, red or grey.
const CHECK_DOT = { ok: 'ok', bad: '', muted: 'off' };
function renderChecklist(c) {
  setDot('checklist-dot', c ? (c.ready ? 'ok' : '') : 'off');
  $('checklist-state').textContent = c ? `${c.summary} (${ago(c.at)})` : 'Not run yet';
  $('checklist-lines').replaceChildren(...(c ? c.lines : []).map(l => {
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
setInterval(() => { if (state) renderChecklist(state.checklist); }, 15_000); // keeps "N seconds ago" honest

// The Mix It Up command check (57.8): one line, and the names to fix. null = the site has not said yet. Site text goes in with textContent only.
function renderCommands(missing) {
  const n = Array.isArray(missing) ? missing.length : -1;
  setDot('commands-dot', n < 0 ? 'off' : n === 0 ? 'ok' : 'warn');
  $('commands-state').textContent = n < 0 ? 'Not checked yet' : n === 0 ? 'Every command the site expects was found' : `${n} Mix It Up command${n === 1 ? '' : 's'} missing`;
  $('commands-names').hidden = n < 1;
  $('commands-names').textContent = n < 1 ? '' : missing.join(', ');
}

// The event feed (57.7): the last event rewards from the site, newest first. The app sends ready-made text lines.
function renderEvents(lines) {
  const rows = Array.isArray(lines) ? lines : [];
  $('events-empty').hidden = rows.length > 0;
  $('events-lines').replaceChildren(...rows.map(e => {
    const li = document.createElement('li');
    const when = document.createElement('span');
    when.textContent = e.time;
    const what = document.createElement('strong');
    what.textContent = e.event;
    const who = document.createElement('span');
    who.textContent = e.amount !== '-' ? `${e.viewer}, ${e.amount}` : e.viewer;
    const result = document.createElement('span');
    result.textContent = e.result;
    li.append(when, what, who, result);
    return li;
  }));
}

const HOTKEYS = ['refresh', 'pause', 'lastBuff'];
let hotkeysFilled = false;
let buttonsKey = '';

function renderControl() {
  const c = state.control;
  $('control-unpaired').hidden = state.paired;
  $('control').hidden = !state.paired || !c;
  if (!c) return;
  $('control-pause').checked = !!c.paused;
  $('control-pause').disabled = c.paused === null;
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

// What's new: the tab exists for the run after an update; main says when the window was first shown, and the tab then opens once.
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

function renderBanners() {
  $('rail-whatsnew').hidden = !state.whatsNew;
  if (state.whatsNew && state.whatsNew.open && !whatsNewOpened) { whatsNewOpened = true; showTab('whatsnew'); }
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

async function fixItem(item, button) {
  if (item.fix === 'restart') { window.bridge.restartToUpdate(); return; }
  if (item.fix === 'goto') { setPop(false); goToCard(item.go); return; }
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
$('toast-link').addEventListener('click', () => { if (state && state.whatsNew) showTab('whatsnew'); else window.bridge.openRelease(); endToast(); });

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
  $('scene-pause-empty').textContent = 'No scenes yet. Connect TCG Bridge to OBS (Status page) and they appear here.';
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
  $('obs-stats-empty').textContent = 'No text sources yet. Connect TCG Bridge to OBS (Status page) and add a text source to a scene, and they appear here.';
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

// The Stream Deck plugin (57.13): connected or not on the Status tab; the switch, Install and the once-only update offer in Settings.
function renderDeck() {
  const d = state.deck;
  if (!d) return;
  const up = d.on && !d.error && d.connected;
  setDot('deck-dot', up ? 'ok' : d.on && !d.error ? 'warn' : d.error ? '' : 'off');
  $('deck-state').textContent = d.error ? d.error : !d.on ? 'Off. Switch it on in Settings.' : up ? 'Plugin connected' : d.installed ? 'Not connected. Open the Stream Deck app.' : 'Not connected. The plugin is not installed yet.';
  $('deck-on').checked = d.on;
  $('deck-error').textContent = d.error;
  $('deck-offer').hidden = !d.offer;
  $('deck-offer-dismiss').hidden = !d.offer;
  $('deck-install-label').textContent = d.offer ? 'Update the Stream Deck plugin' : d.installed ? 'Reinstall Stream Deck plugin' : 'Install Stream Deck plugin';
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
  $('pairing').hidden = state.paired;
  $('status').hidden = !state.paired;
  $('unpair').hidden = !state.paired;
  $('account-text').textContent = state.paired ? `Paired with ${state.site} as ${state.pairedAs}.` : 'Not paired yet. Pair on the Status page.';
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
  renderBanners();
  renderControl();
  renderDeck();
  renderScenePause();
  renderObsStats();
  const level = svc ? svc.tray : 'offline';
  setDot('rail-dot', level === 'connected' ? 'ok' : level === 'partly' ? 'warn' : '');
  $('rail-text').textContent = state.paired ? TRAY_TEXT[level] : 'Not paired';
  if (!state.paired) {
    if (!$('site').value) $('site').value = state.site;
    $('pair-note').textContent = svc && svc.site === 'revoked'
      ? 'Pair again: the site no longer accepts this PC. On the site, open Admin > Mix It Up > Paid pulls, press "Pair TCG Bridge" and type the new code here.'
      : 'On the site, open Admin > Mix It Up > Paid pulls and press "Pair TCG Bridge". Type the code it shows here.';
    return;
  }
  const site = svc ? svc.site : 'connecting';
  setDot('site-dot', site === 'connected' ? 'ok' : site === 'connecting' ? 'warn' : '');
  $('site-url').textContent = state.site;
  $('paired-as').textContent = state.pairedAs;
  $('last-poll').textContent = svc && svc.lastPollAt ? ago(svc.lastPollAt) : 'not yet';
  $('site-state').textContent = SITE_TEXT[site] + (svc && svc.siteError && site !== 'revoked' ? ` (${svc.siteError})` : '');
  const found = !!(svc && svc.mix.found);
  setDot('mix-dot', found ? 'ok' : '');
  $('mix-state').textContent = found ? 'Connected, Developer API is on' : 'Not answering (Mix It Up is closed, or its Developer API is off)';
  $('mix-version').textContent = found ? svc.mix.version : '-';
  $('mix-currency').textContent = svc && svc.currency ? svc.currency : 'The site chooses it; shown after the first job';
  $('mix-help').hidden = found;
  $('mix-start').hidden = found;
  $('mix-path').textContent = state.mixItUp.path;
  if (!nameFilled && svc && svc.channel) { // the channel name from the site, once; later renders must not overwrite what is being typed
    nameFilled = true;
    if (!$('test-name').value) $('test-name').value = svc.channel.toLowerCase();
  }
  renderObs(svc && svc.obs, state.obsSettings);
  renderChecklist(state.checklist);
  renderEvents(state.events);
  renderCommands(state.commandsMissing);
  const jobs = svc ? svc.jobs : [];
  $('no-jobs').hidden = jobs.length > 0;
  $('jobs').hidden = jobs.length === 0;
  const body = document.querySelector('#jobs tbody');
  body.replaceChildren(...jobs.map(j => {
    const tr = document.createElement('tr');
    for (const [text, cls] of [[time(j.at)], [j.kind, 'pill'], [j.username || '-'], [j.detail, j.ok ? '' : 'fail']]) {
      const td = document.createElement('td');
      if (cls === 'pill') {
        const pill = document.createElement('span');
        pill.className = 'pill';
        pill.textContent = text;
        td.append(pill);
      } else {
        td.textContent = text;
        if (cls) td.className = cls;
      }
      tr.append(td);
    }
    return tr;
  }));
}

// The left rail: one panel at a time. More tabs (Staff, Activity) are a button with data-tab and a section with data-panel.
function showTab(name) {
  for (const b of document.querySelectorAll('.rail-btn')) {
    if (b.dataset.tab === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== name;
  if (name === 'whatsnew') void loadWhatsNew();
}
for (const b of document.querySelectorAll('.rail-btn')) b.addEventListener('click', () => showTab(b.dataset.tab));
$('win-min').addEventListener('click', () => window.bridge.minimize());
$('win-close').addEventListener('click', () => window.bridge.closeToTray());

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
$('unpair').addEventListener('click', () => window.bridge.unpair());
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

$('control-pause').addEventListener('change', async e => {
  const r = await window.bridge.setPause(e.target.checked);
  $('control-pause-result').textContent = r.text;
  $('control-pause-result').className = 'result ' + (r.ok ? 'ok' : 'fail');
});
// Happy hour (57.3): the site keeps the end time; this only counts down to the `endsAt` it last sent.
const clockText = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function renderHappy() {
  const h = state && state.control && state.control.happy;
  const left = h ? h.endsAt - Date.now() : 0;
  $('happy-now').textContent = h && left > 0 ? `Happy hour: ${h.what}, ${clockText(left)} left` : 'No happy hour is running.';
  $('happy-end').disabled = !(h && left > 0);
}
setInterval(renderHappy, 1000);
$('happy-kind').addEventListener('change', () => { $('happy-percent-label').hidden = $('happy-kind').value !== 'discount'; });
const happyResult = r => { $('happy-result').textContent = r.text; $('happy-result').className = 'result ' + (r.ok ? 'ok' : 'fail'); };
$('happy-form').addEventListener('submit', async e => {
  e.preventDefault();
  happyResult(await window.bridge.happyStart($('happy-minutes').value, $('happy-kind').value, $('happy-percent').value));
});
$('happy-end').addEventListener('click', async () => happyResult(await window.bridge.happyEnd()));
$('hotkey-form').addEventListener('submit', e => {
  e.preventDefault();
  const map = {};
  for (const k of HOTKEYS) map[k] = $('hk-' + k).value;
  void window.bridge.setHotkeys(map);
});

// The queue is read only while its section is open (at most every 5 seconds; the app throttles too).
async function loadQueue() {
  if (!$('queue-box').open || document.hidden) return;
  const r = await window.bridge.getQueue();
  if (!r.ok) { $('queue-result').textContent = r.text; $('queue-result').className = 'result fail'; }
  $('queue-empty').hidden = r.rows.length > 0;
  $('queue').hidden = r.rows.length === 0;
  $('queue').querySelector('tbody').replaceChildren(...r.rows.map(row => {
    const tr = document.createElement('tr');
    for (const text of [row.username, row.pack, `${row.waitedS} s`]) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.append(td);
    }
    return tr;
  }));
}
$('queue-box').addEventListener('toggle', () => { void loadQueue(); });
setInterval(() => { void loadQueue(); }, 5000);
action('queue-skip', 'queue-result', async () => { const r = await window.bridge.queueDo('skip'); void loadQueue(); return r; });
action('queue-clear', 'queue-result', async () => { const r = await window.bridge.queueDo('clear'); void loadQueue(); return r; });

// ── Staff tab (55.12): shown only when the site says this PC has staff tools; reads only while the tab is open, at most every 5 seconds ──
let staffState = null;
let staffUsersAt = 0;
const staffTabOpen = () => !!state && state.staff && document.querySelector('[data-panel="staff"]').hidden === false && !document.hidden;
const staffAsk = req => window.bridge.staff(req);
const staffName = () => $('staff-name').value;
const fill = (list, items) => list.replaceChildren(...items.map(text => { const o = document.createElement('option'); o.value = text; return o; }));

function renderStaff() {
  $('rail-staff').hidden = !(state && state.staff);
  $('preview-card').hidden = !(state && state.staff);
  if (state && !state.staff && !document.querySelector('[data-panel="staff"]').hidden) showTab('status');
  const s = staffState;
  if (!s) return;
  $('staff-extra-now').textContent = s.extra > 0 ? `Everyone gets ${s.extra} extra this stream.` : 'No extra pulls right now.';
  $('staff-trading').textContent = s.tradingPaused ? 'Open trading' : 'Pause trading';
  $('staff-trading-now').textContent = s.tradingPaused ? 'Trading is paused.' : 'Trading is open.';
  const scenes = s.scenes || [];
  if ($('staff-scene').dataset.key !== scenes.join('|')) {
    $('staff-scene').dataset.key = scenes.join('|');
    $('staff-scene').replaceChildren(...scenes.map(name => { const o = document.createElement('option'); o.value = name; o.textContent = name; return o; }));
  }
  if (!$('staff-variant').options.length && Array.isArray(s.variants)) {
    $('staff-variant').replaceChildren(...s.variants.map(v => { const o = document.createElement('option'); o.value = v.id; o.textContent = v.label; return o; }));
  }
}

async function loadStaff() {
  if (!staffTabOpen()) return;
  const r = await staffAsk({ op: 'state' });
  if (r.ok && r.data) { staffState = r.data; renderStaff(); }
  if (Date.now() - staffUsersAt > 300000) { // the names to complete; the app keeps them for five minutes
    staffUsersAt = Date.now();
    const u = await staffAsk({ op: 'users' });
    if (u.ok && u.data && Array.isArray(u.data.users)) fill($('staff-users'), u.data.users);
  }
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
const needName = () => (staffName().trim() ? null : { ok: false, text: 'Type a Twitch name first.' });

action('staff-lookup', 'staff-viewer-result', async () => {
  const r = await staffAsk({ op: 'viewer', name: staffName() });
  const box = $('staff-viewer');
  box.hidden = !r.ok;
  if (!r.ok) return r;
  const d = r.data;
  const rows = [
    ['Viewer', d.username + (d.blocked ? ' (blocked from pulls)' : '')],
    ['Cards', `${d.copies} owned, ${d.unique} different`],
    ['Rank', d.rank ? `${d.rank} of ${d.of}` : 'Not ranked'],
    ['Brie Bucks', d.bucks === null || d.bucks === undefined ? 'Unknown (Mix It Up is not answering)' : String(d.bucks)],
    ['Last pulls', d.pulls.length ? d.pulls.map(p => p.text).join(', ') : 'None'],
    ['Refusals', d.refusals.length ? d.refusals.map(p => p.text).join(', ') : 'None'],
  ];
  box.replaceChildren(...rows.flatMap(([k, v]) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; return [dt, dd]; }));
  return { ok: true, text: '' };
});
action('staff-admin', 'staff-viewer-result', async () => needName() || staffAsk({ op: 'open-admin', name: staffName() }));
action('staff-gift', 'staff-viewer-result', async () => needName() || staffDo({ action: 'gift', username: staffName(), count: Number($('staff-count').value) }));
action('staff-collection', 'staff-viewer-result', async () => needName() || staffDo({ action: 'show-collection', username: staffName() }));
action('staff-block', 'staff-viewer-result', async () => needName() || staffDo({ action: 'block', username: staffName(), mode: $('staff-block-mode').value }));
action('staff-unblock', 'staff-viewer-result', async () => needName() || staffDo({ action: 'unblock', username: staffName() }));
action('staff-grant', 'staff-card-result', async () => {
  const n = cardNumber();
  return needName() || (n === null ? { ok: false, text: 'Pick a card from the list.' } : staffDo({ action: 'grant', username: staffName(), cardNumber: n, variant: $('staff-variant').value }));
});
action('staff-showcard', 'staff-card-result', async () => needName() || staffDo({ action: 'show-card', username: staffName(), card: $('staff-card').value.trim().replace(/^(#\d+)\s.*$/, '$1') }));
action('staff-extra-set', 'staff-stream-result', () => staffDo({ action: 'stream-extra', amount: Number($('staff-extra').value) }));
action('staff-extra-clear', 'staff-stream-result', () => staffDo({ action: 'stream-extra', amount: 0 }));
action('staff-scene-go', 'staff-stream-result', async () => $('staff-scene').value ? staffAsk({ op: 'scene', name: $('staff-scene').value }) : { ok: false, text: 'OBS has no scenes yet.' });
$('preview-open').addEventListener('click', () => { void window.bridge.openPreview(); });
action('staff-trading', 'staff-stream-result', async () => { const r = await window.bridge.staffTrading(!(staffState && staffState.tradingPaused)); void loadStaff(); return r; });

// ── Shortcuts and Activity (55.13) ──
action('staff-backup', 'staff-backup-result', () => staffDo({ action: 'backup' }));

const listOf = (ul, rows) => ul.replaceChildren(...rows);
let searchTimer;
$('staff-search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const q = $('staff-search').value.trim();
    if (q.length < 2) return listOf($('staff-search-results'), []);
    const r = await staffAsk({ op: 'search', q });
    const found = r.ok && r.data && Array.isArray(r.data.results) ? r.data.results : [];
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

const activityTabOpen = () => !!state && state.staff && document.querySelector('[data-panel="activity"]').hidden === false && !document.hidden;
async function loadActivity() {
  if (!activityTabOpen()) return;
  const r = await staffAsk({ op: 'activity' });
  $('activity-result').textContent = r.ok ? '' : r.text;
  $('activity-result').className = 'result ' + (r.ok ? '' : 'fail');
  if (!r.ok) return;
  $('activity-empty').hidden = r.data.events.length > 0;
  listOf($('activity-list'), r.data.events.map(e => { const li = document.createElement('li'); li.textContent = e.text; return li; }));
}
for (const b of document.querySelectorAll('.rail-btn')) b.addEventListener('click', () => { void loadActivity(); });
setInterval(() => { void loadActivity(); }, 5000);

for (const kind of ['attention', 'feedback', 'refusal', 'deploy']) $('notice-' + kind).addEventListener('change', e => window.bridge.setNotice(kind, e.target.checked));
function renderNotices() {
  $('notice-card').hidden = !(state && state.staff);
  $('rail-activity').hidden = !(state && state.staff);
  if (state && !state.staff && !document.querySelector('[data-panel="activity"]').hidden) showTab('status');
  if (state && state.notices) for (const kind of Object.keys(state.notices)) if ($('notice-' + kind)) $('notice-' + kind).checked = state.notices[kind];
}

window.bridge.onState(s => { state = s; render(); renderStaff(); renderNotices(); });
window.bridge.getState().then(s => { state = s; render(); renderStaff(); renderNotices(); });
setInterval(render, 5000); // keeps "5 seconds ago" honest
