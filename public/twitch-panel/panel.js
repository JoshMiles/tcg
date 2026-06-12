'use strict';

// ── Rarity colours matching the admin panel ──────────────
const RARITY_COLOR = { 1: '#6b7280', 2: '#22c55e', 3: '#3b82f6', 4: '#a855f7', 5: '#f59e0b' };

// Returns true only when Twitch has shared the real numeric user ID (post-requestIdShare).
// auth.userId starts with 'U' for any logged-in viewer (opaque IDs like UJ4TfQ1fF…),
// but the actual Twitch user ID is U + digits only, e.g. U123456789.
function hasSharedTwitchId(userId) {
  return !!(userId?.startsWith('U') && /^\d+$/.test(userId.slice(1)));
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

      if (card.imageUrl) {
        const img = document.createElement('img');
        img.src = card.imageUrl;
        img.alt = card.name;
        img.loading = 'lazy';
        if (!ownedActive && ownedPast.length > 0) {
          img.style.opacity = '0.55'; // dimmed — pulled in past season only
        }
        cell.appendChild(img);
      }

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

  const footerName = document.getElementById('footer-username');
  if (footerName) footerName.textContent = username;
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

// Called when identity is shared — resolves real Twitch user ID → login name
async function tryResolveFromTwitch() {
  if (!hasSharedTwitchId(auth?.userId)) return false;
  const numericId = auth.userId.slice(1);
  try {
    const res = await fetch(`/api/twitch/resolve-username?userId=${encodeURIComponent(numericId)}`);
    if (!res.ok) {
      console.error('[TCG] resolve-username failed:', res.status, await res.text().catch(() => ''));
      return false;
    }
    const { username } = await res.json();
    if (!username) {
      console.error('[TCG] resolve-username returned no username for userId:', numericId);
      return false;
    }
    await linkAndLogin(username);
    return true;
  } catch (err) {
    console.error('[TCG] tryResolveFromTwitch error:', err);
    return false;
  }
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
      const img = document.createElement('img');
      img.src = card.imageUrl;
      img.alt = '';
      img.loading = 'lazy';
      div.appendChild(img);
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

function showLoginScreen() {
  populateLoginTeaser();
  renderLoginMeta();
  document.getElementById('login-btn').disabled = false;
  showState('login');
}

// ── Entry point ───────────────────────────────────────────
async function init(twitchAuth) {
  auth = twitchAuth;

  // Re-auth fired after user responded to the identity-share popup
  if (identityRequestPending) {
    identityRequestPending = false;
    console.log('[TCG] onAuthorized re-fired after requestIdShare, userId:', auth.userId);
    if (hasSharedTwitchId(auth.userId)) {
      const resolved = await tryResolveFromTwitch();
      if (resolved) return;
    } else {
      console.warn('[TCG] identity sharing denied or not granted — userId still opaque:', auth.userId);
    }
    // Denied or resolution failed — back to login screen
    showLoginScreen();
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

  // Returning user with saved mapping — silent auto-login
  const autoLoggedIn = await tryAutoLogin();
  if (autoLoggedIn) return;

  // Identity already shared from a previous grant — resolve silently
  if (hasSharedTwitchId(auth.userId)) {
    const resolved = await tryResolveFromTwitch();
    if (resolved) return;
  }

  // First visit or resolution failed — show login screen
  showLoginScreen();
}

// ── Event wiring ──────────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', async () => {
  document.getElementById('login-btn').disabled = true;
  showState('loading');

  console.log('[TCG] login-btn clicked — userId:', auth?.userId, '| requestIdShare:', typeof window.Twitch?.ext?.actions?.requestIdShare);

  // Identity already shared — resolve directly without a popup
  if (hasSharedTwitchId(auth?.userId)) {
    const resolved = await tryResolveFromTwitch();
    if (resolved) return;
    console.warn('[TCG] resolve failed on shared userId — showing login screen');
    showLoginScreen();
    return;
  }

  // Ask Twitch for identity; if onAuthorized never fires, time out back to login screen
  if (window.Twitch?.ext?.actions?.requestIdShare) {
    identityRequestPending = true;
    console.log('[TCG] calling requestIdShare()');
    window.Twitch.ext.actions.requestIdShare();
    setTimeout(() => {
      if (identityRequestPending) {
        console.warn('[TCG] 20s timeout — onAuthorized never re-fired after requestIdShare');
        identityRequestPending = false;
        showLoginScreen();
      }
    }, 20000);
    return;
  }

  // Extension Helper unavailable
  console.error('[TCG] requestIdShare not available — Twitch.ext.actions:', window.Twitch?.ext?.actions);
  showLoginScreen();
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
