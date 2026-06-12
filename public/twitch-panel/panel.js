'use strict';

// ── Rarity colours matching the admin panel ──────────────
const RARITY_COLOR = { 1: '#6b7280', 2: '#22c55e', 3: '#3b82f6', 4: '#a855f7', 5: '#f59e0b' };

// ── State ─────────────────────────────────────────────────
let auth                   = null;   // Twitch Extension auth object
let season                 = null;   // { seasonId, seasonName, collectionName, packs }
let collections            = [];     // [{ seasonId, seasonName, active, ownedNumbers }]
let currentUsername        = null;
let currentPackIdx         = 0;
let identityRequestPending = false;  // true while waiting for requestIdShare() response

// ── DOM refs ─────────────────────────────────────────────
const STATES = {
  loading:       document.getElementById('state-loading'),
  noSeason:      document.getElementById('state-no-season'),
  enterUsername: document.getElementById('state-enter-username'),
  collection:    document.getElementById('state-collection'),
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
  if (!auth?.userId?.startsWith('U')) return false;
  const numericId = auth.userId.slice(1);
  try {
    const res = await fetch(`/api/twitch/resolve-username?userId=${encodeURIComponent(numericId)}`);
    if (!res.ok) return false;
    const { username } = await res.json();
    if (!username) return false;
    await linkAndLogin(username);
    return true;
  } catch {
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

// ── Entry point ───────────────────────────────────────────
async function init(twitchAuth) {
  auth = twitchAuth;

  // Re-auth fired after requestIdShare() — don't reload season data
  if (identityRequestPending) {
    identityRequestPending = false;

    if (auth.userId?.startsWith('U')) {
      // Identity granted — resolve Twitch login automatically
      const resolved = await tryResolveFromTwitch();
      if (resolved) return;
    }
    // Identity denied or resolution failed — fall back to manual form
    renderSeasonHeader('login-season-header');
    showState('enterUsername');
    return;
  }

  showState('loading');

  const ok = await loadSeason();
  if (!ok) return;

  // 1. Existing opaque-ID → username mapping (returning users)
  const autoLoggedIn = await tryAutoLogin();
  if (autoLoggedIn) return;

  // 2. Identity already shared from a previous session
  if (auth.userId?.startsWith('U')) {
    const resolved = await tryResolveFromTwitch();
    if (resolved) return;
  }

  // 3. Request identity sharing — onAuthorized will fire again when user responds
  if (window.Twitch?.ext?.actions?.requestIdShare) {
    identityRequestPending = true;
    window.Twitch.ext.actions.requestIdShare();
    return; // stay on loading screen while the popup is open
  }

  // 4. No identity sharing available (dev mode / old helper) — manual form
  renderSeasonHeader('login-season-header');
  showState('enterUsername');
}

// ── Event wiring ──────────────────────────────────────────
document.getElementById('username-form').addEventListener('submit', async e => {
  e.preventDefault();
  const input = document.getElementById('username-input');
  const username = input.value.trim().toLowerCase();
  if (!username) return;
  showState('loading');
  await linkAndLogin(username);
});

document.getElementById('change-user-btn').addEventListener('click', () => {
  currentUsername = null;
  collections = [];
  document.getElementById('username-input').value = '';
  renderSeasonHeader('login-season-header');
  showState('enterUsername');
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
