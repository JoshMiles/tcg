'use strict';

// ── Rarity colours matching the admin panel ──────────────
const RARITY_COLOR = { 1: '#6b7280', 2: '#22c55e', 3: '#3b82f6', 4: '#a855f7', 5: '#f59e0b' };
// Keep in sync with lib/rarity.ts
const RARITY_LABEL = { 1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary' };

// ── Variants ──────────────────────────────────────────────
// Collection entries encode the variant: cardNumber + VARIANT_OFFSET * variantIndex (regular = plain number).
// Keep in sync with lib/variants.ts.
const VARIANTS = ['regular', 'reverse', 'full', 'shiny'];
const VARIANT_OFFSET = 1000000;
const VARIANT_LABELS = { regular: 'Regular', reverse: 'Reverse Holo', full: 'Full Art', shiny: 'Shiny Full Art' };
function decodeEntry(entry) {
  const idx = Math.min(Math.floor(entry / VARIANT_OFFSET), VARIANTS.length - 1);
  return { cardNumber: entry - idx * VARIANT_OFFSET, variant: VARIANTS[idx] };
}

// Art for a variant: Full Art and Shiny use the card's full-art image when it has one.
function variantArt(card, variant) {
  if ((variant === 'full' || variant === 'shiny') && card.fullArtImageUrl) {
    return { imageUrl: card.fullArtImageUrl, thumbUrl: card.fullArtThumbUrl || card.fullArtImageUrl };
  }
  return { imageUrl: card.imageUrl, thumbUrl: card.thumbUrl };
}

// Clips the holo sheen to the art's own shape: the static thumbnail has the same rounded transparent corners.
function setArtMask(el, art) {
  const thumb = art && art.thumbUrl && art.thumbUrl !== art.imageUrl ? art.thumbUrl : null;
  el.style.setProperty('--art-mask', thumb ? 'url("' + thumb + '")' : 'none');
}

// The holographic shimmer for a card's variant: the same settings as the OBS overlay (Overlay Editor -> Variants), sent per
// card by the season API as CSS variables (see lib/holo.ts). .holo-live makes it sweep on its own; otherwise it sweeps on hover.
function applyHolo(el, card, variant, live) {
  const spec = card.holo && card.holo[variant];
  if (!spec || !spec.on) return;
  el.classList.add('holo-fx');
  if (live) el.classList.add('holo-live');
  for (const k in spec.style) el.style.setProperty(k, spec.style[k]);
}

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
  closeDetail(); // never leave the card overlay open across login/logout/state changes
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
  const ownedCount = activeColl ? new Set(activeColl.ownedNumbers.map(e => decodeEntry(e).cardNumber)).size : 0;
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
// How many of `card` the viewer has: pulls in the active season, plus per-season counts for any
// past seasons. The collection arrays keep duplicates (one entry per pull).
function cardStatus(card) {
  let activeCount = 0;
  const variants = { regular: 0, reverse: 0, full: 0, shiny: 0 }; // active season, per variant
  const past = []; // [{ seasonName, count }]
  for (const c of collections) {
    let count = 0;
    for (const entry of c.ownedNumbers) {
      const d = decodeEntry(entry);
      if (d.cardNumber !== card.number) continue;
      count++;
      if (c.active) variants[d.variant]++;
    }
    if (!count) continue;
    if (c.active) activeCount += count;
    else past.push({ seasonName: c.seasonName, count });
  }
  // Highest variant owned this season (drives the art and the holo look)
  let best = 'regular';
  for (const v of VARIANTS) if (variants[v] > 0) best = v;
  return { activeCount, variants, best, past, owned: activeCount > 0 || past.length > 0 };
}

function renderGrid() {
  const grid = document.getElementById('card-grid');
  if (!grid || !season) return;
  grid.innerHTML = '';

  const pack = season.packs[currentPackIdx];
  if (!pack) return;

  pack.cards.forEach((card, idx) => {
    const status        = cardStatus(card);
    const ownedActive   = status.activeCount > 0;
    const ownedPast     = status.past;
    const isOwned       = status.owned;

    const cell = document.createElement('div');
    cell.className = 'card-cell' + (isOwned ? ' owned' : '');

    // Click / Enter / Space opens the card detail view
    cell.setAttribute('role', 'button');
    cell.tabIndex = 0;
    cell.setAttribute('aria-label', isOwned ? card.name : 'Undiscovered card #' + card.number);
    cell.addEventListener('click', () => openDetail(idx, cell));
    cell.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openDetail(idx, cell);
      }
    });

    if (isOwned) {
      const color = RARITY_COLOR[card.stars] || '#fbbf24';
      cell.style.setProperty('--rarity-color', color);

      // dimmed — pulled in past season only
      addCardImage(cell, { ...card, ...variantArt(card, status.best) }, { alt: card.name, dimmed: !ownedActive && ownedPast.length > 0 });

      // Upgraded variants get a holo sheen / glow, and a marker
      if (ownedActive) applyHolo(cell, card, status.best, false);
      if (ownedActive && status.best !== 'regular') {
        cell.classList.add('vfx-' + status.best);
        setArtMask(cell, variantArt(card, status.best));
        const mark = document.createElement('div');
        mark.className = 'variant-mark';
        mark.textContent = status.best === 'reverse' ? 'RH' : status.best === 'full' ? 'FA' : '\u2728';
        mark.title = VARIANT_LABELS[status.best];
        cell.appendChild(mark);
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
      const pullCount = status.activeCount;
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

// ── Card detail view ──────────────────────────────────────
// Clicking a card opens an overlay with a large version of it and how many the viewer has.
// Undiscovered cards open as a locked "???" view (same secrecy as the grid), and prev/next
// browse the current pack.
let detailIdx   = -1;    // index into the current pack's cards, or -1 when closed
let detailVariant = null; // variant being previewed in the detail view (null = best owned)
let upgradeMsg  = '';    // result of the last upgrade attempt, shown under the variant list
let detailOpener = null; // element to refocus on close

function openDetail(idx, opener) {
  detailIdx = idx;
  detailVariant = null;
  upgradeMsg = '';
  if (opener) detailOpener = opener;
  document.getElementById('card-detail').classList.remove('hidden');
  renderDetail();
  document.getElementById('detail-close').focus();
}

function closeDetail() {
  const el = document.getElementById('card-detail');
  if (!el || detailIdx === -1) return;
  detailIdx = -1;
  detailVariant = null;
  upgradeMsg = '';
  el.classList.add('hidden');
  document.getElementById('detail-art').innerHTML = '';
  if (detailOpener && document.contains(detailOpener)) detailOpener.focus();
  detailOpener = null;
}

function stepDetail(delta) {
  const cards = season?.packs[currentPackIdx]?.cards ?? [];
  if (detailIdx === -1 || cards.length === 0) return;
  detailIdx = (detailIdx + delta + cards.length) % cards.length;
  detailVariant = null;
  upgradeMsg = '';
  renderDetail();
}

function detailLine(className, text) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return el;
}

function renderDetail() {
  const pack = season?.packs[currentPackIdx];
  const card = pack?.cards[detailIdx];
  if (!card) { closeDetail(); return; }

  const status = cardStatus(card);
  const color = RARITY_COLOR[card.stars] || '#fbbf24';
  const art = document.getElementById('detail-art');
  const info = document.getElementById('detail-info');
  art.innerHTML = '';
  info.innerHTML = '';
  art.style.setProperty('--rarity-color', color);
  info.style.setProperty('--rarity-color', color);

  // Art: owned cards show the thumbnail immediately, then the animated version fades in over it.
  // With upgrades on, it shows the variant being previewed (default: the best one owned).
  const shown = detailVariant && status.variants[detailVariant] > 0 ? detailVariant : status.best;
  const shownArt = variantArt(card, shown);
  art.className = 'detail-art' + (status.owned && shown !== 'regular' ? ' vfx-' + shown : '');
  setArtMask(art, shownArt);
  if (status.owned) applyHolo(art, card, shown, true);
  if (status.owned && shownArt.imageUrl) {
    const thumb = document.createElement('img');
    thumb.src = shownArt.thumbUrl || shownArt.imageUrl;
    thumb.alt = card.name;
    art.appendChild(thumb);
    if (shownArt.thumbUrl && shownArt.thumbUrl !== shownArt.imageUrl && !reducedMotion) {
      const full = document.createElement('img');
      full.className = 'anim-overlay';
      full.alt = '';
      full.addEventListener('load', () => { full.style.opacity = '1'; });
      full.src = shownArt.imageUrl;
      art.appendChild(full);
    }
  } else {
    art.appendChild(detailLine('detail-locked', '?'));
  }

  // Text
  info.appendChild(detailLine('detail-name', status.owned ? card.name : '???'));
  info.appendChild(detailLine('detail-rarity',
    '★'.repeat(card.stars) + ' ' + (RARITY_LABEL[card.stars] || '')));
  info.appendChild(detailLine('detail-meta',
    '#' + card.number + ' · ' + pack.packName + ' · ' + (detailIdx + 1) + ' of ' + pack.cards.length));

  // How many the viewer has
  const count = document.createElement('div');
  count.className = 'detail-count' + (status.activeCount > 0 ? '' : ' empty');
  const num = document.createElement('span');
  num.className = 'detail-count-num';
  const label = document.createElement('span');
  label.className = 'detail-count-label';
  if (status.activeCount > 0) {
    num.textContent = '×' + status.activeCount;
    label.textContent = status.activeCount === 1 ? 'Pulled once' : 'Pulled ' + status.activeCount + ' times';
  } else if (status.owned) {
    num.textContent = '×0';
    label.textContent = 'Not pulled this season';
  } else {
    num.textContent = '—';
    label.textContent = 'Not collected yet';
  }
  count.append(num, label);
  info.appendChild(count);

  // Variants & upgrades (only for cards in packs with upgrades on)
  if (card.upgradesEnabled && status.activeCount > 0) {
    const list = document.createElement('div');
    list.className = 'variant-list';
    const allowed = card.variants || VARIANTS;
    VARIANTS.forEach(v => {
      const n = status.variants[v];
      // A variant that is switched off for this card is hidden unless the viewer already owns one.
      if (n === 0 && !allowed.includes(v)) return;
      // The next variant up that is on; skipping a switched-off one costs the product of the steps crossed.
      let next = null, cost = 1;
      for (let k = VARIANTS.indexOf(v) + 1; k < VARIANTS.length; k++) {
        cost *= Math.max(1, pack.upgradeCosts?.[VARIANTS[k]] || 1);
        if (allowed.includes(VARIANTS[k])) { next = VARIANTS[k]; break; }
      }
      if (!next) cost = 0;

      const row = document.createElement('div');
      row.className = 'variant-row' + (n === 0 ? ' none' : '') + (v === shown ? ' active' : '');
      if (n > 0) row.addEventListener('click', () => { detailVariant = v; renderDetail(); });

      const name = document.createElement('span');
      name.className = 'variant-name';
      name.textContent = VARIANT_LABELS[v];
      const cnt = document.createElement('span');
      cnt.className = 'variant-count';
      cnt.textContent = '\u00d7' + n;
      row.append(name, cnt);

      if (next && cost) {
        const btn = document.createElement('button');
        btn.className = 'upgrade-btn';
        const can = n >= cost;
        btn.disabled = !can;
        btn.textContent = can ? 'Upgrade' : n + '/' + cost;
        btn.title = can
          ? 'Spend ' + cost + ' ' + VARIANT_LABELS[v] + ' for 1 ' + VARIANT_LABELS[next]
          : 'Need ' + cost + ' ' + VARIANT_LABELS[v] + ' to make 1 ' + VARIANT_LABELS[next];
        btn.addEventListener('click', e => { e.stopPropagation(); upgrade(card, v, btn); });
        row.appendChild(btn);
      }
      list.appendChild(row);
    });
    info.appendChild(list);
    if (upgradeMsg) info.appendChild(detailLine('upgrade-msg', upgradeMsg));
  }

  // Past seasons
  if (status.past.length > 0) {
    const past = document.createElement('div');
    past.className = 'detail-past';
    status.past.forEach(p => {
      const row = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = p.seasonName;
      row.append(strong, ' · ×' + p.count);
      past.appendChild(row);
    });
    info.appendChild(past);
  }
}

document.getElementById('detail-close').addEventListener('click', closeDetail);
document.getElementById('detail-backdrop').addEventListener('click', closeDetail);
document.getElementById('detail-prev').addEventListener('click', () => stepDetail(-1));
document.getElementById('detail-next').addEventListener('click', () => stepDetail(1));
document.addEventListener('keydown', e => {
  if (detailIdx === -1) return;
  if (e.key === 'Escape') closeDetail();
  else if (e.key === 'ArrowLeft') stepDetail(-1);
  else if (e.key === 'ArrowRight') stepDetail(1);
});

// Spends duplicates of `from` for one copy of the next variant. The server decides everything (cost,
// whether upgrades are on, whether the viewer has enough); this just reports the outcome.
// The upgrade moment (mirrors app/components/UpgradeCeremony.tsx; styles are the .ug-* rules in panel.css): the spent copies
// spiral into the middle, a flash, then the new variant is revealed with its holo / glow. Tap or Esc to continue.
function playUpgradeCeremony(card, from, to, cost) {
  const artFor = v => ((v === 'full' || v === 'shiny') && card.fullArtImageUrl
    ? { imageUrl: card.fullArtImageUrl, thumbUrl: card.fullArtThumbUrl || card.fullArtImageUrl }
    : { imageUrl: card.imageUrl, thumbUrl: card.thumbUrl || card.imageUrl });
  const fromArt = artFor(from), toArt = artFor(to);
  const PILL = { reverse: 'linear-gradient(90deg,#8b5cf6,#ec4899)', full: 'linear-gradient(90deg,#0ea5e9,#6366f1)', shiny: 'linear-gradient(90deg,#f59e0b,#ef4444,#a855f7)' };

  const overlay = document.createElement('div');
  overlay.className = 'ug-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Upgraded ' + card.name + ' to ' + VARIANT_LABELS[to]);
  const stage = document.createElement('div');
  stage.className = 'ug-stage';
  // The stage is designed at 340x520; shrink it to fit the (small) panel.
  const fit = Math.min(1, window.innerWidth / 360, window.innerHeight / 540);
  stage.style.transform = 'scale(' + fit + ')';

  const add = (cls, parent) => { const el = document.createElement('div'); el.className = cls; (parent || stage).appendChild(el); return el; };
  add('ug-ring').setAttribute('aria-hidden', 'true');
  const n = Math.min(Math.max(cost, 2), 10);
  for (let i = 0; i < n; i++) {
    const ing = add('ug-ingredient' + (from === 'regular' ? '' : ' vfx-' + from));
    setArtMask(ing, fromArt);
    applyHolo(ing, card, from, true);
    ing.style.setProperty('--a', (360 / n) * i + 'deg');
    ing.style.setProperty('--d', i * 70 + 'ms');
    const img = document.createElement('img');
    img.src = fromArt.thumbUrl; img.alt = '';
    ing.appendChild(img);
  }
  add('ug-flash');
  const frame = add('ug-card');
  const art = add('ug-art' + (to === 'regular' ? '' : ' vfx-' + to), frame);
  setArtMask(art, toArt);
  applyHolo(art, card, to, true);
  const thumb = document.createElement('img');
  thumb.src = toArt.thumbUrl; thumb.alt = card.name;
  art.appendChild(thumb);
  if (toArt.thumbUrl !== toArt.imageUrl && !reducedMotion) {
    const anim = document.createElement('img');
    anim.className = 'ug-anim'; anim.alt = ''; anim.setAttribute('aria-hidden', 'true');
    anim.addEventListener('load', () => anim.classList.add('ug-anim-on'));
    anim.src = toArt.imageUrl;
    art.appendChild(anim);
  }
  if (to === 'full' || to === 'shiny') {
    for (let i = 0; i < 16; i++) {
      const sp = document.createElement('span');
      sp.className = 'ug-spark';
      sp.textContent = i % 2 ? '\u2726' : '\u2727';
      sp.style.color = to === 'shiny' ? '#ffd24d' : '#7cc7ff';
      sp.style.setProperty('--x', Math.round(Math.cos((i / 16) * Math.PI * 2) * (130 + (i % 3) * 40)) + 'px');
      sp.style.setProperty('--y', Math.round(Math.sin((i / 16) * Math.PI * 2) * (150 + (i % 4) * 30)) + 'px');
      stage.appendChild(sp);
    }
  }
  const text = add('ug-text');
  const line = (cls, content) => { const p = document.createElement('p'); p.className = cls; p.textContent = content; text.appendChild(p); return p; };
  line('ug-title', 'Upgraded!');
  line('ug-card-name', card.name);
  const pill = line('ug-pill', VARIANT_LABELS[to]);
  pill.style.background = PILL[to] || PILL.reverse;
  line('ug-sub', cost + '\u00d7 ' + VARIANT_LABELS[from] + ' \u2192 1 ' + VARIANT_LABELS[to]);
  const hint = line('ug-hint', '\u00a0');

  let closable = false;
  const close = () => {
    if (!closable) return;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };
  const onKey = e => { if (e.key === 'Escape' || e.key === 'Enter') close(); };
  setTimeout(() => { closable = true; hint.textContent = 'Tap anywhere to continue'; }, 1800);
  setTimeout(() => { closable = true; close(); }, 9000);
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  overlay.appendChild(stage);
  document.body.appendChild(overlay);
}

async function upgrade(card, from, btn) {
  if (!auth?.token || !season) return;
  btn.disabled = true;
  btn.textContent = '\u2026';
  try {
    const res = await fetch('/api/twitch/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + auth.token },
      body: JSON.stringify({ seasonId: season.seasonId, cardNumber: card.number, from }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      const active = collections.find(c => c.active);
      if (active) active.ownedNumbers = body.owned;
      // The server says where the upgrade went (a switched-off variant is skipped) and what it cost.
      detailVariant = body.to || VARIANTS[VARIANTS.indexOf(from) + 1];
      upgradeMsg = '\u2728 Upgraded to ' + VARIANT_LABELS[detailVariant] + '!';
      renderSeasonHeader('collection-season-header');
      renderGrid();
      playUpgradeCeremony(card, from, detailVariant, body.cost || 0);
    } else {
      upgradeMsg = body.error || 'Upgrade failed (' + res.status + ')';
    }
  } catch {
    upgradeMsg = 'Could not reach the server';
  }
  if (detailIdx !== -1) renderDetail();
}

// ── Leaderboard ───────────────────────────────────────────
let currentView = 'collection';
let leaderboardLoadedAt = 0;

function setView(view) {
  currentView = view;
  closeDetail();
  document.querySelectorAll('#view-tabs .view-tab').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.getElementById('pack-tabs').classList.toggle('hidden', view !== 'collection');
  document.getElementById('collection-area').classList.toggle('hidden', view !== 'collection');
  document.getElementById('leaderboard-area').classList.toggle('hidden', view !== 'leaderboard');
  if (view === 'leaderboard') loadLeaderboard();
}

function boardRow(r, me) {
  const row = document.createElement('a');
  row.className = 'lb-row' + (r.username === me ? ' me' : '') + (r.rank <= 3 ? ' top' + r.rank : '');
  row.href = new URL('/collection/' + encodeURIComponent(r.username), window.location.origin).href;
  row.target = '_blank';
  row.rel = 'noopener noreferrer';

  const rank = document.createElement('span');
  rank.className = 'lb-rank';
  rank.textContent = r.rank === 1 ? '\ud83e\udd47' : r.rank === 2 ? '\ud83e\udd48' : r.rank === 3 ? '\ud83e\udd49' : '#' + r.rank;

  const who = document.createElement('span');
  who.className = 'lb-who';
  const name = document.createElement('span');
  name.className = 'lb-name';
  name.textContent = r.username;
  const sub = document.createElement('span');
  sub.className = 'lb-sub';
  const v = r.variants;
  const extras = [];
  if (v.reverse) extras.push(v.reverse + ' RH');
  if (v.full) extras.push(v.full + ' FA');
  if (v.shiny) extras.push(v.shiny + ' \u2728');
  sub.textContent = r.uniqueCards + ' cards' + (extras.length ? ' \u00b7 ' + extras.join(' \u00b7 ') : '');
  who.append(name, sub);

  const score = document.createElement('span');
  score.className = 'lb-score';
  score.textContent = r.score.toLocaleString();

  row.append(rank, who, score);
  return row;
}

async function loadLeaderboard() {
  const area = document.getElementById('leaderboard-area');
  if (!area || !season) return;
  // Re-fetch at most every 30s while flipping between tabs
  if (Date.now() - leaderboardLoadedAt < 30000 && area.childElementCount > 0) return;
  area.innerHTML = '';
  area.appendChild(detailLine('lb-note', 'Loading\u2026'));
  try {
    const q = new URLSearchParams({ seasonId: season.seasonId });
    if (currentUsername) q.set('username', currentUsername.toLowerCase());
    const res = await fetch('/api/twitch/leaderboard?' + q);
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();
    leaderboardLoadedAt = Date.now();
    area.innerHTML = '';

    area.appendChild(detailLine('lb-note', data.seasonName + ' \u00b7 ' + data.players + ' collector' + (data.players === 1 ? '' : 's')));
    if (data.rows.length === 0) {
      area.appendChild(detailLine('lb-note', 'No one is on the board yet.'));
      return;
    }
    const me = currentUsername ? currentUsername.toLowerCase() : null;
    data.rows.forEach(r => area.appendChild(boardRow(r, me)));
    if (data.me && data.me.rank > data.rows.length) {
      area.appendChild(detailLine('lb-note', '\u2026'));
      area.appendChild(boardRow(data.me, me));
    }
    area.appendChild(detailLine('lb-foot', 'Score = value of every card you own. Rarer cards, rarer variants and cards few people have are worth more.'));
  } catch {
    area.innerHTML = '';
    area.appendChild(detailLine('lb-note', 'Could not load the leaderboard.'));
  }
}

document.querySelectorAll('#view-tabs .view-tab').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

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
  leaderboardLoadedAt = 0;
  setView('collection');
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
  if (nameEl) nameEl.textContent = season?.seasonName ?? 'The Cheesy TCG';
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
  leaderboardLoadedAt = 0;
  if (currentView === 'leaderboard') await loadLeaderboard();
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
