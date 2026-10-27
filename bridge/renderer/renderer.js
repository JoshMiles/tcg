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
let dismissedNote = '';

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

function renderBanners() {
  $('updated').hidden = !state.updatedTo;
  $('updated-version').textContent = state.updatedTo;
  const note = state.startNote && state.startNote !== dismissedNote ? state.startNote : '';
  $('start-note').hidden = !note;
  $('start-note-text').textContent = note;
  $('update-banner').hidden = !state.update;
  $('update-banner-text').textContent = state.update;
}

function render() {
  if (!state) return;
  const svc = state.service;
  $('version').textContent = `v${state.appVersion}`;
  $('about-version').textContent = `Version ${state.appVersion}`;
  $('pairing').hidden = state.paired;
  $('status').hidden = !state.paired;
  $('unpair').hidden = !state.paired;
  $('account-text').textContent = state.paired ? `Paired with ${state.site} as ${state.pairedAs}.` : 'Not paired yet. Pair on the Status page.';
  $('autostart').checked = state.startWithWindows;
  $('update').textContent = state.update || 'No update waiting.';
  $('alerts').checked = state.alerts;
  $('mix-autostart').checked = state.mixItUp.startWithBridge;
  renderBanners();
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
  const r = await window.bridge.setObs($('obs-on').checked, $('obs-address').value, password);
  if (r.ok) { $('obs-password').value = ''; $('obs-address').value = $('obs-address').value.trim(); }
  else $('obs-error').textContent = r.error || 'Could not save';
}
$('obs-form').addEventListener('submit', e => { e.preventDefault(); void saveObs($('obs-password').value || undefined); });
$('obs-forget').addEventListener('click', () => { void saveObs(''); });
$('unpair').addEventListener('click', () => window.bridge.unpair());
$('autostart').addEventListener('change', e => window.bridge.setStartWithWindows(e.target.checked));

$('alerts').addEventListener('change', e => window.bridge.setAlerts(e.target.checked));
$('mix-autostart').addEventListener('change', e => window.bridge.setStartMixItUp(e.target.checked));
$('updated-link').addEventListener('click', () => window.bridge.openRelease());
$('open-release').addEventListener('click', () => window.bridge.openRelease());
$('updated-dismiss').addEventListener('click', () => window.bridge.dismissUpdated());
$('start-note-dismiss').addEventListener('click', () => { dismissedNote = state ? state.startNote : ''; render(); });

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
action('test-mix', 'test-mix-result', () => window.bridge.testMixItUp($('test-name').value));
action('test-chat', 'test-chat-result', () => window.bridge.testChat());
action('test-obs', 'test-obs-result', () => window.bridge.testObs());
action('mix-start', 'mix-start-result', () => window.bridge.startMixItUp());
action('mix-choose', 'mix-start-result', () => window.bridge.chooseMixItUp());
action('open-logs', 'help-result', () => window.bridge.openLogs());
action('copy-diagnostics', 'help-result', () => window.bridge.copyDiagnostics());
action('check-update', 'update-result', () => window.bridge.checkUpdate());

window.bridge.onState(s => { state = s; render(); });
window.bridge.getState().then(s => { state = s; render(); });
setInterval(render, 5000); // keeps "5 seconds ago" honest
