// The window: draws the state main.js sends and sends the three actions back. Text only (textContent), never HTML.
const $ = id => document.getElementById(id);
const SITE_TEXT = { connecting: 'Connecting', connected: 'Connected', offline: 'Cannot reach the site, trying again', revoked: 'Pair again' };

const time = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const ago = ms => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 5 ? 'just now' : s < 60 ? `${s} seconds ago` : `${Math.round(s / 60)} minutes ago`;
};

let state = null;
let obsFormFilled = false;

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
  $('obs-dot').className = 'dot ' + (up ? 'ok' : on ? '' : 'warn');
  $('obs-state').textContent = !on ? 'Off' : up ? 'Connected' : `Not connected${obs && obs.error ? ` (${obs.error})` : ''}`;
  $('obs-scene').textContent = up && obs.scene ? obs.scene : '-';
  $('obs-stream').textContent = up ? (obs.streaming === null ? '-' : obs.streaming ? 'Live' : 'Not streaming') : '-';
  $('obs-overlay').textContent = up ? overlayText(obs.overlay, obs.scene) : '-';
}

function render() {
  if (!state) return;
  const svc = state.service;
  $('version').textContent = `version ${state.appVersion}`;
  $('pairing').hidden = state.paired;
  $('status').hidden = !state.paired;
  $('unpair').hidden = !state.paired;
  $('autostart').checked = state.startWithWindows;
  $('update').textContent = state.update;
  if (!state.paired) {
    if (!$('site').value) $('site').value = state.site;
    $('pair-note').textContent = svc && svc.site === 'revoked'
      ? 'Pair again: the site no longer accepts this PC. On the site, open Admin > Mix It Up > Paid pulls, press "Pair TCG Bridge" and type the new code here.'
      : 'On the site, open Admin > Mix It Up > Paid pulls and press "Pair TCG Bridge". Type the code it shows here.';
    return;
  }
  const site = svc ? svc.site : 'connecting';
  $('site-dot').className = 'dot ' + (site === 'connected' ? 'ok' : site === 'connecting' ? 'warn' : '');
  $('site-url').textContent = state.site;
  $('paired-as').textContent = state.pairedAs;
  $('last-poll').textContent = svc && svc.lastPollAt ? ago(svc.lastPollAt) : 'not yet';
  $('site-state').textContent = SITE_TEXT[site] + (svc && svc.siteError && site !== 'revoked' ? ` (${svc.siteError})` : '');
  const found = !!(svc && svc.mix.found);
  $('mix-dot').className = 'dot ' + (found ? 'ok' : '');
  $('mix-found').textContent = found ? 'Yes, Developer API is on' : 'No (Mix It Up is closed, or its Developer API is off)';
  $('mix-version').textContent = found ? svc.mix.version : '-';
  $('mix-currency').textContent = svc && svc.currency ? svc.currency : 'The site chooses it; shown after the first job';
  $('mix-help').hidden = found;
  renderObs(svc && svc.obs, state.obsSettings);
  const jobs = svc ? svc.jobs : [];
  $('no-jobs').hidden = jobs.length > 0;
  $('jobs').hidden = jobs.length === 0;
  const body = document.querySelector('#jobs tbody');
  body.replaceChildren(...jobs.map(j => {
    const tr = document.createElement('tr');
    for (const [text, cls] of [[time(j.at)], [j.kind], [j.username || '-'], [j.detail, j.ok ? '' : 'fail']]) {
      const td = document.createElement('td');
      td.textContent = text;
      if (cls) td.className = cls;
      tr.append(td);
    }
    return tr;
  }));
}

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

window.bridge.onState(s => { state = s; render(); });
window.bridge.getState().then(s => { state = s; render(); });
setInterval(render, 5000); // keeps "5 seconds ago" honest
