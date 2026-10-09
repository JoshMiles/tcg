'use strict';

// ── Rarity colours matching the admin panel ──────────────
const RARITY_COLOR = { 1: '#6b7280', 2: '#22c55e', 3: '#3b82f6', 4: '#a855f7', 5: '#f59e0b' };

// Reads a claim from the (unverified) Extension JWT. Only used for UX decisions — the server
// verifies the signature before trusting anything.
function jwtClaim(token, name) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64))[name];
  } catch {
    return undefined;
  }
}

// Twitch's requestIdShare() is a documented no-op on the viewer's own channel, so broadcasters
// can never be prompted. The server recognises them from the signed role claim instead.
function isBroadcaster() {
  return jwtClaim(auth?.token, 'role') === 'broadcaster';
}

// ── Card images ───────────────────────────────────────────
// Card art is a 600px animated WebP (1–4MB, ~50 frames). Decoding and animating two dozen of
// them at once makes the panel crawl, so the grid shows a tiny static thumbnail and only loads
// and plays the animated version for the card under the pointer.
const reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Appends the thumbnail <img> to `container` and wires up hover-to-animate.
// `dimmed` mirrors the faded look used for cards owned only in a past season.
function addCardImage(container, card, { alt = '', dimmed = false } = {}) {
  if (!card.imageUrl) return;

  const img = document.createElement('img');
  img.src = card.thumbUrl || card.imageUrl;
  img.alt = alt;
  img.loading = 'lazy';
  img.decoding = 'async';
  if (dimmed) img.style.opacity = '0.55';
  container.appendChild(img);

  const animates = card.thumbUrl && card.thumbUrl !== card.imageUrl && !reducedMotion;
  if (!animates) return;

  let overlay = null;
  const start = () => {
    if (overlay) return;
    overlay = document.createElement('img');
    overlay.className = 'anim-overlay';
    overlay.alt = '';
    overlay.decoding = 'async';
    // Stay invisible until loaded so the thumbnail underneath never flickers.
    overlay.addEventListener('load', () => { if (overlay) overlay.style.opacity = dimmed ? '0.55' : '1'; });
    overlay.src = card.imageUrl;
    container.appendChild(overlay);
  };
  const stop = () => { overlay?.remove(); overlay = null; };
  // Touch screens emulate mouseenter on tap and mouseleave when tapping elsewhere.
  container.addEventListener('mouseenter', start);
  container.addEventListener('mouseleave', stop);
}

// ── State ─────────────────────────────────────────────────
let auth                   = null;   // Twitch Extension auth object
let season                 = null;   // { seasonId, seasonName, collectionName, packs }
let collections            = [];     // [{ seasonId, seasonName, active, ownedNumbers }]
let currentUsername        = null;
let currentPackIdx         = 0;
let identityRequestPending = false;  // true while waiting for requestIdShare() response

// ── DOM refs ─────────────────────────────────────────────
const STATES = {
  loading:    document.getElementById('state-loading'),
  noSeason:   document.getElementById('state-no-season'),
  login:      document.getElementById('state-login'),
  collection: document.getElementById('state-collection'),
};

function showState(name) {
  Object.entries(STATES).forEach(([k, el]) => {
    el.classList.toggle('hidden', k !== name);
  });
}

// ── Season header renderer (shared between states) ───────
function renderSeasonHeader(containerId) {
  const el = document.getElementById(containerId);
  if (!el || !season) return;

  const totalCards = season.packs.reduce((s, p) => s + p.cards.length, 0);
  const activeColl = collections.find(c => c.active);
  const ownedCount = activeColl ? new Set(activeColl.ownedNumbers).size : 0;
  const totalPulls = activeColl ? activeColl.ownedNumbers.length : 0;
  const pct = totalCards > 0 ? Math.round(ownedCount / totalCards * 100) : 0;

  el.innerHTML = '';

  const nameEl = document.createElement('div');
  nameEl.className = 'season-name';
  nameEl.textContent = 'Active Season';
  el.appendChild(nameEl);

  const titleEl = document.createElement('div');
  titleEl.className = 'season-title';
  titleEl.textContent = season.seasonName;
  el.appendChild(titleEl);

  if (currentUsername) {
    const row = document.createElement('div');
    row.className = 'progress-row';

    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = pct + '%';
    bar.appendChild(fill);

    const label = document.createElement('div');
    label.className = 'progress-label';
    label.textContent = totalPulls > ownedCount
      ? `${ownedCount}/${totalCards} · ${pct}% · ${totalPulls} pulls`
      : `${ownedCount}/${totalCards} · ${pct}%`;

    row.appendChild(bar);
    row.appendChild(label);
    el.appendChild(row);
  }
}

// ── Pack tabs ─────────────────────────────────────────────
function renderPackTabs() {
  const tabs = document.getElementById('pack-tabs');
  if (!tabs || !season) return;
  tabs.innerHTML = '';

  season.packs.forEach((pack, i) => {
    const btn = document.createElement('button');
    btn.className = 'pack-tab' + (i === currentPackIdx ? ' active' : '');
    btn.textContent = pack.packName;
    btn.addEventListener('click', () => {
      currentPackIdx = i;
      renderPackTabs();
      renderGrid();
    });
    tabs.appendChild(btn);
  });
}

// ── Card grid ─────────────────────────────────────────────
function renderGrid() {
  const grid = document.getElementById('card-grid');
  if (!grid || !season) return;
  grid.innerHTML = '';

  const pack = season.packs[currentPackIdx];
  if (!pack) return;

  // Build a map: card number → which seasons the viewer owns it in
  const ownedMap = new Map(); // number → [{ seasonName, active }]
  collections.forEach(c => {
    c.ownedNumbers.forEach(n => {
      if (!ownedMap.has(n)) ownedMap.set(n, []);
      ownedMap.get(n).push({ seasonName: c.seasonName, active: c.active });
    });
  });

  // Pull count for the active season only
  const activeColl = collections.find(c => c.active);
  const pullCountMap = new Map();
  if (activeColl) {
    for (const n of activeColl.ownedNumbers) {
      pullCountMap.set(n, (pullCountMap.get(n) ?? 0) + 1);
    }
  }

  pack.cards.forEach(card => {
    const ownership = ownedMap.get(card.number) ?? [];
    const ownedActive   = ownership.some(o => o.active);
    const ownedPast     = ownership.filter(o => !o.active);
    const isOwned       = ownedActive || ownedPast.length > 0;

    const cell = document.createElement('div');
    cell.className = 'card-cell' + (isOwned ? ' owned' : '');

    if (isOwned) {
      const color = RARITY_COLOR[card.stars] || '#fbbf24';
      cell.style.setProperty('--rarity-color', color);

      // dimmed — pulled in past season only
      addCardImage(cell, card, { alt: card.name, dimmed: !ownedActive && ownedPast.length > 0 });

      // Season badge for past-season-only cards
      if (!ownedActive && ownedPast.length > 0) {
        const badge = document.createElement('div');
        badge.className = 'season-badge';
        badge.textContent = ownedPast[0].seasonName.replace(/season\s*/i, 'S');
        cell.appendChild(badge);
      }

      // Rarity dot
      const dot = document.createElement('div');
      dot.className = 'rarity-dot';
      dot.style.background = color;
      cell.appendChild(dot);

      // Pull count badge (active season only)
      const pullCount = pullCountMap.get(card.number) ?? 0;
      if (ownedActive && pullCount > 1) {
        const countBadge = document.createElement('div');
        countBadge.className = 'pull-count';
        countBadge.textContent = '×' + pullCount;
        cell.appendChild(countBadge);
      }
    } else {
      const q = document.createElement('div');
      q.className = 'card-question';
      q.textContent = '?';
      cell.appendChild(q);
    }

    // Hover tooltip
    const tip = document.createElement('div');
    tip.className = 'card-tooltip';
    tip.textContent = isOwned ? card.name + ' ' + '★'.repeat(card.stars) : '#' + card.number;
    cell.appendChild(tip);

    grid.appendChild(cell);
  });
}

// ── Login flow ────────────────────────────────────────────
async function loadUserCollection(username) {
  try {
    const res = await fetch(`/api/twitch/collection?username=${encodeURIComponent(username)}`);
    if (!res.ok) return;
    const data = await res.json();
    collections = data.collections ?? [];
  } catch {
    collections = [];
  }
}

async function linkAndLogin(username) {
  // Persist the opaque ID → username mapping so next visit auto-logs in
  if (auth?.token) {
    try {
      await fetch('/api/twitch/link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + auth.token,
        },
        body: JSON.stringify({ username }),
      });
    } catch {
      // Non-fatal — still show collection
    }
  }

  await login(username);
}

async function login(username) {
  setExplicitLogout(false);
  currentUsername = username;
  await loadUserCollection(username);
  showState('collection');
  renderSeasonHeader('collection-season-header');
  renderPackTabs();
  renderGrid();

  // The username links to the viewer's public collection page (opens in a new tab; Twitch's
  // extension sandbox allows popups). Same origin as the API calls above.
  const footerName = document.getElementById('footer-username');
  if (footerName) {
    footerName.textContent = username;
    footerName.href = new URL('/collection/' + encodeURIComponent(username.toLowerCase()), window.location.origin).href;
  }
}

async function tryAutoLogin() {
  if (!auth?.userId) return false;
  try {
    const res = await fetch(`/api/twitch/user?opaqueId=${encodeURIComponent(auth.userId)}`);
    const { username } = await res.json();
    if (username) {
      await login(username);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

// Sends the current JWT to the server, which extracts the numeric user_id from the
// JWT payload (set by Twitch after requestIdShare() grant), resolves via Helix,
// saves the opaque→username mapping, creates the user profile, and returns the username.
// This works even when auth.userId is still showing as a non-numeric opaque ID.
// Resolves to { ok: true } on success, or { ok: false, status, message } so callers can tell
// "identity not shared yet" (403, expected for first-time viewers) from real failures.
async function loginFromJwt() {
  if (!auth?.token) return { ok: false, status: 0, message: 'No Twitch token available' };
  try {
    const res = await fetch('/api/twitch/login', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + auth.token },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.warn('[TCG] login failed:', res.status, body);
      return { ok: false, status: res.status, message: body.error || 'Login failed (' + res.status + ')' };
    }
    const { username } = await res.json();
    if (!username) return { ok: false, status: res.status, message: 'Login returned no username' };
    await login(username);
    return { ok: true };
  } catch (err) {
    console.error('[TCG] login error:', err);
    return { ok: false, status: 0, message: 'Could not reach the server' };
  }
}

// Friendly text for a failed login, for the login screen.
function loginFailureMessage(result) {
  if (result.status === 401) return 'Sign-in failed: the Twitch token was rejected (check the extension secret on the server).';
  if (result.status === 500) return 'Sign-in is unavailable: ' + result.message;
  if (result.status === 502) return 'Sign-in failed: could not look up your Twitch account. Try again in a moment.';
  return 'Could not sign you in: ' + result.message;
}

// ── Season load ───────────────────────────────────────────
async function loadSeason() {
  try {
    const res = await fetch('/api/twitch/season');
    if (!res.ok) {
      showState('noSeason');
      return false;
    }
    season = await res.json();
    return true;
  } catch {
    showState('noSeason');
    return false;
  }
}

// ── Logout persistence (localStorage) ────────────────────
// Survives refresh so explicit logouts aren't overridden by silent auto-login.
function isExplicitlyLoggedOut() {
  try { return localStorage.getItem('tcg_panel_loggedout') === '1'; } catch { return false; }
}
function setExplicitLogout(val) {
  try { localStorage.setItem('tcg_panel_loggedout', val ? '1' : '0'); } catch {}
}

// ── Login screen helpers ──────────────────────────────────
function populateLoginTeaser() {
  const container = document.getElementById('login-teaser');
  if (!container) return;
  container.innerHTML = '';
  if (!season) return;

  // Gather all cards, sort rarest first so teasers show the best cards
  const all = season.packs.flatMap(p => p.cards)
    .sort((a, b) => b.stars - a.stars);
  const show = all.slice(0, 10);

  show.forEach((card, i) => {
    const div = document.createElement('div');
    const reveal = i < 3; // top 3 rarest are revealed
    div.className = 'teaser-card' + (reveal ? ' revealed' : '');

    if (reveal && card.imageUrl) {
      addCardImage(div, card);
    } else {
      const q = document.createElement('div');
      q.className = 'teaser-q';
      q.textContent = '?';
      div.appendChild(q);
    }
    container.appendChild(div);
  });
}

function renderLoginMeta() {
  const nameEl = document.getElementById('login-season-name');
  const countEl = document.getElementById('login-card-count');
  if (nameEl) nameEl.textContent = season?.seasonName ?? 'Card Collection';
  if (countEl && season) {
    const total = season.packs.reduce((s, p) => s + p.cards.length, 0);
    countEl.textContent = total > 0 ? `${total} cards to discover` : '';
  }
}

function showLoginScreen(statusMsg) {
  populateLoginTeaser();
  renderLoginMeta();
  const btn = document.getElementById('login-btn');
  btn.disabled = false;
  btn.textContent = 'Login with Twitch';
  const statusEl = document.getElementById('login-status');
  if (statusEl) {
    statusEl.textContent = statusMsg ?? '';
    statusEl.classList.toggle('hidden', !statusMsg);
  }
  showState('login');
}

// ── Entry point ───────────────────────────────────────────
async function init(twitchAuth) {
  auth = twitchAuth;
  console.log('[TCG] init() — userId:', auth.userId, '| identityRequestPending:', identityRequestPending);

  // Re-auth fired after user responded to the identity-share popup.
  // JWT now contains user_id — send it to the server to resolve username.
  if (identityRequestPending) {
    identityRequestPending = false;
    console.log('[TCG] identity share response — trying JWT login');
    showState('loading');
    const result = await loginFromJwt();
    if (result.ok) return;
    showLoginScreen(loginFailureMessage(result));
    return;
  }

  showState('loading');

  const ok = await loadSeason();
  if (!ok) return;

  // Explicit logout — respect it, show login screen
  if (isExplicitlyLoggedOut()) {
    showLoginScreen();
    return;
  }

  // Returning user with saved opaque→username mapping — silent auto-login
  const autoLoggedIn = await tryAutoLogin();
  if (autoLoggedIn) return;

  // JWT may already contain user_id from a previous grant — try silent login
  const result = await loginFromJwt();
  if (result.ok) return;

  // 403 just means this viewer hasn't shared their identity yet — show a plain login screen.
  // Anything else is a real failure; say so instead of silently looking logged out.
  showLoginScreen(result.status === 403 || result.status === 0 ? undefined : loginFailureMessage(result));
}

// ── Build version ─────────────────────────────────────────
// Shows which deployment this panel is running (the page, script and API ship together on Vercel).
// Purely informational — never blocks or breaks the panel.
async function showVersion() {
  const el = document.getElementById('panel-version');
  if (!el) return;
  try {
    const res = await fetch('/api/version', { cache: 'no-store' });
    if (!res.ok) return;
    const v = await res.json();
    el.textContent = 'v' + v.version + ' · ' + v.commit + (v.env && v.env !== 'production' ? ' · ' + v.env : '');
    el.title = [
      'Version ' + v.version,
      'Commit ' + v.commit,
      v.branch && 'Branch ' + v.branch,
      'Environment ' + v.env,
      v.builtAt && 'Built ' + new Date(v.builtAt).toLocaleString(),
    ].filter(Boolean).join('\n');
  } catch {
    // leave blank
  }
}
showVersion();

// ── Event wiring ──────────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', async () => {
  const btn = document.getElementById('login-btn');
  btn.disabled = true;

  console.log('[TCG] login-btn clicked — userId:', auth?.userId, '| broadcaster:', isBroadcaster(), '| requestIdShare:', typeof window.Twitch?.ext?.actions?.requestIdShare);

  // Channel owner: Twitch never shows the share prompt on your own channel, so don't wait for it.
  if (isBroadcaster()) {
    btn.textContent = 'Signing in...';
    const result = await loginFromJwt();
    if (!result.ok) showLoginScreen(loginFailureMessage(result));
    return;
  }

  if (window.Twitch?.ext?.actions?.requestIdShare) {
    // Keep the login screen visible — just update the button and show a hint
    btn.textContent = 'Waiting for Twitch...';
    const statusEl = document.getElementById('login-status');
    if (statusEl) {
      statusEl.textContent = 'Look for the Twitch prompt above the video and click Allow to continue';
      statusEl.classList.remove('hidden');
    }

    identityRequestPending = true;
    console.log('[TCG] calling requestIdShare()');
    window.Twitch.ext.actions.requestIdShare();
    setTimeout(() => {
      if (identityRequestPending) {
        console.warn('[TCG] 20s timeout — onAuthorized never re-fired after requestIdShare');
        identityRequestPending = false;
        showLoginScreen("Twitch didn't respond. If no prompt appeared, the extension may not have identity linking enabled. Try again, or reload the page.");
      }
    }, 20000);
    return;
  }

  // Extension Helper unavailable
  console.error('[TCG] requestIdShare not available — Twitch.ext.actions:', window.Twitch?.ext?.actions);
  showLoginScreen('Twitch identity sharing unavailable.');
});

document.getElementById('logout-btn').addEventListener('click', () => {
  // Mark as explicitly logged out so refresh doesn't silently re-login
  setExplicitLogout(true);

  // Delete the server-side opaque→username mapping
  if (auth?.token) {
    fetch('/api/twitch/unlink', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + auth.token },
    }).catch(() => {});
  }

  currentUsername = null;
  collections = [];
  showLoginScreen();
});

document.getElementById('refresh-btn').addEventListener('click', async () => {
  if (!currentUsername) return;
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  await loadUserCollection(currentUsername);
  renderSeasonHeader('collection-season-header');
  renderGrid();
  btn.classList.remove('spinning');
});

// ── Twitch Extension Helper ───────────────────────────────
if (typeof window.Twitch !== 'undefined' && window.Twitch.ext) {
  window.Twitch.ext.onAuthorized(authObj => init(authObj));
  window.Twitch.ext.onError(err => console.error('[TCG Panel]', err));
} else {
  // Dev mode — run without the Twitch Extension environment
  init({ userId: 'dev_mock_opaque', token: null, channelId: 'dev' });
}
