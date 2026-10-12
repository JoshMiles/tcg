// A pretend Twitch Extension helper for the fake Twitch page (Admin -> Sandbox -> Fake Twitch). It only does anything when the
// page is opened with ?mock=1 (the fake page does that); in the real extension this file is a harmless no-op.
// It replaces window.Twitch.ext with just enough of the real helper for panel.js: onAuthorized, onError and
// actions.requestIdShare (which shows a stand-in for Twitch's "share your identity" prompt). Tokens come from
// POST /api/admin/sandbox/ext-token, so the panel's own API calls are verified exactly like real ones, but only inside the sandbox.
(function () {
  var q = new URLSearchParams(location.search);
  if (!q.has('mock')) return;

  var state = { as: q.get('as') || '', share: q.get('share') === '1', role: q.get('role') || 'viewer' };
  var authorized = [];
  var errored = [];
  var auth = null;

  function banner(text) {
    var el = document.getElementById('mock-ext-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mock-ext-banner';
      el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#7f1d1d;color:#fff;font:12px/1.4 sans-serif;padding:6px 10px;';
      document.body.appendChild(el);
    }
    el.textContent = text;
  }

  function mint() {
    return fetch('/api/admin/sandbox/ext-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) })
      .then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || ('token request failed (' + r.status + ')')); return b; }); })
      .then(function (b) {
        auth = { channelId: '1', clientId: 'mock-client', token: b.token, helixToken: 'mock', userId: b.opaqueId };
        authorized.slice().forEach(function (cb) { try { cb(auth); } catch (e) { console.error(e); } });
      })
      .catch(function (err) {
        console.error('[mock twitch]', err);
        banner('Fake Twitch: ' + err.message);
        errored.forEach(function (cb) { try { cb(err); } catch (e) { /* ignore */ } });
      });
  }

  // Stand-in for Twitch's "share your identity" prompt.
  function promptShare() {
    if (!state.as) { banner('Fake Twitch: this viewer is not logged in to Twitch, so there is no identity to share.'); return; }
    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:12px;font-family:sans-serif;';
    wrap.innerHTML =
      '<div style="background:#18181b;color:#efeff1;border:1px solid #9146ff;border-radius:8px;padding:14px;max-width:290px;text-align:center">' +
      '<div style="font-weight:700;margin-bottom:6px">The Cheesy TCG</div>' +
      '<div style="font-size:13px;color:#adadb8;margin-bottom:12px">would like to see your Twitch identity (' + state.as.replace(/[^a-z0-9_]/g, '') + '). <i>Fake Twitch prompt</i></div>' +
      '<button id="mock-share-ok" style="background:#9146ff;color:#fff;border:0;border-radius:4px;padding:6px 14px;font-weight:700;cursor:pointer;margin-right:6px">Share identity</button>' +
      '<button id="mock-share-no" style="background:#3a3a3d;color:#efeff1;border:0;border-radius:4px;padding:6px 14px;cursor:pointer">Cancel</button></div>';
    document.body.appendChild(wrap);
    wrap.querySelector('#mock-share-no').onclick = function () { wrap.remove(); };
    wrap.querySelector('#mock-share-ok').onclick = function () {
      wrap.remove();
      state.share = true;
      try { window.parent.postMessage({ type: 'tcg-mock-share', share: true }, location.origin); } catch (e) { /* not framed */ }
      // Like Twitch, the helper re-fires onAuthorized with a token that now carries the viewer's ID.
      mint();
    };
  }

  var noop = function () {};
  var ext = {
    version: 'mock',
    environment: 'local',
    onAuthorized: function (cb) { authorized.push(cb); if (auth) cb(auth); },
    onError: function (cb) { errored.push(cb); },
    onContext: noop, onVisibilityChanged: noop, onHighlightChanged: noop, onPositionChanged: noop,
    listen: noop, unlisten: noop, send: noop,
    rig: { log: noop },
    features: {},
    configuration: {},
    actions: { requestIdShare: promptShare, minimize: noop, followChannel: noop, onFollow: noop },
  };
  try { window.Twitch = window.Twitch || {}; window.Twitch.ext = ext; } catch (e) { window.Twitch = { ext: ext }; }
  try { Object.defineProperty(window.Twitch, 'ext', { value: ext, configurable: true }); } catch (e) { /* assigned above */ }

  // Authorise as soon as the page has loaded (the real helper does the same).
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mint); else mint();
})();
