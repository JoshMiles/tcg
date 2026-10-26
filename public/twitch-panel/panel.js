'use strict';

// ── Where the site lives ─────────────────────────────────
// window.TCG_SITE (config.js) is '' when this panel is served by the site itself (local testing, or Twitch's Testing Base URI pointing at it):
// the API and card art are then on the same origin. In the hosted package Twitch serves these files from its own domain, so config.js
// holds the site's address and every API call and card image goes there (the site allows it with CORS, see middleware.ts).
const SITE = String(window.TCG_SITE || '').replace(/\/$/, '');
const api = path => SITE + path;
const absUrl = u => (SITE && typeof u === 'string' && u.charAt(0) === '/' && u.charAt(1) !== '/' ? SITE + u : u);
/** Makes the card art URLs in an API response absolute (they come back as /assets/... paths). */
function absolutizeUrls(o) {
  if (!SITE || !o || typeof o !== 'object') return o;
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (typeof v === 'string') { if (/(image|thumb)url$/i.test(k)) o[k] = absUrl(v); }
    else if (v && typeof v === 'object') absolutizeUrls(v);
  }
  return o;
}

// ── Rarity colours matching the admin panel ──────────────
const RARITY_COLOR = { 1: '#6b7280', 2: '#22c55e', 3: '#3b82f6', 4: '#a855f7', 5: '#f59e0b' };
// Keep in sync with lib/rarity.ts
const RARITY_LABEL = { 1: 'Common', 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary' };

// ── Variants ──────────────────────────────────────────────
// Collection entries encode the variant: cardNumber + VARIANT_OFFSET * variantIndex (regular = plain number).
// Keep in sync with lib/variants.ts.
const VARIANTS = ['regular', 'reverse', 'full', 'shiny', 'golden'];
const VARIANT_OFFSET = 1000000;
const VARIANT_LABELS = { regular: 'Regular', reverse: 'Reverse Holo', full: 'Full Art', shiny: 'Full Art Holo', golden: 'Golden' };
const VARIANT_SHORT = { reverse: 'RH', full: 'FA', shiny: 'FH', golden: 'GD' };
// Full Art, Full Art Holo and Golden all use the card's full-art image when it has one (mirrors usesFullArt in lib/variants.ts).
const usesFullArt = v => v === 'full' || v === 'shiny' || v === 'golden';
function decodeEntry(entry) {
  const idx = Math.min(Math.floor(entry / VARIANT_OFFSET), VARIANTS.length - 1);
  return { cardNumber: entry - idx * VARIANT_OFFSET, variant: VARIANTS[idx] };
}

// Art for a variant: see usesFullArt.
function variantArt(card, variant) {
  if (usesFullArt(variant) && card.fullArtImageUrl) {
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

// Reads a claim from the (unverified) Extension JWT. Only used for UX decisions. The server
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
let me                     = null;   // /api/twitch/me: rank, score breakdown, card values, serials, waiting offers (null until loaded)
let collectionFilter       = 'all';  // 'all' | 'have' | 'missing' (Collection view)
let lastLoadAt             = 0;      // when the collection was last fetched (refreshes when the panel comes back into view)

// ── Serial numbers & points ───────────────────────────────
// Every copy has a number (per card and version); the first copies ever made of a card are worth extra. Mirrors serialMultiplier()
// in lib/scoring-core.ts: #1 gets bonus.max, fading in a straight line to nothing after bonus.cutoff. Values come from /api/twitch/me.
const entryOf = (cardNumber, variant) => cardNumber + VARIANT_OFFSET * VARIANTS.indexOf(variant);
const fmtNum = n => Math.round(n).toLocaleString();
function serialMult(n) {
  if (!me || !(n >= 1) || n > me.bonus.cutoff) return 1;
  return 1 + (me.bonus.max - 1) * (1 - (n - 1) / me.bonus.cutoff);
}
function copyPts(cardNumber, variant, serial) {
  const c = me && me.cards[cardNumber];
  if (!c) return 0;
  const i = VARIANTS.indexOf(variant), m = serialMult(serial);
  return m === 1 ? c.values[i] : Math.max(1, Math.round(c.raw[i] * m));
}
// The viewer's serial numbers for one card in one version, lowest first (empty until the copies are numbered).
const heldSerials = (cardNumber, variant) => (me && me.serials && me.serials[entryOf(cardNumber, variant)]) || [];
// The viewer's editions of one card in one version ({ n, uid?, at, date, origin, made?, est? }, lowest first); empty until editions are numbered.
const heldEditions = (cardNumber, variant) => (me && me.editions && me.editions[entryOf(cardNumber, variant)]) || [];
const isFavourite = e => !!(e && e.uid && me && me.favourites && me.favourites.indexOf(e.uid) !== -1);
// "Edition #12 of 340" (the site's wording); "~" marks a number worked out after the fact.
const editionLabel = e => (e.est ? '~' : '') + '#' + e.n + (e.made ? ' of ' + e.made.toLocaleString() : '');
// Streamer / Admin / Mod chip, as the website shows next to a name (kind comes from the API, null = none).
const BADGE_LABELS = { streamer: 'Streamer', admin: 'Admin', mod: 'Mod' };
const staffChip = kind => (kind && BADGE_LABELS[kind]) ? el('span', 'staff-badge ' + kind, BADGE_LABELS[kind]) : null;
// What the viewer's copies of a card are worth, serial bonuses included (null until /api/twitch/me has loaded).
function cardWorth(card, variants) {
  if (!me || !me.cards[card.number]) return null;
  let total = 0;
  for (const v of VARIANTS) {
    const n = variants[v];
    if (!n) continue;
    const serials = heldSerials(card.number, v);
    for (let k = 0; k < n; k++) total += copyPts(card.number, v, serials[k]);
  }
  return total;
}
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

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
  const host = document.getElementById(containerId);
  if (!host || !season) return;

  const totalCards = season.packs.reduce((s, p) => s + p.cards.length, 0);
  const activeColl = collections.find(c => c.active);
  const ownedCount = activeColl ? new Set(activeColl.ownedNumbers.map(e => decodeEntry(e).cardNumber)).size : 0;
  const totalPulls = activeColl ? activeColl.ownedNumbers.length : 0;
  const pct = totalCards > 0 ? Math.round(ownedCount / totalCards * 100) : 0;

  host.innerHTML = '';

  // Season name on the left; rank and score (once loaded) on the right.
  const top = el('div', 'season-top');
  const titleEl = el('div', 'season-title', season.seasonName);
  top.appendChild(titleEl);
  host.appendChild(top);

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
      ? `${ownedCount}/${totalCards} collected · ${pct}% · ${totalPulls} pulls`
      : `${ownedCount}/${totalCards} collected · ${pct}%`;

    row.appendChild(bar);
    row.appendChild(label);
    host.appendChild(row);

    // Rank and score once /api/twitch/me has loaded: one tap opens the Stats view.
    if (me && me.row && me.rank) {
      const chip = document.createElement('button');
      chip.className = 'rank-chip';
      chip.type = 'button';
      chip.title = 'See how your points add up';
      const rank = document.createElement('strong');
      rank.textContent = '#' + me.rank;
      chip.append(rank, ' of ' + me.players + ' \u00b7 ' + fmtNum(me.row.score) + ' pts');
      chip.addEventListener('click', () => setView('stats'));
      top.appendChild(chip);
    }
  }
}

// ── Pack tabs ─────────────────────────────────────────────
function renderPackTabs() {
  const tabs = document.getElementById('pack-tabs');
  if (!tabs || !season) return;
  tabs.innerHTML = '';
  tabs.classList.toggle('single', season.packs.length < 2); // one pack: its name adds nothing, so the row is dropped

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
  const variants = { regular: 0, reverse: 0, full: 0, shiny: 0, golden: 0 }; // active season, per variant
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

// Have / Missing filter above the grid, with how many cards fall in each (for the current pack).
function renderGridTools() {
  const host = document.getElementById('grid-tools');
  const pack = season && season.packs[currentPackIdx];
  if (!host || !pack) return;
  host.innerHTML = '';
  const have = pack.cards.filter(c => cardStatus(c).owned).length;
  const counts = { all: pack.cards.length, have, missing: pack.cards.length - have };
  const group = el('div', 'seg');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Show');
  [['all', 'All'], ['have', 'Have'], ['missing', 'Missing']].forEach(([id, label]) => {
    const b = el('button', 'seg-btn' + (collectionFilter === id ? ' active' : ''), label + ' ' + counts[id]);
    b.type = 'button';
    b.setAttribute('aria-pressed', collectionFilter === id ? 'true' : 'false');
    b.addEventListener('click', () => { collectionFilter = id; renderGrid(); });
    group.appendChild(b);
  });
  host.appendChild(group);
}

function renderGrid() {
  const grid = document.getElementById('card-grid');
  if (!grid || !season) return;
  grid.innerHTML = '';
  renderGridTools();

  const pack = season.packs[currentPackIdx];
  if (!pack) return;

  let shownCount = 0;
  pack.cards.forEach((card, idx) => {
    const status        = cardStatus(card);
    const ownedActive   = status.activeCount > 0;
    const ownedPast     = status.past;
    const isOwned       = status.owned;
    if (collectionFilter === 'have' && !isOwned) return;
    if (collectionFilter === 'missing' && isOwned) return;
    shownCount++;

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

      // dimmed, pulled in past season only
      addCardImage(cell, { ...card, ...variantArt(card, status.best) }, { alt: card.name, dimmed: !ownedActive && ownedPast.length > 0 });

      // Upgraded variants get a holo sheen / glow, and a marker
      if (ownedActive) applyHolo(cell, card, status.best, false);
      if (ownedActive && status.best !== 'regular') {
        cell.classList.add('vfx-' + status.best);
        setArtMask(cell, variantArt(card, status.best));
        const mark = document.createElement('div');
        mark.className = 'variant-mark';
        mark.textContent = VARIANT_SHORT[status.best];
        mark.title = VARIANT_LABELS[status.best];
        cell.appendChild(mark);
      }

      // The lowest serial number held of the version shown (gold when it earns a points bonus); needs /api/twitch/me.
      if (ownedActive) {
        const held = heldSerials(card.number, status.best);
        if (held.length) {
          const n = held[0];
          const eds = heldEditions(card.number, status.best);
          const sm = el('div', 'serial-mark' + (serialMult(n) > 1 ? ' bonus' : '') + (n === 1 ? ' first' : ''), (eds[0] && eds[0].est ? '~' : '') + '#' + n);
          sm.title = 'Edition #' + n + (serialMult(n) > 1 ? ' (x' + serialMult(n).toFixed(2) + ' points)' : '');
          if (eds.some(isFavourite)) sm.prepend(el('span', 'heart')); // one of this version's editions is a favourite
          cell.appendChild(sm);
        }
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
  if (shownCount === 0) {
    const msg = el('div', 'grid-empty', collectionFilter === 'missing' ? 'Nothing missing in this pack. Nice!' : 'No cards here yet. Pull some on stream!');
    grid.appendChild(msg);
  }
}

// ── Card detail view ──────────────────────────────────────
// Clicking a card opens an overlay with a large version of it and how many the viewer has.
// Undiscovered cards open as a locked "???" view (same secrecy as the grid), and prev/next
// browse the current pack.
let detailIdx   = -1;    // index into the current pack's cards, or -1 when closed
let detailVariant = null; // variant being previewed in the detail view (null = best owned)
let upgradeMsg  = '';    // result of the last upgrade attempt, shown under the variant list
let detailEdition = null; // { variant, n } of the edition whose details are open in the card details (null = the list)
const editionsExpanded = {}; // version -> whether its full list of editions is shown
let detailOpener = null; // element to refocus on close

function openDetail(idx, opener) {
  detailIdx = idx;
  detailVariant = null;
  detailEdition = null;
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
  detailEdition = null;
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
  detailEdition = null;
  upgradeMsg = '';
  renderDetail();
}

// The next version up that is switched on for this card, and what the step costs; skipping a switched-off version costs the
// product of every step crossed. next is null at the top of the ladder.
function upgradeStepFor(pack, card, v) {
  const allowed = card.variants || VARIANTS;
  let next = null, cost = 1;
  for (let k = VARIANTS.indexOf(v) + 1; k < VARIANTS.length; k++) {
    cost *= Math.max(1, (pack.upgradeCosts && pack.upgradeCosts[VARIANTS[k]]) || 1);
    if (allowed.includes(VARIANTS[k])) { next = VARIANTS[k]; break; }
  }
  return next ? { next, cost } : { next: null, cost: 0 };
}

// "Your editions" in the card details (ROADMAP 34.6, like the site's copies-first dialog): chips grouped by version, each opening
// that edition's details (number, version, when it was made, favourite). Returns an empty node while editions are not numbered.
const EDITIONS_SHOWN = 12;
function editionsSection(card) {
  const wrap = el('div', 'serials');
  const groups = VARIANTS.map(v => ({ v, list: heldEditions(card.number, v) })).filter(g => g.list.length > 0);
  if (groups.length === 0) return wrap;
  const picked = detailEdition && groups.find(g => g.v === detailEdition.variant);
  const ed = picked && picked.list.find(e => e.n === detailEdition.n);
  if (ed) { editionView(wrap, card, picked.v, ed); return wrap; }

  wrap.appendChild(el('div', 'serials-title', 'Your editions'));
  groups.forEach(g => {
    if (groups.length > 1) wrap.appendChild(el('div', 'ed-group', VARIANT_LABELS[g.v]));
    const chips = el('div', 'serial-chips');
    const open = editionsExpanded[g.v];
    (open ? g.list : g.list.slice(0, EDITIONS_SHOWN)).forEach(e => {
      const m = serialMult(e.n);
      const b = el('button', 'serial-chip' + (m > 1 ? ' bonus' : ''));
      b.type = 'button';
      b.title = 'Edition ' + editionLabel(e) + (m > 1 ? ' (x' + m.toFixed(2) + ' points)' : '') + (isFavourite(e) ? ', favourite' : '') + '. Tap for details.';
      if (isFavourite(e)) b.appendChild(el('span', 'heart'));
      b.append((e.est ? '~' : '') + '#' + e.n); // the full "of N" is in the tooltip and the details
      b.addEventListener('click', () => { detailEdition = { variant: g.v, n: e.n }; renderDetail(); });
      chips.appendChild(b);
    });
    if (g.list.length > EDITIONS_SHOWN) {
      const more = el('button', 'serial-more', open ? 'Show fewer' : 'Show all ' + g.list.length);
      more.type = 'button';
      more.addEventListener('click', () => { editionsExpanded[g.v] = !open; renderDetail(); });
      chips.appendChild(more);
    }
    wrap.appendChild(chips);
  });
  if (groups.some(g => g.list.some(e => serialMult(e.n) > 1))) wrap.appendChild(el('div', 'serials-note', 'Low edition numbers earn a points bonus.'));
  return wrap;
}

// One edition's details, fitted to the narrow panel: its number, version, when it was made and how, points, favourite toggle, site link.
function editionView(wrap, card, variant, e) {
  const back = el('button', 'ed-back', '‹ All editions');
  back.type = 'button';
  back.addEventListener('click', () => { detailEdition = null; renderDetail(); });
  wrap.appendChild(back);
  const fav = isFavourite(e);
  wrap.appendChild(el('div', 'ed-title', 'Edition ' + editionLabel(e)));
  const rows = el('dl', 'ed-rows');
  const add = (k, v) => { rows.append(el('dt', null, k), el('dd', null, v)); };
  add('Version', VARIANT_LABELS[variant]);
  if (e.uid) add('Serial number', '#' + e.uid);
  add('Made', e.date + ' · ' + e.origin);
  const m = serialMult(e.n);
  add('Worth', fmtNum(copyPts(card.number, variant, e.n)) + ' pts' + (m > 1 ? ' (x' + m.toFixed(2) + ' edition bonus)' : ''));
  if (e.est) add('Number', 'Worked out after the fact');
  wrap.appendChild(rows);

  const actions = el('div', 'ed-actions');
  if (e.uid) {
    const fb = el('button', 'upgrade-btn ed-fav' + (fav ? ' on' : ''));
    fb.type = 'button';
    fb.append(el('span', 'heart'), fav ? 'Favourite' : 'Make favourite');
    fb.title = fav ? 'Take the favourite mark off' : 'A favourite can\'t be traded or spent in an upgrade';
    fb.setAttribute('aria-pressed', fav ? 'true' : 'false');
    fb.addEventListener('click', () => toggleFavourite(e, fb));
    actions.appendChild(fb);
  }
  const copyPath = '/copy/' + encodeURIComponent(season.seasonId) + '/' + card.number + '.' + VARIANTS.indexOf(variant) + '.' + e.n;
  actions.append(statLink('Open page', copyPath, 'ed-link'), statLink('Share image', copyPath, 'ed-link')); // the share image is made on that page
  wrap.appendChild(actions);
  if (fav) wrap.appendChild(el('div', 'serials-note', 'Favourites are kept out of trades and upgrades.'));
}

// Favourite an edition (or take it off) through the same rules as the website; the server checks the edition is the viewer's.
async function toggleFavourite(e, btn) {
  if (!e.uid || !auth || !auth.token) return;
  btn.disabled = true;
  try {
    const res = await fetch(api('/api/twitch/favourite'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + auth.token },
      body: JSON.stringify({ uid: e.uid, on: !isFavourite(e) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) showToast(body.error || 'Could not change the favourite.');
    else {
      const rest = (me.favourites || []).filter(u => u !== e.uid);
      me.favourites = body.favourite ? rest.concat(e.uid) : rest;
      if (tradesData) tradesData.favourites = me.favourites; // the trade pickers read it
      renderGrid();
    }
  } catch {
    showToast('Could not reach the server.');
  }
  renderDetail();
}

// Looking for (the website's wish list, same list as its Look for button) and a way to the saved alerts, which stay on the site.
function wantRow(card) {
  const row = el('div', 'want-row');
  if (me) {
    const on = (me.wanted || []).includes(card.number);
    const b = el('button', 'upgrade-btn want-btn' + (on ? ' on' : ''), on ? 'Looking for' : 'Look for');
    b.type = 'button';
    b.title = on ? 'Take it off your Looking for list' : 'Add it to your Looking for list (' + (me.wanted || []).length + ' of ' + me.wantedMax + ' used)';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.addEventListener('click', () => toggleWant(card, !on, b));
    row.appendChild(b);
  }
  row.appendChild(statLink('Alerts on the site', '/settings#watches', 'ed-link'));
  return row;
}

async function toggleWant(card, on, btn) {
  if (!auth || !auth.token) return;
  btn.disabled = true;
  try {
    const res = await fetch(api('/api/twitch/want'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + auth.token },
      body: JSON.stringify({ cardNumber: card.number, on }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.ok) showToast(body.error || 'Could not change your Looking for list.');
    else me.wanted = body.wanted;
  } catch {
    showToast('Could not reach the server.');
  }
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
  // Odds and how many exist (from /api/twitch/me); undiscovered cards keep their secrecy.
  const facts = me && me.cards[card.number];
  if (facts && status.owned) {
    info.appendChild(detailLine('detail-facts', '1 in ' + Math.round(1 / facts.pullRate).toLocaleString() + ' per pack · ' + facts.copies.toLocaleString() + (facts.copies === 1 ? ' edition' : ' editions') + ' out there'));
  }

  // The viewer's editions come first: a list, and tapping one shows that edition's details.
  if (status.activeCount > 0) info.appendChild(editionsSection(card));

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
    num.textContent = '-';
    label.textContent = 'Not collected yet';
  }
  count.append(num, label);
  info.appendChild(count);
  const worth = status.activeCount > 0 ? cardWorth(card, status.variants) : null;
  if (worth !== null) info.appendChild(detailLine('detail-worth', 'Worth ' + fmtNum(worth) + ' pts'));
  info.appendChild(wantRow(card));

  // Variants & upgrades (only for cards in packs with upgrades on)
  if (card.upgradesEnabled && status.activeCount > 0) {
    const list = document.createElement('div');
    list.className = 'variant-list';
    const allowed = card.variants || VARIANTS;
    VARIANTS.forEach(v => {
      const n = status.variants[v];
      // A variant that is switched off for this card is hidden unless the viewer already owns one.
      if (n === 0 && !allowed.includes(v)) return;
      const { next, cost } = upgradeStepFor(pack, card, v);

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
      if (me && me.cards[card.number]) {
        const pts = el('span', 'variant-pts', fmtNum(me.cards[card.number].values[VARIANTS.indexOf(v)]) + ' pts');
        pts.title = 'Points for one edition of this version (a low edition number is worth more)';
        row.appendChild(pts);
      }

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

  // Trainer cards: use one (two taps, spends 1 Regular edition and starts its buff, like the website).
  if (card.kind === 'trainer' && status.variants.regular > 0) {
    const row = el('div', 'trainer-use');
    const useBtn = confirmButton('Use trainer card', 'upgrade-btn', () => useTrainer(card));
    useBtn.title = 'Use this trainer card (' + card.name + '). Tap twice: consumes 1 Regular edition.';
    row.appendChild(useBtn);
    info.appendChild(row);
    info.appendChild(detailLine('upgrade-msg', 'Tap twice to use. Consumes 1 Regular edition.'));
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
function playUpgradeCeremony(card, from, to, cost, serial, serialMult) {
  const artFor = v => (usesFullArt(v) && card.fullArtImageUrl
    ? { imageUrl: card.fullArtImageUrl, thumbUrl: card.fullArtThumbUrl || card.fullArtImageUrl }
    : { imageUrl: card.imageUrl, thumbUrl: card.thumbUrl || card.imageUrl });
  const fromArt = artFor(from), toArt = artFor(to);
  const PILL = { reverse: 'linear-gradient(90deg,#8b5cf6,#ec4899)', full: 'linear-gradient(90deg,#0ea5e9,#6366f1)', shiny: 'linear-gradient(90deg,#f59e0b,#ef4444,#a855f7)', golden: 'linear-gradient(90deg,#fbbf24,#f59e0b,#fef08a)' };

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
    // The first few spent copies play the card's animation too (it fades in over the still once loaded).
    if (i < 5 && fromArt.thumbUrl !== fromArt.imageUrl && !reducedMotion) {
      const anim = document.createElement('img');
      anim.className = 'art-anim'; anim.alt = ''; anim.setAttribute('aria-hidden', 'true');
      anim.addEventListener('load', () => anim.classList.add('art-anim-on'));
      anim.src = fromArt.imageUrl;
      ing.appendChild(anim);
    }
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
  if (to === 'full' || to === 'shiny' || to === 'golden') {
    for (let i = 0; i < 16; i++) {
      const sp = document.createElement('span');
      sp.className = 'ug-spark';
      sp.textContent = i % 2 ? '\u2726' : '\u2727';
      sp.style.color = to === 'shiny' || to === 'golden' ? '#ffd24d' : '#7cc7ff';
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
  if (serial) line('ug-serial' + (serialMult > 1 ? ' bonus' : '') + (serial === 1 ? ' first' : ''), '#' + serial + (serial === 1 ? ' \u00b7 the first ever' : serialMult > 1 ? ' \u00b7 \u00d7' + serialMult + ' points' : ''));
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
    const res = await fetch(api('/api/twitch/upgrade'), {
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
      upgradeMsg = 'Upgraded to ' + VARIANT_LABELS[detailVariant] + '!';
      renderSeasonHeader('collection-season-header');
      renderGrid();
      playUpgradeCeremony(card, from, detailVariant, body.cost || 0, body.serial || 0, body.serialMult || 1);
      loadMe(true); // the new copy has a serial and the score moved
    } else {
      upgradeMsg = body.error || 'Upgrade failed (' + res.status + ')';
    }
  } catch {
    upgradeMsg = 'Could not reach the server';
  }
  if (detailIdx !== -1) renderDetail();
}

// Uses a trainer card through the server (which holds every rule), then reloads the cards. The spent copy lowers a count,
// so announceNew() has nothing to announce and skipNextToast must stay untouched (it would swallow the next real pull toast).
async function useTrainer(card) {
  if (!auth?.token || !season) return;
  let msg;
  let used = false;
  try {
    const res = await fetch(api('/api/twitch/trainer'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + auth.token },
      body: JSON.stringify({ seasonId: season.seasonId, cardNumber: card.number }),
    });
    const body = await res.json().catch(() => ({}));
    used = res.ok && body.ok;
    msg = used ? (body.message || 'Used ' + card.name + '!') : (body.error || 'Could not use the trainer card (' + res.status + ')');
  } catch {
    msg = 'Could not reach the server';
  }
  showToast(msg);
  if (used) { refreshData(false); loadMe(true); }
  else if (detailIdx !== -1) renderDetail(); // puts the button back after a refusal
}

// ── Views: collection / stats / leaderboard ───────────────
let currentView = 'collection';
let leaderboardLoadedAt = 0;

function setView(view) {
  currentView = view;
  closeDetail();
  document.querySelectorAll('#view-tabs .view-tab').forEach(b => {
    const on = b.dataset.view === view;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.getElementById('pack-tabs').classList.toggle('hidden', view !== 'collection');
  document.getElementById('grid-tools').classList.toggle('hidden', view !== 'collection');
  document.getElementById('collection-area').classList.toggle('hidden', view !== 'collection');
  document.getElementById('stats-area').classList.toggle('hidden', view !== 'stats');
  document.getElementById('trades-area').classList.toggle('hidden', view !== 'trades');
  document.getElementById('leaderboard-area').classList.toggle('hidden', view !== 'leaderboard');
  if (view === 'stats') { renderStats(); if (!me) loadMe(); }
  if (view === 'trades') { renderTrades(); loadTrades(false); }
  if (view === 'leaderboard') loadLeaderboard();
}

const siteUrl = path => new URL(path, (SITE || window.location.origin)).href;

// A rank badge: coloured discs for the podium, plain #N after that.
function rankBadge(rank) {
  const b = el('span', 'lb-rank' + (rank <= 3 ? ' medal m' + rank : ''), rank <= 3 ? String(rank) : '#' + rank);
  return b;
}

let boardBadges = {}; // login -> 'streamer' | 'admin' | 'mod' from /api/twitch/leaderboard
function boardRow(r, myName) {
  const row = document.createElement('a');
  row.className = 'lb-row' + (r.username === myName ? ' me' : '') + (r.rank <= 3 ? ' top' + r.rank : '');
  row.href = siteUrl('/u/' + encodeURIComponent(r.username));
  row.target = '_blank';
  row.rel = 'noopener noreferrer';

  const who = el('span', 'lb-who');
  const name = el('span', 'lb-name', r.username);
  if (r.username === myName) name.appendChild(el('span', 'lb-you', 'you'));
  const chip = staffChip(boardBadges[r.username]);
  if (chip) name.appendChild(chip);
  const sub = el('span', 'lb-sub');
  const v = r.variants;
  const extras = [];
  if (v.reverse) extras.push(v.reverse + ' RH');
  if (v.full) extras.push(v.full + ' FA');
  if (v.shiny) extras.push(v.shiny + ' FH');
  if (v.golden) extras.push(v.golden + ' GD');
  sub.textContent = r.uniqueCards + ' cards' + (extras.length ? ' \u00b7 ' + extras.join(' \u00b7 ') : '');
  who.append(name, sub);

  row.append(rankBadge(r.rank), who, el('span', 'lb-score', fmtNum(r.score)));
  return row;
}

async function loadLeaderboard() {
  const area = document.getElementById('leaderboard-area');
  if (!area || !season) return;
  // Re-fetch at most every 30s while flipping between tabs
  if (Date.now() - leaderboardLoadedAt < 30000 && area.childElementCount > 0) return;
  area.innerHTML = '';
  area.appendChild(skeletonRows(6));
  try {
    const q = new URLSearchParams({ seasonId: season.seasonId });
    if (currentUsername) q.set('username', currentUsername.toLowerCase());
    const res = await fetch(api('/api/twitch/leaderboard?' + q));
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();
    leaderboardLoadedAt = Date.now();
    boardBadges = data.badges || {};
    area.innerHTML = '';

    area.appendChild(detailLine('lb-note', data.seasonName + ' \u00b7 ' + data.players + ' collector' + (data.players === 1 ? '' : 's')));
    if (data.rows.length === 0) {
      area.appendChild(detailLine('lb-note', 'No one is on the board yet.'));
      return;
    }
    const myName = currentUsername ? currentUsername.toLowerCase() : null;
    data.rows.forEach(r => area.appendChild(boardRow(r, myName)));
    if (data.me && data.me.rank > data.rows.length) {
      area.appendChild(detailLine('lb-note', '\u2026'));
      area.appendChild(boardRow(data.me, myName));
    }
    const foot = el('div', 'lb-foot');
    foot.append('Score = every edition you own (low edition numbers earn a bonus) plus collection bonuses. ');
    const more = el('a', null, 'How points work');
    more.href = siteUrl('/faq#points');
    more.target = '_blank';
    more.rel = 'noopener noreferrer';
    foot.appendChild(more);
    area.appendChild(foot);
  } catch {
    area.innerHTML = '';
    area.appendChild(retryNote('Could not load the leaderboard.', () => { leaderboardLoadedAt = 0; loadLeaderboard(); }));
  }
}

// Grey placeholder rows while something loads.
function skeletonRows(n) {
  const wrap = el('div', 'skeleton-list');
  for (let i = 0; i < n; i++) wrap.appendChild(el('div', 'skeleton-row'));
  return wrap;
}
// A message with a Try again button.
function retryNote(text, onRetry) {
  const box = el('div', 'retry-note');
  box.appendChild(el('div', null, text));
  const b = el('button', 'retry-btn', 'Try again');
  b.type = 'button';
  b.addEventListener('click', onRetry);
  box.appendChild(b);
  return box;
}

// ── Stats view ────────────────────────────────────────────
// Rank, how the score adds up, what to do next (upgrades you can afford, who is just ahead), your best serials and waiting trade
// offers. Everything comes from /api/twitch/me plus the collection already in memory.
function cardsOfSeason() {
  const out = [];
  season.packs.forEach((pack, packIdx) => pack.cards.forEach((card, cardIdx) => out.push({ pack, packIdx, card, cardIdx })));
  return out;
}

function statLink(text, path, className) {
  const a = el('a', className || 'stat-link', text);
  a.href = siteUrl(path);
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

// A titled section card.
function statSection(title, ...children) {
  const box = el('section', 'stat-box');
  box.appendChild(el('h3', 'stat-title', title));
  children.forEach(c => c && box.appendChild(c));
  return box;
}

function openCardFromStats(packIdx, cardIdx) {
  currentPackIdx = packIdx;
  renderPackTabs();
  renderGrid();
  openDetail(cardIdx, null);
}

function renderStats() {
  const area = document.getElementById('stats-area');
  if (!area || !season) return;
  area.innerHTML = '';
  if (!me) {
    area.appendChild(skeletonRows(4));
    return;
  }
  if (!me.row) {
    area.appendChild(statSection('No points yet', el('p', 'stat-muted', 'Pull a card on stream and you will show up here with a rank and a score.')));
    return;
  }
  const r = me.row;

  // Hero: score and rank
  const hero = el('div', 'stat-hero');
  const score = el('div', 'stat-score');
  score.append(el('span', 'stat-score-num', fmtNum(r.score)), el('span', 'stat-score-unit', 'points'));
  const rank = el('button', 'stat-rank');
  rank.type = 'button';
  rank.title = 'Open the leaderboard';
  rank.append(el('strong', null, '#' + me.rank), ' of ' + me.players);
  rank.addEventListener('click', () => setView('leaderboard'));
  hero.append(score, rank);
  area.appendChild(hero);

  // Trade offers waiting: they are answered in the Trades tab
  if (me.offers > 0) {
    const a = el('button', 'offers-banner', me.offers + ' trade offer' + (me.offers === 1 ? '' : 's') + ' waiting for you');
    a.type = 'button';
    a.appendChild(el('span', 'offers-go', 'Open'));
    a.addEventListener('click', () => setView('trades'));
    area.appendChild(a);
  }

  // Who is next
  if (me.next && me.next.gap > 0) {
    area.appendChild(el('p', 'stat-next', fmtNum(me.next.gap) + ' pts behind @' + me.next.username + '. One more good pull could pass them.'));
  } else if (me.rank === 1) {
    area.appendChild(el('p', 'stat-next', 'You are in first place. Hold on to it!'));
  }

  // How the score adds up
  const rows = el('dl', 'stat-rows');
  const addRow = (label, value, cls) => {
    const d = el('div', 'stat-row' + (cls ? ' ' + cls : ''));
    d.append(el('dt', null, label), el('dd', null, value));
    rows.appendChild(d);
  };
  addRow('Your cards', fmtNum(r.cardPoints - r.serialPoints));
  addRow('Edition bonus', (r.serialPoints > 0 ? '+' : '') + fmtNum(r.serialPoints), r.serialPoints > 0 ? 'good' : 'dim');
  addRow('Progress bonus', '+' + fmtNum(r.completionBonus) + ' / ' + fmtNum(me.maxCompletion), r.completionBonus > 0 ? 'good' : 'dim');
  addRow('Full set bonus', r.complete ? '+' + fmtNum(r.setBonus) : fmtNum(me.setBonusValue) + ' when complete', r.complete ? 'good' : 'dim');
  addRow('Total', fmtNum(r.score), 'total');
  area.appendChild(statSection('Where your points come from', rows));

  // Ready to upgrade
  const ready = [];
  cardsOfSeason().forEach(({ pack, packIdx, card, cardIdx }) => {
    if (!pack.upgradesEnabled || !card.upgradesEnabled) return;
    const st = cardStatus(card);
    VARIANTS.forEach(v => {
      const n = st.variants[v];
      if (!n) return;
      const { next, cost } = upgradeStepFor(pack, card, v);
      if (next && n >= cost) ready.push({ pack, packIdx, card, cardIdx, from: v, to: next, cost, have: n });
    });
  });
  if (ready.length > 0) {
    const list = el('div', 'ready-list');
    ready.slice(0, 5).forEach(x => {
      const b = el('button', 'ready-row');
      b.type = 'button';
      const thumb = el('span', 'ready-thumb');
      if (x.card.thumbUrl || x.card.imageUrl) { const img = el('img'); img.src = x.card.thumbUrl || x.card.imageUrl; img.alt = ''; thumb.appendChild(img); }
      const text = el('span', 'ready-text');
      text.append(el('span', 'ready-name', x.card.name), el('span', 'ready-sub', x.cost + '\u00d7 ' + VARIANT_LABELS[x.from] + ' \u2192 ' + VARIANT_LABELS[x.to] + ' \u00b7 you have ' + x.have));
      b.append(thumb, text, el('span', 'ready-go', 'Open'));
      b.addEventListener('click', () => openCardFromStats(x.packIdx, x.cardIdx));
      list.appendChild(b);
    });
    if (ready.length > 5) list.appendChild(el('p', 'stat-muted', '+' + (ready.length - 5) + ' more on the website'));
    area.appendChild(statSection('Ready to upgrade', list));
  }

  // Best serials (copies that earn a bonus)
  const best = [];
  const byNumber = new Map();
  season.packs.forEach(pack => pack.cards.forEach(c => byNumber.set(c.number, c)));
  Object.keys(me.serials || {}).forEach(k => {
    const d = decodeEntry(Number(k));
    const card = byNumber.get(d.cardNumber);
    if (!card) return;
    me.serials[k].forEach(n => { const m = serialMult(n); if (m > 1) best.push({ card, variant: d.variant, n, m }); });
  });
  best.sort((a, b) => b.m - a.m || a.n - b.n);
  if (best.length > 0) {
    const chips = el('div', 'serial-chips');
    best.slice(0, 6).forEach(x => {
      const a = el('a', 'serial-chip bonus');
      a.href = siteUrl('/copy/' + encodeURIComponent(season.seasonId) + '/' + x.card.number + '.' + VARIANTS.indexOf(x.variant) + '.' + x.n);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.title = 'Worth ' + fmtNum(copyPts(x.card.number, x.variant, x.n)) + ' pts';
      a.append('#' + x.n + ' ' + x.card.name + (x.variant === 'regular' ? '' : ' (' + VARIANT_SHORT[x.variant] + ')'));
      chips.appendChild(a);
    });
    if (best.length > 6) chips.appendChild(el('span', 'serial-more', '+' + (best.length - 6) + ' more'));
    area.appendChild(statSection('Your best edition numbers', chips, el('p', 'stat-muted', 'The first editions ever made of a card are worth extra points.')));
  }

  const profile = '/u/' + encodeURIComponent(me.username);

  // Achievements: "N of M" and the latest few, worked out by the site's own helper
  const ach = me.achievements;
  if (ach && ach.total > 0) {
    const list = el('ul', 'ach-list');
    ach.latest.forEach(x => {
      const li = el('li', 'ach-row');
      li.title = x.detail;
      li.append(el('span', 'ach-name', x.name), el('span', 'ach-date', new Date(x.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })));
      list.appendChild(li);
    });
    area.appendChild(statSection('Achievements',
      el('p', 'ach-count', ach.earned + ' of ' + ach.total + ' achievements'),
      ach.latest.length > 0 ? list : el('p', 'stat-muted', 'None earned yet. Collection goals show up on your profile as you get close.'),
      statLink('All achievements', profile, 'ed-link')));
  }

  // Links out
  const links = el('div', 'stat-links');
  links.append(statLink('Full stats', '/account'), statLink('My profile', profile), statLink('My binder', profile + '?tab=collection&view=binder'),
    statLink('Share my cards', profile + '?tab=share'), statLink('Trade on the site', '/trade'));
  area.appendChild(links);
}

// Rank, score, card values and serials from /api/twitch/me. Never blocks the collection: if it fails, those extras just stay hidden.
async function loadMe(fresh) {
  if (!auth || !auth.token || !currentUsername) return;
  try {
    const res = await fetch(api('/api/twitch/me' + (fresh ? '?fresh=1' : '')), { headers: { Authorization: 'Bearer ' + auth.token } });
    if (!res.ok) return;
    me = await res.json();
  } catch {
    return;
  }
  const footerChip = staffChip(me.badge); // the viewer's own staff badge next to their name
  const footerLink = document.getElementById('footer-username');
  if (footerLink) { footerLink.querySelectorAll('.staff-badge').forEach(n => n.remove()); if (footerChip) footerLink.appendChild(footerChip); }
  updateTradesDot();
  if (!tradesData) loadTrades(false); // so listings for your Looking for list can light the dot
  renderSeasonHeader('collection-season-header');
  renderGrid(); // the serial marks on the tiles
  if (currentView === 'stats') renderStats();
  if (detailIdx !== -1) renderDetail();
}

document.querySelectorAll('#view-tabs .view-tab').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

// ── Login flow ────────────────────────────────────────────
// Returns whether it worked; on a failure the cards already on screen are kept (an empty grid would look like "you own nothing").
async function loadUserCollection(username) {
  try {
    const res = await fetch(api(`/api/twitch/collection?username=${encodeURIComponent(username)}`), { headers: { Authorization: 'Bearer ' + auth.token } });
    if (!res.ok) return false;
    const data = await res.json();
    collections = data.collections ?? [];
    lastLoadAt = Date.now();
    return true;
  } catch {
    return false;
  }
}

// ── Banner, toast and refresh ─────────────────────────────
function showBanner(text, onRetry) {
  const b = document.getElementById('panel-banner');
  if (!b) return;
  b.innerHTML = '';
  b.appendChild(el('span', null, text));
  if (onRetry) {
    const btn = el('button', 'banner-btn', 'Retry');
    btn.type = 'button';
    btn.addEventListener('click', onRetry);
    b.appendChild(btn);
  }
  b.classList.remove('hidden');
}
function hideBanner() {
  const b = document.getElementById('panel-banner');
  if (b) b.classList.add('hidden');
}

let toastTimer = null;
function showToast(text) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 4500);
}

// Copies per entry in the active season (to notice new pulls after a refresh).
function activeCounts() {
  const m = new Map();
  const c = collections.find(x => x.active);
  if (c) for (const e of c.ownedNumbers) m.set(e, (m.get(e) || 0) + 1);
  return m;
}
let skipNextToast = false; // set after a trade, whose new cards are not "pulls"
function announceNew(before) {
  if (skipNextToast) { skipNextToast = false; return; }
  const names = [];
  const byNumber = new Map();
  season.packs.forEach(pack => pack.cards.forEach(card => byNumber.set(card.number, card)));
  for (const [entry, n] of activeCounts()) {
    if (n <= (before.get(entry) || 0)) continue;
    const d = decodeEntry(entry);
    const card = byNumber.get(d.cardNumber);
    if (card) names.push(card.name + (d.variant === 'regular' ? '' : ' (' + VARIANT_LABELS[d.variant] + ')'));
  }
  if (names.length === 0) return;
  showToast('New pull: ' + names.slice(0, 2).join(', ') + (names.length > 2 ? ' +' + (names.length - 2) + ' more' : ''));
}

// Reloads the viewer's cards, rank and values. `manual` = the refresh button (always shows the result).
let refreshing = false;
async function refreshData(manual) {
  if (!currentUsername || refreshing) return;
  refreshing = true;
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  const before = activeCounts();
  const ok = await loadUserCollection(currentUsername);
  if (ok) {
    hideBanner();
    renderSeasonHeader('collection-season-header');
    renderGrid();
    if (before.size > 0) announceNew(before);
    leaderboardLoadedAt = 0;
    if (currentView === 'leaderboard') loadLeaderboard();
    if (detailIdx !== -1) renderDetail();
    loadMe(manual);
  } else {
    showBanner('Could not refresh your cards.', () => refreshData(true));
  }
  btn.classList.remove('spinning');
  refreshing = false;
}

// Coming back to the panel (e.g. after watching for a while) refreshes it, so new pulls show up without pressing anything.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentUsername && Date.now() - lastLoadAt > 45000) refreshData(false);
});

async function linkAndLogin(username) {
  // Persist the opaque ID → username mapping so next visit auto-logs in
  if (auth?.token) {
    try {
      await fetch(api('/api/twitch/link'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + auth.token,
        },
        body: JSON.stringify({ username }),
      });
    } catch {
      // Non-fatal, still show collection
    }
  }

  await login(username);
}

async function login(username) {
  setExplicitLogout(false);
  currentUsername = username;
  me = null;
  resetTrades();
  collectionFilter = 'all';
  const loaded = await loadUserCollection(username);
  showState('collection');
  leaderboardLoadedAt = 0;
  setView('collection');
  renderSeasonHeader('collection-season-header');
  renderPackTabs();
  renderGrid();
  if (loaded) hideBanner();
  else showBanner('Could not load your cards.', () => refreshData(true));
  loadMe(); // rank, card values and serial numbers: fills in when it arrives

  // The username links to the viewer's public collection page (opens in a new tab; Twitch's
  // extension sandbox allows popups). Same origin as the API calls above.
  const footerName = document.getElementById('footer-username');
  if (footerName) {
    footerName.textContent = username;
    footerName.href = new URL('/u/' + encodeURIComponent(username.toLowerCase()), (SITE || window.location.origin)).href;
  }
}

async function tryAutoLogin() {
  if (!auth?.userId) return false;
  try {
    const res = await fetch(api(`/api/twitch/user?opaqueId=${encodeURIComponent(auth.userId)}`));
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
    const res = await fetch(api('/api/twitch/login'), {
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
    const res = await fetch(api('/api/twitch/season'));
    if (!res.ok) {
      showState('noSeason');
      return false;
    }
    season = absolutizeUrls(await res.json());
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
  console.log('[TCG] init(), userId:', auth.userId, '| identityRequestPending:', identityRequestPending);

  // Re-auth fired after user responded to the identity-share popup.
  // JWT now contains user_id, send it to the server to resolve username.
  if (identityRequestPending) {
    identityRequestPending = false;
    console.log('[TCG] identity share response, trying JWT login');
    showState('loading');
    const result = await loginFromJwt();
    if (result.ok) return;
    showLoginScreen(loginFailureMessage(result));
    return;
  }

  showState('loading');

  const ok = await loadSeason();
  if (!ok) return;

  // Explicit logout, respect it, show login screen
  if (isExplicitlyLoggedOut()) {
    showLoginScreen();
    return;
  }

  // Returning user with saved opaque→username mapping, silent auto-login
  const autoLoggedIn = await tryAutoLogin();
  if (autoLoggedIn) return;

  // JWT may already contain user_id from a previous grant. Try silent login
  const result = await loginFromJwt();
  if (result.ok) return;

  // 403 just means this viewer hasn't shared their identity yet, show a plain login screen.
  // Anything else is a real failure; say so instead of silently looking logged out.
  showLoginScreen(result.status === 403 || result.status === 0 ? undefined : loginFailureMessage(result));
}

// ── Build version ─────────────────────────────────────────
// The extension's own version (what Twitch reviews), not the site's; the zip name comes from it too (packageVersion()).
const PANEL_VERSION = '0.0.2';

// Shows the panel's version, and the site deployment behind it in the tooltip. Purely informational. Never blocks or breaks the panel.
async function showVersion() {
  const el = document.getElementById('panel-version');
  if (!el) return;
  el.textContent = 'v' + PANEL_VERSION;
  el.title = 'Panel version ' + PANEL_VERSION;
  try {
    const res = await fetch(api('/api/version'), { cache: 'no-store' });
    if (!res.ok) return;
    const v = await res.json();
    if (v.env && v.env !== 'production') el.textContent += ' · ' + v.env;
    el.title = [
      'Panel version ' + PANEL_VERSION,
      'Site version ' + v.version,
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

  console.log('[TCG] login-btn clicked, userId:', auth?.userId, '| broadcaster:', isBroadcaster(), '| requestIdShare:', typeof window.Twitch?.ext?.actions?.requestIdShare);

  // Channel owner: Twitch never shows the share prompt on your own channel, so don't wait for it.
  if (isBroadcaster()) {
    btn.textContent = 'Signing in...';
    const result = await loginFromJwt();
    if (!result.ok) showLoginScreen(loginFailureMessage(result));
    return;
  }

  if (window.Twitch?.ext?.actions?.requestIdShare) {
    // Keep the login screen visible, just update the button and show a hint
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
        console.warn('[TCG] 20s timeout, onAuthorized never re-fired after requestIdShare');
        identityRequestPending = false;
        showLoginScreen("Twitch didn't respond. If no prompt appeared, the extension may not have identity linking enabled. Try again, or reload the page.");
      }
    }, 20000);
    return;
  }

  // Extension Helper unavailable
  console.error('[TCG] requestIdShare not available, Twitch.ext.actions:', window.Twitch?.ext?.actions);
  showLoginScreen('Twitch identity sharing unavailable.');
});

document.getElementById('logout-btn').addEventListener('click', () => {
  // Mark as explicitly logged out so refresh doesn't silently re-login
  setExplicitLogout(true);

  // Delete the server-side opaque→username mapping
  if (auth?.token) {
    fetch(api('/api/twitch/unlink'), {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + auth.token },
    }).catch(() => {});
  }

  currentUsername = null;
  collections = [];
  me = null;
  resetTrades();
  hideBanner();
  showLoginScreen();
});

document.getElementById('refresh-btn').addEventListener('click', () => refreshData(true));

// ── Twitch Extension Helper ───────────────────────────────
if (typeof window.Twitch !== 'undefined' && window.Twitch.ext) {
  window.Twitch.ext.onAuthorized(authObj => init(authObj));
  window.Twitch.ext.onError(err => console.error('[TCG Panel]', err));
} else {
  // Dev mode, run without the Twitch Extension environment
  init({ userId: 'dev_mock_opaque', token: null, channelId: 'dev' });
}
