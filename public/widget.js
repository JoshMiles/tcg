'use strict';

// ═══════════════════════════════════════════════════════
//  STAGE LAYOUT  (Settings → Overlay layout)
// ═══════════════════════════════════════════════════════
// Everything is drawn on a fixed "design stage" (default 1280x720) and scaled to fit whatever size the OBS
// browser source actually is, so a differently sized source still shows the whole animation. The admin's
// scale/offset are applied on top. `?preview` is the admin editor's iframe: it takes layout changes by
// postMessage and never talks to the real queue, heartbeat or collection data.
const PREVIEW = new URLSearchParams(window.location.search).has('preview');
// The stage is the browser source's size; scale/offset are set separately for the pack opening and the collection
// view (each theater wrapper gets .is-pack or .is-collection, which picks up its own --pack-* / --col-* variables).
let STAGE = { width: 1280, height: 720 };
let PLACEMENTS = {
  pack:       { scale: 1, offsetX: 0, offsetY: 0 },
  collection: { scale: 1, offsetX: 0, offsetY: 0 },
};

function applyLayout(layout) {
  if (layout) {
    const n = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
    STAGE = {
      width:  Math.max(1, n(layout.width,  STAGE.width)),
      height: Math.max(1, n(layout.height, STAGE.height)),
    };
    // Accept the old single-placement shape too (a cached config from before the split).
    const legacy = { scale: layout.scale, offsetX: layout.offsetX, offsetY: layout.offsetY };
    for (const mode of ['pack', 'collection']) {
      const p = layout[mode] || legacy;
      PLACEMENTS[mode] = {
        scale:   Math.max(0.05, n(p.scale, PLACEMENTS[mode].scale)),
        offsetX: n(p.offsetX, PLACEMENTS[mode].offsetX),
        offsetY: n(p.offsetY, PLACEMENTS[mode].offsetY),
      };
    }
  }
  const fit = Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height);
  const root = document.documentElement.style;
  root.setProperty('--stage-w', STAGE.width + 'px');
  root.setProperty('--stage-h', STAGE.height + 'px');
  root.setProperty('--stage-scale', String(fit));
  // Offsets are in design pixels and applied inside the scaled stage, so they scale with the fit automatically.
  root.setProperty('--pack-scale', String(PLACEMENTS.pack.scale));
  root.setProperty('--pack-x', PLACEMENTS.pack.offsetX + 'px');
  root.setProperty('--pack-y', PLACEMENTS.pack.offsetY + 'px');
  root.setProperty('--col-scale', String(PLACEMENTS.collection.scale));
  root.setProperty('--col-x', PLACEMENTS.collection.offsetX + 'px');
  root.setProperty('--col-y', PLACEMENTS.collection.offsetY + 'px');
}

// ── Look & animation properties (Settings -> Overlay Properties) ──
// The server sends every property's default plus the admin's values; a pack can override some of them.
// Keys are dotted paths ("collection.perRow", "variant.shiny.holoSpeed"); see lib/overlay-props.ts.
let PROP_DEFAULTS = {};
let PROPS_GLOBAL = {};
let PACK_OVERRIDES = {};
let PREVIEW_PROPS = null;   // admin editor: unsaved values shown live (replaces the saved ones)
let PREVIEW_VARIANT = '';   // admin editor: "preview as" variant

function effectiveProps(packId) {
  const out = Object.assign({}, PROP_DEFAULTS);
  if (PREVIEW_PROPS) return Object.assign(out, PREVIEW_PROPS);
  Object.assign(out, PROPS_GLOBAL);
  if (packId && PACK_OVERRIDES[packId]) Object.assign(out, PACK_OVERRIDES[packId]);
  return out;
}
// Falls back to the literal (the shipped default) if the config couldn't be fetched.
const pv = (P, key, fallback) => (P[key] !== undefined ? P[key] : fallback);

async function loadLayout() {
  try {
    const res = await fetch('/api/overlay/config', { cache: 'no-store' });
    if (res.ok) {
      const cfg = await res.json();
      applyLayout(cfg.layout);
      PROP_DEFAULTS = cfg.defaults || {};
      PROPS_GLOBAL = cfg.props || {};
      PACK_OVERRIDES = cfg.packOverrides || {};
    }
  } catch { /* keep the defaults */ }
}

window.addEventListener('resize', () => applyLayout());
applyLayout();

// ── Admin editor preview (?preview) ──
// Shows a still of the pack opening / collection view while nothing is animating, so it can be positioned, and plays
// the real animation on request. Messages from the editor: layout, static (which view to show), pack, collection.
let previewMode = 'pack';
let previewPackId = '';

function clearStatic() {
  document.querySelectorAll('.static-preview').forEach(el => el.remove());
}

function showStatic(mode) {
  if (!PREVIEW) return;
  if (mode) previewMode = mode;
  clearStatic();
  if (PACKS.length === 0) return;

  const chosen = PACKS.find(p => p.pack.id === previewPackId) || PACKS[0];
  const cfg = packConfig(chosen.pack);
  const P = effectiveProps(previewMode === 'pack' ? chosen.pack.id : null);
  const theater = createTheater(cfg);
  const { wrapper, packageContainer, cardBox, cardLabel, mainCard, holoOverlay, cardInfoOverlay, radialContainer, cardInfo, userText, miniList } = theater;
  wrapper.classList.add('static-preview');
  wrapper.style.visibility = 'visible';
  // Elements the editor can jump to when clicked (see the click handler below).
  const editable = (el, target, tip) => { if (el) { el.dataset.edit = target; el.title = tip; } };
  editable(mainCard, 'card', 'Click to edit this card variant');
  editable(cardLabel, 'label', 'Click to edit the label');
  editable(cardInfoOverlay, 'bar', 'Click to edit the name and stars bar');
  packageContainer.style.opacity = '0';

  if (previewMode === 'pack') {
    // The settled moment of a pack opening: the revealed card, its label and the collection strip beneath it.
    const variant = PREVIEW_VARIANT || 'regular';
    const card = [...chosen.cards].sort((x, y) => y.stars - x.stars)[0] || ALL_CARDS[0];
    wrapper.classList.add('is-pack', 'pack-fit');
    cardBox.style.animation = 'none';
    cardBox.style.opacity = '1';
    radialContainer.style.animation = 'none';
    cardInfo.style.opacity = '1';
    cardInfo.style.transform = 'scale(1)';
    if (card) {
      applyLook(theater, P, variant, card, cfg, false);
      cardLabel.style.opacity = '1';
      cardLabel.style.visibility = 'visible';
      radialContainer.style.opacity = String(pv(P, 'reveal.burstOpacity', 0.85));
      if (!pv(P, 'reveal.showBurst', true)) radialContainer.style.display = 'none';
      userText.textContent = gotText(P, 'Preview');
      editable(userText, 'got', 'Click to edit the "got:" line');
      editable(miniList, 'strip', 'Click to edit the cards under the card');
      const art = (variant === 'full' || variant === 'shiny') && card.fullArt ? card.fullArt : card.image;
      paintCard(theater, card, art, (variant === 'full' || variant === 'shiny') && card.fullArt ? card.fullArtThumb : card.thumb);
      const fx = mainCardAnimation(P, variant, 1, 0, true);
      mainCard.style.animation = fx.anim;
      wrapper.style.setProperty('--fx-start', '0s');
      cardBox.style.animation = tiltAnimation(P, variant, 1, 0) || 'none';
      buildMiniList(miniList, revealedCardsByUser.preview || [], card.number, cfg, listOpts(P, true));
      if (holoOn(P, variant, card, cfg)) holoOverlay.classList.add('holographic-animate');
    }
  } else {
    // The collection view: just the name and the card grid.
    wrapper.classList.add('is-collection');
    cardBox.style.display = 'none';
    radialContainer.style.display = 'none';
    cardInfo.style.opacity = '1';
    cardInfo.style.transform = 'scale(1)';
    userText.textContent = headingText(P, 'Preview');
    editable(userText, 'heading', 'Click to edit the heading');
    editable(miniList, 'collection', 'Click to edit the collection grid');
    if (!pv(P, 'collection.showHeading', true)) userText.style.display = 'none';
    const opts = listOpts(P, false);
    if (opts.perRow > 0) wrapper.style.maxWidth = 'none';
    buildMiniList(miniList, revealedCardsByUser.preview || [], null, cfg, opts);
  }
}

if (PREVIEW) {
  // Clicking an element in the editor's preview asks the editor to open that element's settings.
  document.body.classList.add('preview-edit');
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('[data-edit]');
    if (el && window.parent !== window) window.parent.postMessage({ type: 'select', target: el.dataset.edit }, window.location.origin);
  });
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'layout') applyLayout(e.data.layout);
    else if (e.data.type === 'props') {
      PREVIEW_PROPS = e.data.props && typeof e.data.props === 'object' ? e.data.props : null;
      previewPackId = typeof e.data.packId === 'string' ? e.data.packId : '';
      if (activeDraws === 0) showStatic();
    }
    else if (e.data.type === 'variant') {
      PREVIEW_VARIANT = ['reverse', 'full', 'shiny'].includes(e.data.variant) ? e.data.variant : '';
      if (activeDraws === 0) showStatic();
    }
    else if (e.data.type === 'static') { if (activeDraws === 0) showStatic(e.data.mode); else previewMode = e.data.mode === 'collection' ? 'collection' : 'pack'; }
    else if (e.data.type === 'pack') { clearStatic(); queueDraw('preview', { dry: true, packId: previewPackId || undefined, variant: PREVIEW_VARIANT || undefined }); }
    else if (e.data.type === 'collection') { clearStatic(); queueCollection('preview', { dry: true }); }
  });
}

// ═══════════════════════════════════════════════════════
//  SEASON DATA  (loaded from /api/seasons/active)
// ═══════════════════════════════════════════════════════
// Collection entries encode the variant: cardNumber + VARIANT_OFFSET * variantIndex (regular = plain number).
// Keep in sync with lib/variants.ts.
const VARIANTS = ['regular', 'reverse', 'full', 'shiny'];
const VARIANT_OFFSET = 1000000;
const VARIANT_LABELS = { regular: 'Regular', reverse: 'Reverse Holo', full: 'Full Art', shiny: 'Shiny Full Art' };
const DEFAULT_VARIANT_WEIGHTS = { regular: 100, reverse: 25, full: 5, shiny: 1 };
function encodeEntry(cardNumber, variant) { return cardNumber + VARIANT_OFFSET * Math.max(0, VARIANTS.indexOf(variant)); }
function decodeEntry(entry) {
  const idx = Math.min(Math.floor(entry / VARIANT_OFFSET), VARIANTS.length - 1);
  return { cardNumber: entry - idx * VARIANT_OFFSET, variant: VARIANTS[idx] };
}
// Test-panel switches (?dev). Only the panel changes these; real draws never see them.
const DEV = { dry: true, mute: false, quick: false };

function rollVariant(weights) {
  const w = Object.assign({}, DEFAULT_VARIANT_WEIGHTS, weights);
  const total = VARIANTS.reduce((s, v) => s + Math.max(0, w[v]), 0);
  if (total <= 0) return 'regular';
  let r = Math.random() * total;
  for (const v of VARIANTS) { r -= Math.max(0, w[v]); if (r < 0) return v; }
  return 'regular';
}

let PACKS = [];      // [{ pack, cards: [{number,name,image,probability,stars}] }]
let ALL_CARDS = [];  // flat list of all cards across all packs (for mini-list)

let SEASON_CFG = {
  maxConcurrentPacks: 1,
  collectionName:     '',
};

// Fallback pack visual config used before season loads
const PACK_DEFAULTS = {
  cardTime:       3,
  cooldownTime:   1,
  soundVolume:    1.0,
  holoMinStars:   5,
  packageImage:   'assets/pack-cover.png',
  accentColor:    'rgb(241,187,6)',
  tearBorderColor:'rgb(218,163,18)',
};

function packConfig(pack) {
  if (!pack) return PACK_DEFAULTS;
  return {
    cardTime:        pack.cardTime       ?? 3,
    cooldownTime:    pack.cooldownTime   ?? 1,
    soundVolume:     pack.soundVolume    ?? 1.0,
    holoMinStars:    pack.holoMinStars   ?? 5,
    packageImage:    pack.coverImageUrl  || 'assets/pack-cover.png',
    accentColor:     pack.accentColor    || 'rgb(241,187,6)',
    tearBorderColor: pack.tearBorderColor|| 'rgb(218,163,18)',
  };
}

async function initSeason() {
  try {
    const res = await fetch('/api/seasons/active');
    if (!res.ok) return;
    const { season, packs } = await res.json();

    SEASON_CFG = {
      maxConcurrentPacks: season.maxConcurrentPacks ?? 1,
      collectionName:     season.collectionName ?? '',
    };

    PACKS = (packs ?? []).map(({ pack, cards }) => ({
      pack,
      cards: (cards ?? []).map(c => ({
        number:      c.number,
        name:        c.name,
        image:       c.imageUrl,                    // full animated art (only the revealed card uses this)
        thumb:       c.thumbUrl || c.imageUrl,      // static first frame, for the collection grid
        soundUrl:    c.soundUrl || null,
        probability: c.probability,
        stars:       c.stars,
        upgradesEnabled: c.upgradesEnabled !== false,
        fullArt:      c.fullArtImageUrl || null,
        fullArtThumb: c.fullArtThumbUrl || c.fullArtImageUrl || null,
      })),
    }));

    // Deduplicate by card number for the mini collection list
    const seen = new Set();
    ALL_CARDS = [];
    for (const { cards } of PACKS) {
      for (const c of cards) {
        if (!seen.has(c.number)) { seen.add(c.number); ALL_CARDS.push(c); }
      }
    }
    ALL_CARDS.sort((a, b) => a.number - b.number);
    preloadThumbs();
  } catch {
    // fall back to defaults if API unreachable
  }
}

// ═══════════════════════════════════════════════════════
//  CARD SELECTION  (pick pack by weight, then card by prob)
// ═══════════════════════════════════════════════════════
/**
 * Picks what to draw. `opts` (test panel only) can pin any of: `packId`, `cardNumber`, `variant`.
 * Anything not pinned is rolled exactly as in a real draw.
 */
function pickPackAndCard(opts) {
  opts = opts || {};
  if (PACKS.length === 0) return null;

  let chosen = null;
  if (opts.packId) chosen = PACKS.find(p => p.pack.id === opts.packId) || null;
  // A pinned card with no pinned pack: use the first pack that has it.
  if (!chosen && opts.cardNumber != null) chosen = PACKS.find(p => p.cards.some(c => c.number === opts.cardNumber)) || null;

  if (!chosen) {
    // Weighted pack selection
    const totalWeight = PACKS.reduce((s, { pack }) => s + (pack.weight || 1), 0);
    let rw = Math.random() * totalWeight;
    chosen = PACKS[PACKS.length - 1];
    for (const p of PACKS) {
      rw -= (p.pack.weight || 1);
      if (rw <= 0) { chosen = p; break; }
    }
  }

  // Weighted card selection within the chosen pack
  if (chosen.cards.length === 0) return null;
  let card = opts.cardNumber != null ? chosen.cards.find(c => c.number === opts.cardNumber) : null;
  if (!card) {
    const totalProb = chosen.cards.reduce((s, c) => s + c.probability, 0);
    let rp = Math.random() * totalProb;
    card = chosen.cards[chosen.cards.length - 1];
    for (const c of chosen.cards) {
      rp -= c.probability;
      if (rp <= 0) { card = c; break; }
    }
  }

  // Variant is rolled after the card, and only where the pack and card both have upgrades on.
  // A pinned variant (test panel) is used as-is, even where upgrades are off, so effects can be previewed.
  let variant = 'regular';
  if (opts.variant && VARIANTS.indexOf(opts.variant) !== -1) variant = opts.variant;
  else if (chosen.pack.upgradesEnabled && card.upgradesEnabled) variant = rollVariant(chosen.pack.variantWeights);

  return { card, variant, cfg: packConfig(chosen.pack), packName: chosen.pack.name, packId: chosen.pack.id };
}

// ═══════════════════════════════════════════════════════
//  PACK SOUNDS
// ═══════════════════════════════════════════════════════
const PACK_SOUNDS = [
  { src: 'https://cdn.freesound.org/previews/186/186719_105499-lq.mp3',   delay:    0 },
  { src: 'https://cdn.freesound.org/previews/787/787409_12262933-lq.mp3', delay:  450 },
  { src: 'https://cdn.freesound.org/previews/787/787405_12262933-lq.mp3', delay: 1410 },
];

const STAR_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right:2px;"><path d="M9.15316 5.40838C10.4198 3.13613 11.0531 2 12 2C12.9469 2 13.5802 3.13612 14.8468 5.40837L15.1745 5.99623C15.5345 6.64193 15.7144 6.96479 15.9951 7.17781C16.2757 7.39083 16.6251 7.4699 17.3241 7.62805L17.9605 7.77203C20.4201 8.32856 21.65 8.60682 21.9426 9.54773C22.2352 10.4886 21.3968 11.4691 19.7199 13.4299L19.2861 13.9372C18.8096 14.4944 18.5713 14.773 18.4641 15.1177C18.357 15.4624 18.393 15.8341 18.465 16.5776L18.5306 17.2544C18.7841 19.8706 18.9109 21.1787 18.1449 21.7602C17.3788 22.3417 16.2273 21.8115 13.9243 20.7512L13.3285 20.4768C12.6741 20.1755 12.3469 20.0248 12 20.0248C11.6531 20.0248 11.3259 20.1755 10.6715 20.4768L10.0757 20.7512C7.77268 21.8115 6.62118 22.3417 5.85515 21.7602C5.08912 21.1787 5.21588 19.8706 5.4694 17.2544L5.53498 16.5776C5.60703 15.8341 5.64305 15.4624 5.53586 15.1177C5.42868 14.773 5.19043 14.4944 4.71392 13.9372L4.2801 13.4299C2.60325 11.4691 1.76482 10.4886 2.05742 9.54773C2.35002 8.60682 3.57986 8.32856 6.03954 7.77203L6.67589 7.62805C7.37485 7.4699 7.72433 7.39083 8.00494 7.17781C8.28555 6.96479 8.46553 6.64194 8.82547 5.99623L9.15316 5.40838Z" fill="rgb(241,187,6)"></path></svg>`;

// ═══════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════
let cardQueue           = [];
let activeDraws         = 0;
let drawCounter         = 0;
let revealedCardsByUser = {};
let collectionTimeout   = null;

// ═══════════════════════════════════════════════════════
//  STORAGE  (Vercel KV via /api/collection)
// ═══════════════════════════════════════════════════════
async function loadCollection() {
  if (!SEASON_CFG.collectionName) return;
  try {
    const res = await fetch(`/api/collection?name=${SEASON_CFG.collectionName}`);
    revealedCardsByUser = res.ok ? await res.json() : {};
  } catch {
    revealedCardsByUser = {};
  }
}

function saveCollection(pull) {
  if (PREVIEW || !SEASON_CFG.collectionName) return;
  const body = { data: revealedCardsByUser };
  if (pull) body.pull = pull;
  fetch(`/api/collection?name=${SEASON_CFG.collectionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then(res => (res.ok ? res.json() : null))
    // The server appended the pull to the real collection (which may have changed since the overlay
    // loaded it, e.g. a viewer upgraded a card); take its copy for this user.
    .then(r => { if (pull && r && Array.isArray(r.owned)) revealedCardsByUser[pull.username] = r.owned; })
    .catch(() => {});
}

async function resetAllCollections() {
  revealedCardsByUser = {};
  await fetch(`/api/collection?name=${SEASON_CFG.collectionName}`, { method: 'DELETE' }).catch(() => {});
  showAlert('🔄 All collections reset');
}

async function resetUserCollection(username) {
  const user = (username || '').toLowerCase().trim();
  if (!user) return;
  delete revealedCardsByUser[user];
  await fetch(`/api/collection?name=${SEASON_CFG.collectionName}&username=${user}`, { method: 'DELETE' }).catch(() => {});
  showAlert('🔄 Reset collection for ' + user);
}

// ═══════════════════════════════════════════════════════
//  ALERT BAR
// ═══════════════════════════════════════════════════════
function showAlert(msg) {
  const el = document.getElementById('alert');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// ═══════════════════════════════════════════════════════
//  AUDIO
// ═══════════════════════════════════════════════════════
function playAudio(src, volume) {
  if (PREVIEW || DEV.mute) return;
  const audio = new Audio(src);
  audio.volume = Math.min(1, Math.max(0, volume ?? 1.0));
  audio.play().catch(() => {});
}

// ═══════════════════════════════════════════════════════
//  BUILD MINI CARD LIST
// ═══════════════════════════════════════════════════════
// ── Image warming ─────────────────────────────────────────
// Card art is a 600px animated WebP (1-4MB). Showing 25 of them at once in the collection grid makes
// the browser source decode and animate all of them; the grid uses tiny static thumbnails instead,
// preloaded + decoded once at startup so it appears instantly. Only the one revealed card is animated.
const WARM_IMAGES = new Map(); // url -> Image, kept alive so the decoded bitmap stays cached

function warmImage(url) {
  if (!url) return Promise.resolve();
  let img = WARM_IMAGES.get(url);
  if (!img) {
    img = new Image();
    img.decoding = 'async';
    img.src = url;
    WARM_IMAGES.set(url, img);
  }
  return (img.decode ? img.decode() : Promise.resolve()).catch(() => {}); // never let a failed image break the overlay
}

function preloadThumbs() {
  for (const card of ALL_CARDS) warmImage(card.thumb);
}

// Grid options for the card list (both the "show collection" view and the strip under a revealed card).
function listOpts(P, strip) {
  return {
    perRow:          strip ? pv(P, 'reveal.stripPerRow', 0) : pv(P, 'collection.perRow', 0),
    cardWidth:       strip ? pv(P, 'reveal.stripCardWidth', 48) : pv(P, 'collection.cardWidth', 48),
    gap:             strip ? pv(P, 'reveal.stripGap', 13) : pv(P, 'collection.gap', 13),
    showUncollected: strip ? pv(P, 'reveal.showUncollectedStrip', true) : pv(P, 'collection.showUncollected', true),
    // The strip under a revealed card and the collection view each have their own card look.
    showCounts:      strip ? pv(P, 'reveal.stripShowCounts', true) : pv(P, 'collection.showCounts', true),
    showMarkers:     strip ? pv(P, 'reveal.stripShowMarkers', true) : pv(P, 'collection.showVariantMarkers', true),
    border:          strip ? pv(P, 'reveal.stripBorderColor', '#ffffff') : pv(P, 'collection.borderColor', '#ffffff'),
    placeholder:     strip ? pv(P, 'reveal.stripPlaceholderColor', '#f1bb06') : pv(P, 'collection.placeholderColor', '#f1bb06'),
    radius:          strip ? pv(P, 'reveal.stripCardRadius', 2) : pv(P, 'collection.cardRadius', 2),
    sort:            strip ? pv(P, 'reveal.stripSort', 'number') : pv(P, 'collection.sort', 'number'),
  };
}

function buildMiniList(miniList, userCards, highlightNumber, cfg, opts) {
  opts = Object.assign({ showUncollected: true, showCounts: true, showMarkers: true, perRow: 0, cardWidth: 48, gap: 13, border: '#ffffff', placeholder: '#f1bb06', radius: 2, sort: 'number' }, opts || {});
  miniList.innerHTML = '';
  const w = opts.cardWidth, h = Math.round(w * 70 / 48), k = w / 48;
  if (opts.perRow > 0) {
    miniList.style.display = 'grid';
    miniList.style.gridTemplateColumns = 'repeat(' + opts.perRow + ', max-content)';
    miniList.style.justifyContent = 'center';
  } else {
    miniList.style.display = '';
    miniList.style.gridTemplateColumns = '';
  }
  miniList.style.gap = opts.gap + 'px';
  miniList.style.setProperty('--mini-placeholder', opts.placeholder);

  const countMap = new Map();
  const bestVariant = new Map(); // highest variant index owned per card
  for (const entry of userCards) {
    const { cardNumber, variant } = decodeEntry(entry);
    countMap.set(cardNumber, (countMap.get(cardNumber) ?? 0) + 1);
    bestVariant.set(cardNumber, Math.max(bestVariant.get(cardNumber) ?? 0, VARIANTS.indexOf(variant)));
  }

  let ordered = ALL_CARDS;
  if (opts.sort === 'owned') ordered = [...ALL_CARDS].sort((a, b) => (countMap.has(b.number) ? 1 : 0) - (countMap.has(a.number) ? 1 : 0) || a.number - b.number);
  else if (opts.sort === 'rarity') ordered = [...ALL_CARDS].sort((a, b) => a.probability - b.probability || b.stars - a.stars || a.number - b.number);

  for (const card of ordered) {
    const count   = countMap.get(card.number) ?? 0;
    const owned   = count > 0;
    if (!owned && card.number !== highlightNumber && !opts.showUncollected) continue;

    const div = document.createElement('div');
    div.classList.add('mini-card');
    div.style.position = 'relative';
    div.style.width  = w + 'px';
    div.style.height = h + 'px';
    div.style.borderRadius = opts.radius + 'px';

    const showImg = (owned || card.number === highlightNumber) && (card.thumb || card.image);

    if (showImg) {
      div.style.backgroundImage    = `url('${card.thumb || card.image}')`;
      div.style.backgroundSize     = 'cover';
      div.style.backgroundPosition = 'center';
      div.style.backgroundRepeat   = 'no-repeat';
      div.style.backgroundColor    = (cfg || PACK_DEFAULTS).accentColor;
      div.style.border             = '3px solid ' + opts.border;
    } else {
      const q = document.createElement('span');
      q.classList.add('mini-question');
      q.textContent = '?';
      q.style.fontSize = Math.round(20 * k) + 'px';
      div.appendChild(q);
    }

    if (count > 1 && opts.showCounts) {
      const badge = document.createElement('div');
      badge.style.cssText = 'position:absolute;bottom:1px;right:1px;background:rgba(0,0,0,0.8);color:#f59e0b;font-weight:700;padding:0 2px;border-radius:2px;line-height:1.4;pointer-events:none;font-size:' + Math.max(7, Math.round(7 * k)) + 'px;';
      badge.textContent = '×' + count;
      div.appendChild(badge);
    }

    if ((bestVariant.get(card.number) ?? 0) > 0 && opts.showMarkers) {
      const spark = document.createElement('div');
      spark.style.cssText = 'position:absolute;top:1px;left:2px;line-height:1;pointer-events:none;text-shadow:0 0 3px #000;font-size:' + Math.max(8, Math.round(8 * k)) + 'px;';
      spark.textContent = '✨';
      div.appendChild(spark);
    }

    miniList.appendChild(div);
  }
}

// ═══════════════════════════════════════════════════════
//  THEATER FACTORY  — each draw gets its own DOM clone
// ═══════════════════════════════════════════════════════
function createTheater(cfg) {
  const tpl = document.getElementById('theater-tpl');
  const id  = ++drawCounter;
  const frag = tpl.content.cloneNode(true);

  // Unique clip-path IDs so multiple theaters don't collide
  const clips = frag.querySelectorAll('clipPath');
  if (clips[0]) clips[0].id = `tb1-clip-${id}`;
  if (clips[1]) clips[1].id = `tb2-clip-${id}`;
  frag.querySelectorAll('image').forEach((img, i) => {
    img.setAttribute('href', cfg.packageImage);
    img.setAttribute('clip-path', `url(#${i === 0 ? 'tb1' : 'tb2'}-clip-${id})`);
  });

  frag.querySelectorAll('.package-image').forEach(img => { img.src = cfg.packageImage; });

  const stage = document.getElementById('stage');
  stage.appendChild(frag);
  const wrapper = stage.lastElementChild;

  // Apply per-pack tear color as a CSS variable scoped to this theater
  wrapper.style.setProperty('--tear-color', cfg.tearBorderColor);

  return {
    wrapper,
    packageContainer: wrapper.querySelector('.package-container'),
    tearBorder1:      wrapper.querySelector('.tear-border-1'),
    cardBox:          wrapper.querySelector('.card-box'),
    cardLabel:        wrapper.querySelector('.card-label'),
    mainCard:         wrapper.querySelector('.main-card'),
    holoOverlay:      wrapper.querySelector('.holographic-overlay'),
    cardInfoOverlay:  wrapper.querySelector('.card-info-overlay'),
    radialContainer:  wrapper.querySelector('.radial-container'),
    cardInfo:         wrapper.querySelector('.card-info'),
    userText:         wrapper.querySelector('.user-text'),
    miniList:         wrapper.querySelector('.card-mini-list'),
  };
}

// ═══════════════════════════════════════════════════════
//  LOOK  (reveal styles + per-variant effects, driven by the overlay properties)
// ═══════════════════════════════════════════════════════
// Each reveal style = which keyframes drive the pack / tear strip / card, and when (seconds at 1× speed) the card is
// revealed (sound, light burst, pop), its info appears, and its label appears. Classic is the original animation.
const REVEALS = {
  classic:     { pack: ['fadeScaleIn', 4.5, 'ease'],  tear: ['tearBorderIn', 4.5, 'ease'], card: ['cardBoxIn', 7.5, 'ease'], reveal: 2.8, info: 3.0, label: 3.2, sounds: true },
  simple:      { pack: null, tear: null, card: ['revealZoom', 0.7, 'cubic-bezier(.2,1.4,.4,1)'], reveal: 0.3, info: 0.7, label: 0.9, sounds: false },
  slide:       { pack: null, tear: null, card: ['revealSlide', 0.8, 'cubic-bezier(.2,.9,.3,1.15)'], reveal: 0.3, info: 0.7, label: 0.9, sounds: false },
  flip:        { pack: null, tear: null, card: ['revealFlip', 1.9, 'ease'], back: true, reveal: 1.3, info: 1.6, label: 1.8, sounds: false },
  'rip-shake': { pack: ['ripShakePack', 3.2, 'linear'], tear: ['ripTearFly', 3.2, 'ease'], card: ['ripCardBurst', 3.2, 'ease'], reveal: 1.9, info: 2.1, label: 2.3, sounds: true },
  'rip-peel':  { pack: ['ripPeelPack', 4, 'ease'],    tear: ['ripPeelTear', 4, 'ease'],    card: ['ripPeelCard', 4, 'ease'],    reveal: 2.8, info: 3.0, label: 3.2, sounds: true },
};

function rgba(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

function setAnim(el, spec, speed) {
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = spec ? spec[0] + ' ' + (spec[1] / speed) + 's ' + spec[2] + ' forwards' : 'none';
}

const gotText = (P, user) => String(pv(P, 'reveal.gotText', '{user} got:')).split('{user}').join(user || 'Someone');
const headingText = (P, user) => String(pv(P, 'collection.headingText', "{user}'s collection:")).split('{user}').join(user || 'Someone');

function holoOn(P, variant, card, cfg) {
  const mode = pv(P, 'variant.' + variant + '.holoMode', variant === 'reverse' || variant === 'shiny' ? 'on' : 'auto');
  return mode === 'on' || (mode === 'auto' && card.stars >= cfg.holoMinStars);
}

// The card's steady-state effects as one animation list: pop on reveal, pulsing glow, gentle rock. `steady` (editor
// still) skips the pop and starts the glow/rock immediately.
function mainCardAnimation(P, variant, speed, revealAt, steady) {
  // Returns { anim, start }: the card's own animation list, and when (seconds) glow / rock / tilt should begin.
  const g = (s, d) => pv(P, 'variant.' + variant + '.' + s, d);
  const parts = [];
  let t = revealAt;
  if (g('pop', false) && !steady) {
    const sc = g('popScale', 1.12), extra = Math.max(0, sc - 1.12) * 2;
    const dur = 0.7 + extra;
    parts.push('variantPop ' + (dur / speed) + 's cubic-bezier(.2,' + (1.6 + extra).toFixed(2) + ',.4,1) ' + (revealAt / speed) + 's both');
    t = revealAt + dur;
  }
  const start = steady ? 0 : t / speed;
  if (g('rock', false)) parts.push('variantRock ' + (g('rockSpeed', 3.6) / speed) + 's ease-in-out ' + start + 's infinite');
  return { anim: parts.join(', ') || 'none', start };
}

// The 3D tilt runs on the card box (its own `rotate` property, so it doesn't fight the entrance transform).
function tiltAnimation(P, variant, speed, start) {
  const g = (s, d) => pv(P, 'variant.' + variant + '.' + s, d);
  if (!g('tilt', false)) return '';
  return 'variantTilt' + g('tiltAxis', 'x') + ' ' + (g('tiltSpeed', 4) / speed) + 's ease-in-out ' + start + 's infinite';
}

// Sets this card's per-variant look as CSS variables on the theater, plus its label.
function applyLook(theater, P, variant, card, cfg, owned) {
  const { wrapper, cardLabel, holoOverlay, cardInfoOverlay, userText, miniList } = theater;
  const g = (s, d) => pv(P, 'variant.' + variant + '.' + s, d);
  const st = wrapper.style;

  wrapper.classList.remove('variant-reverse', 'variant-full', 'variant-shiny');
  if (variant !== 'regular') wrapper.classList.add('variant-' + variant);

  // Label
  const lc = g('labelColors', ['#f1bb06']);
  st.setProperty('--label-bg', lc.length > 1 ? 'linear-gradient(90deg, ' + lc.join(', ') + ')' : lc[0]);
  const ownedLabel = pv(P, 'reveal.labelOwned', '');
  cardLabel.textContent = variant === 'regular' && owned && ownedLabel ? ownedLabel : g('labelText', variant === 'regular' ? 'new' : VARIANT_LABELS[variant]);
  if (!pv(P, 'reveal.showLabel', true)) cardLabel.style.display = 'none';

  // Holographic shimmer
  const colors = g('holoColors', ['#fffee3', '#ffe078', '#afffb5', '#fffee3', '#96f5ff', '#fffee3', '#ffe078', '#fffee3']);
  const stops = [];
  for (let i = 0; i < 8; i++) stops.push('#ffffff00', colors[i % colors.length]);
  stops.push('#ffffff00');
  st.setProperty('--holo-gradient', 'linear-gradient(' + g('holoAngle', 120) + 'deg, ' + stops.join(', ') + ')');
  st.setProperty('--holo-opacity', String(g('holoOpacity', 0.9)));
  st.setProperty('--holo-time', g('holoSpeed', 10.5) + 's');
  st.setProperty('--holo-blend', g('holoBlend', 'overlay'));
  const loop = g('holoLoop', false);
  st.setProperty('--holo-name', loop ? 'rainbowLoop' : 'rainbowShimmer');
  st.setProperty('--holo-iter', loop ? 'infinite' : '1');
  st.setProperty('--holo-timing', loop ? 'linear' : 'ease');

  // Glow, pop and burst
  // Glow: a blurred silhouette layer behind the art (see .glow-layer); blur(r) is a standard deviation, so use half the radius.
  st.setProperty('--glow-a', g('glowColorA', '#ffffff'));
  st.setProperty('--glow-b', g('glowColorB', '#ffffff'));
  st.setProperty('--glow-blur', g('glowBlur', 40) / 2 + 'px');
  st.setProperty('--glow-speed', g('glowSpeed', 1.4) + 's');
  st.setProperty('--glow-scale-lo', String(1 + g('glowSpread', 8) * 0.2 / 160));
  st.setProperty('--glow-scale-hi', String(1 + g('glowSpread', 8) / 160));
  wrapper.classList.toggle('glow-on', !!g('glow', false));
  st.setProperty('--tilt-amt', g('tiltAmount', 14) + 'deg');
  st.setProperty('--tilt-persp', g('tiltPerspective', 900) + 'px');
  wrapper.classList.toggle('tilt-on', !!g('tilt', false));
  st.setProperty('--pop-scale', String(g('popScale', 1.1)));
  st.setProperty('--pop-tilt', g('popTilt', 0) + 'deg');
  st.setProperty('--rock-amt', g('rockAmount', 2) + 'deg');
  st.setProperty('--burst-a', rgba(g('burstColor', '#fff08c'), 1));
  st.setProperty('--burst-b', rgba(g('burstColor', '#fff08c'), 0));
  wrapper.classList.toggle('burst-cycle', !!g('burstHue', false));

  // Card styling shared by every version (Pack opening group)
  st.setProperty('--card-scale', String(pv(P, 'reveal.cardScale', 1)));
  st.setProperty('--label-size', pv(P, 'reveal.labelSize', 14) + 'px');
  st.setProperty('--name-color', pv(P, 'reveal.nameColor', '#f1bb06'));
  st.setProperty('--star-color', pv(P, 'reveal.starColor', '#f1bb06'));
  st.setProperty('--info-bg', pv(P, 'reveal.infoBg', '#fffefe'));
  st.setProperty('--got-bg', pv(P, 'reveal.gotColor', '#f1bb06'));
  st.setProperty('--got-fg', pv(P, 'reveal.gotTextColor', '#fffefe'));

  // Visibility toggles
  if (!pv(P, 'reveal.showInfoBar', true)) cardInfoOverlay.style.display = 'none';
  if (!pv(P, 'reveal.showGotLine', true)) userText.style.display = 'none';
  if (!pv(P, 'reveal.showMiniList', true)) miniList.style.display = 'none';
}

function paintCard(theater, card, art, artThumb) {
  const { mainCard, cardInfoOverlay } = theater;
  const artEl = mainCard.querySelector('.card-art');
  // The holo layer is masked to this art's silhouette using its static thumbnail (same shape, tiny, never animated).
  mainCard.style.setProperty('--card-mask', artThumb && artThumb !== art ? "url('" + artThumb + "')" : 'none');
  if (art) {
    artEl.style.backgroundImage = "url('" + art + "')";
    artEl.style.backgroundColor = 'transparent';
  } else {
    artEl.style.backgroundImage = 'none';
    artEl.style.backgroundColor = 'white';
  }
  const num1 = mainCard.querySelector('.card-number-1 > span:first-child');
  const num2 = mainCard.querySelector('.card-number-2 > span:first-child');
  if (num1) num1.textContent = card.number;
  if (num2) num2.textContent = card.number;
  const nameEl  = cardInfoOverlay.querySelector('.card-name');
  const starsEl = cardInfoOverlay.querySelector('.card-stars');
  if (nameEl)  nameEl.textContent = card.name;
  if (starsEl) starsEl.innerHTML  = STAR_SVG.repeat(card.stars);
}

// A burst of sparkles flying out from the middle of the revealed card (per-version, experimental).
function burstSparkles(cardBox, P, variant, speed) {
  const g = (s, d) => pv(P, 'variant.' + variant + '.' + s, d);
  const n = Math.round(g('sparkleCount', 28));
  const layer = document.createElement('div');
  layer.className = 'spark-layer';
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const dist = 140 + Math.random() * 190;
    const el = document.createElement('span');
    el.textContent = i % 3 === 0 ? '✦' : '✧';
    el.style.color = g('sparkleColor', '#ffe27a');
    el.style.fontSize = (12 + Math.random() * 18) + 'px';
    el.style.setProperty('--dx', Math.round(Math.cos(a) * dist) + 'px');
    el.style.setProperty('--dy', Math.round(Math.sin(a) * dist) + 'px');
    el.style.setProperty('--rot', Math.round(Math.random() * 360 - 180) + 'deg');
    el.style.animationDuration = ((0.9 + Math.random() * 0.8) / speed) + 's';
    layer.appendChild(el);
  }
  cardBox.appendChild(layer);
  setTimeout(() => layer.remove(), 2200 / speed);
}

// ═══════════════════════════════════════════════════════
//  DRAW CARD
// ═══════════════════════════════════════════════════════
function drawCard(username, opts) {
  opts = opts || {};
  const user = (username || 'someone').toLowerCase().trim();
  if (!Array.isArray(revealedCardsByUser[user])) revealedCardsByUser[user] = [];

  const pick = pickPackAndCard(opts);
  if (!pick) {
    showAlert('⚠️ No cards available — check your active season has packs with cards.');
    activeDraws--;
    setTimeout(processCardQueue, 1000);
    return;
  }

  const { card, variant, packName, packId } = pick;
  const P = effectiveProps(packId);
  const S = Math.max(0.25, pv(P, 'reveal.speed', 1));
  const R = REVEALS[pv(P, 'reveal.style', 'classic')] || REVEALS.classic;
  const at = sec => (sec * 1000) / S;
  // Test panel "quick" mode shortens the on-screen time so many draws can be reviewed fast.
  const cfg = DEV.quick ? Object.assign({}, pick.cfg, { cardTime: Math.min(pick.cfg.cardTime, 1.5), cooldownTime: 0.2 }) : pick.cfg;
  // Full Art and Shiny use the card's full-art image when it has one; Regular and Reverse use the base art.
  const isFullArt = (variant === 'full' || variant === 'shiny') && card.fullArt;
  const art = isFullArt ? card.fullArt : card.image;
  // The card isn't revealed for a moment; fetch and decode its animated art now so the reveal never hitches.
  warmImage(art);
  const theater = createTheater(cfg);
  const { wrapper, packageContainer, tearBorder1, cardBox, cardLabel,
          mainCard, holoOverlay, radialContainer,
          cardInfo, userText, miniList } = theater;

  const vol = cfg.soundVolume;
  const cardVol = Math.min(1, vol * pv(P, 'variant.' + variant + '.volume', 1));

  if (R.sounds && pv(P, 'reveal.packSounds', true)) {
    for (const s of PACK_SOUNDS) setTimeout(() => playAudio(s.src, vol), s.delay / S);
  }

  // Reset state
  packageContainer.style.opacity = '0';
  if (!R.pack) packageContainer.style.display = 'none';
  cardBox.style.opacity           = '0';
  cardLabel.style.opacity         = '0';
  cardLabel.style.visibility      = 'hidden';
  cardInfo.style.opacity          = '0';
  cardInfo.style.transform        = 'scale(0)';
  radialContainer.style.opacity   = '0';
  radialContainer.style.animation = 'none';
  wrapper.style.visibility        = 'visible';
  wrapper.classList.remove('hid', 'hidden');
  wrapper.classList.add('pack-fit', 'is-pack');

  const owned = revealedCardsByUser[user].some(e => decodeEntry(e).cardNumber === card.number);
  applyLook(theater, P, variant, card, cfg, owned);
  paintCard(theater, card, art, isFullArt ? card.fullArtThumb : card.thumb);

  // Flip reveal: a card back (the pack's cover) sits over the art until the card turns edge-on.
  if (R.back) {
    const back = document.createElement('div');
    back.className = 'card-back';
    back.style.backgroundImage = "url('" + cfg.packageImage + "')";
    mainCard.appendChild(back);
    setAnim(back, ['flipBack', R.card[1], 'linear'], S);
  }

  // Animations
  if (R.pack) { setAnim(packageContainer, R.pack, S); setAnim(tearBorder1, R.tear, S); }
  setAnim(cardBox, R.card, S);
  const fx = mainCardAnimation(P, variant, S, R.reveal, false);
  mainCard.style.animation = fx.anim;
  wrapper.style.setProperty('--fx-start', fx.start + 's');
  const tilt = tiltAnimation(P, variant, S, fx.start);
  if (tilt) cardBox.style.animation = cardBox.style.animation + ', ' + tilt;

  // Card reveal sound + radial burst
  setTimeout(() => {
    playAudio(card.soundUrl || `assets/sounds/${card.number}.mp3`, cardVol);
    if (pv(P, 'variant.' + variant + '.sparkles', false)) burstSparkles(cardBox, P, variant, S);
    if (pv(P, 'reveal.showBurst', true)) {
      radialContainer.style.opacity   = String(pv(P, 'reveal.burstOpacity', 0.85));
      radialContainer.style.animation = 'spinRadial 4s linear infinite';
    }
  }, at(R.reveal));

  // Label
  setTimeout(() => {
    cardLabel.style.opacity    = '1';
    cardLabel.style.visibility = 'visible';
  }, at(R.label));

  // User text
  setTimeout(() => {
    cardInfo.style.opacity   = '1';
    cardInfo.style.transform = 'scale(1)';
    userText.textContent     = gotText(P, username);
  }, at(R.info));

  if (holoOverlay) {
    if (holoOn(P, variant, card, cfg)) {
      holoOverlay.classList.remove('holographic-animate');
      void holoOverlay.offsetWidth;
      holoOverlay.classList.add('holographic-animate');
    } else {
      holoOverlay.classList.remove('holographic-animate');
      holoOverlay.style.opacity = '0';
    }
  }

  buildMiniList(miniList, revealedCardsByUser[user], card.number, cfg, listOpts(P, true));
  if (listOpts(P, true).perRow > 0) wrapper.style.maxWidth = 'none';

  const entry = encodeEntry(card.number, variant);
  // Dry runs (test panel) show the draw but leave the collection, activity log and webhooks alone.
  if (!opts.dry) {
    revealedCardsByUser[user].push(entry);
    saveCollection({ username: user, cardNumber: card.number, entry, variant, cardName: card.name, stars: card.stars, packName });
  }

  // Hide + cleanup
  const showDuration = at(R.label) + 800 + cfg.cardTime * 1000 + pv(P, 'variant.' + variant + '.holdExtra', 0) * 1000;
  setTimeout(() => {
    radialContainer.style.opacity   = '0';
    radialContainer.style.animation = 'none';
    wrapper.classList.add('hid');
    setTimeout(() => {
      wrapper.remove();
      activeDraws--;
      setTimeout(processCardQueue, cfg.cooldownTime * 1000);
    }, 500);
  }, showDuration);
}

// ═══════════════════════════════════════════════════════
//  SHOW COLLECTION
// ═══════════════════════════════════════════════════════
function showCollection(username, opts) {
  opts = opts || {};
  const user = (username || 'someone').toLowerCase().trim();
  if (!Array.isArray(revealedCardsByUser[user])) revealedCardsByUser[user] = [];

  const P = effectiveProps(null);
  const cfg = packConfig(PACKS[0]?.pack);
  const theater = createTheater(cfg);
  const { wrapper, packageContainer, cardBox, radialContainer,
          cardInfo, userText, miniList } = theater;

  packageContainer.style.display = 'none';
  cardBox.style.display          = 'none';
  radialContainer.style.display  = 'none';

  // Fade in: commit the transparent start state, then release it so the transition runs.
  wrapper.classList.add('fade-in', 'fade-in-start', 'is-collection', 'appear-' + pv(P, 'collection.appear', 'fade'));
  wrapper.style.visibility = 'visible';
  void wrapper.offsetWidth;
  wrapper.classList.remove('fade-in-start');
  cardInfo.style.opacity   = '1';
  cardInfo.style.transform = 'scale(1)';
  userText.textContent     = headingText(P, username);
  if (!pv(P, 'collection.showHeading', true)) userText.style.display = 'none';

  if (!PREVIEW && !opts.dry) fetch('/api/webhooks/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'collectionShown', username: user }),
  }).catch(() => {});

  const listOptions = listOpts(P, false);
  if (listOptions.perRow > 0) wrapper.style.maxWidth = 'none';
  buildMiniList(miniList, revealedCardsByUser[user], null, cfg, listOptions);

  if (collectionTimeout) clearTimeout(collectionTimeout);
  collectionTimeout = setTimeout(() => {
    wrapper.classList.remove('fade-in');   // fade-out keeps the shorter default timing
    wrapper.classList.add('hid');
    setTimeout(() => {
      wrapper.remove();
      activeDraws--;
      processCardQueue();
    }, 500);
  }, pv(P, 'collection.hold', 4) * 1000);
}

// ═══════════════════════════════════════════════════════
//  QUEUE  (allows up to maxConcurrentPacks simultaneous draws)
// ═══════════════════════════════════════════════════════
function processCardQueue() {
  while (cardQueue.length > 0 && activeDraws < SEASON_CFG.maxConcurrentPacks) {
    activeDraws++;
    const fn = cardQueue.shift();
    fn();
  }
  // Admin editor preview: once an animation has finished, go back to the still so it can be positioned again.
  if (PREVIEW && activeDraws === 0 && cardQueue.length === 0) showStatic();
}

// ═══════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════
function queueDraw(username, opts) {
  cardQueue.push(() => drawCard(username, opts));
  processCardQueue();
}

function queueCollection(username, opts) {
  cardQueue.push(() => showCollection(username, opts));
  processCardQueue();
}

// ═══════════════════════════════════════════════════════
//  DEV / TEST PANEL
// ═══════════════════════════════════════════════════════
function initDevPanel() {
  const panel = document.getElementById('dev-panel');
  if (!panel) return;

  if (!new URLSearchParams(window.location.search).has('dev')) {
    panel.classList.add('hidden');
    return;
  }

  const $ = id => document.getElementById(id);
  const usernameInput = $('dev-username');
  const packSel = $('dev-pack');
  const cardSel = $('dev-card');
  const variantSel = $('dev-variant');
  const countInput = $('dev-count');
  const user = () => usernameInput.value.trim() || 'testuser';

  // ── Pack + card pickers (filled from the loaded season) ──
  const addOption = (sel, value, text) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    sel.appendChild(o);
  };
  addOption(packSel, '', 'Any pack (by weight)');
  PACKS.forEach(p => addOption(packSel, p.pack.id, p.pack.name + (p.pack.upgradesEnabled ? '  ✨' : '')));

  function fillCards() {
    const keep = cardSel.value;
    cardSel.innerHTML = '';
    addOption(cardSel, '', 'Random card');
    const source = packSel.value ? PACKS.filter(p => p.pack.id === packSel.value) : PACKS;
    const seen = new Set();
    source.flatMap(p => p.cards).sort((a, b) => a.number - b.number).forEach(c => {
      if (seen.has(c.number)) return;
      seen.add(c.number);
      addOption(cardSel, String(c.number), '#' + c.number + ' ' + c.name + '  ' + '★'.repeat(c.stars));
    });
    if ([...cardSel.options].some(o => o.value === keep)) cardSel.value = keep;
  }

  // What the current pack/card/variant choices will do, in words.
  function updateInfo() {
    const info = $('dev-odds');
    const packs = packSel.value ? PACKS.filter(p => p.pack.id === packSel.value) : PACKS;
    const upg = packs.filter(p => p.pack.upgradesEnabled);
    if (variantSel.value) {
      info.textContent = 'Forced ' + VARIANT_LABELS[variantSel.value] + (upg.length === 0 ? ' (this pack has upgrades off — shown anyway)' : '');
    } else if (upg.length === 0) {
      info.textContent = 'Upgrades off: always Regular';
    } else {
      const w = Object.assign({}, DEFAULT_VARIANT_WEIGHTS, upg[0].pack.variantWeights);
      const total = VARIANTS.reduce((s, v) => s + Math.max(0, w[v]), 0) || 1;
      const pct = v => (w[v] / total * 100).toFixed(w[v] / total < 0.1 ? 1 : 0) + '%';
      info.textContent = 'Odds: Reg ' + pct('regular') + ' · RH ' + pct('reverse') + ' · FA ' + pct('full') + ' · Shiny ' + pct('shiny');
    }
  }
  packSel.addEventListener('change', () => { fillCards(); updateInfo(); });
  variantSel.addEventListener('change', updateInfo);
  fillCards();
  updateInfo();

  // Current choices as draw options. `variant` overrides the dropdown (used by "all variants" and R/F/S).
  const options = over => Object.assign({
    packId: packSel.value || null,
    cardNumber: cardSel.value ? Number(cardSel.value) : null,
    variant: variantSel.value || null,
    dry: DEV.dry,
  }, over);

  // ── Actions ──
  function draw(n) {
    const count = Math.max(1, Math.min(20, n || 1));
    for (let i = 0; i < count; i++) queueDraw(user(), options());
  }
  // One draw of the chosen card per variant, in rarity order. With "Random card" it's a single random
  // card shown four ways, so the variants can be compared like for like.
  function drawAllVariants() {
    let cardNumber = cardSel.value ? Number(cardSel.value) : null;
    if (cardNumber == null) {
      const source = packSel.value ? PACKS.filter(p => p.pack.id === packSel.value) : PACKS;
      const cards = source.flatMap(p => p.cards);
      if (cards.length) cardNumber = cards[Math.floor(Math.random() * cards.length)].number;
    }
    VARIANTS.forEach(v => queueDraw(user(), options({ cardNumber, variant: v })));
  }

  $('btn-draw').addEventListener('click', () => draw(Number(countInput.value)));
  $('btn-all-variants').addEventListener('click', drawAllVariants);
  $('btn-collection').addEventListener('click', () => queueCollection(user(), { dry: DEV.dry }));
  $('btn-clear-queue').addEventListener('click', () => { cardQueue.length = 0; });
  $('btn-reset-user').addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (!name) { showAlert('⚠️ Enter a username to reset'); return; }
    if (confirm('Reset ' + name + '\'s saved collection? This writes to the real data.')) resetUserCollection(name);
  });
  $('btn-reset-all').addEventListener('click', () => {
    if (confirm('Reset ALL player collections? This writes to the real data.')) resetAllCollections();
  });

  // ── Switches ──
  const bindSwitch = (id, key) => {
    const el = $(id);
    el.checked = DEV[key];
    el.addEventListener('change', () => { DEV[key] = el.checked; updateBanner(); });
  };
  bindSwitch('dev-dry', 'dry');
  bindSwitch('dev-mute', 'mute');
  bindSwitch('dev-quick', 'quick');

  // A loud reminder while draws are being saved, since that writes real pulls.
  function updateBanner() { $('dev-live-warning').classList.toggle('hidden', DEV.dry); }
  updateBanner();

  // ── Collapse ──
  $('dev-toggle').addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    $('dev-toggle').textContent = collapsed ? '+' : '–';
  });

  // ── Live status ──
  setInterval(() => {
    $('dev-status').textContent = 'Queue ' + cardQueue.length + ' · showing ' + activeDraws + ' / ' + SEASON_CFG.maxConcurrentPacks;
  }, 400);

  // ── Keyboard: D draw · A all variants · R / F / S force a variant · C collection ──
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'd') draw(Number(countInput.value));
    else if (key === 'a') drawAllVariants();
    else if (key === 'c') queueCollection(user(), { dry: DEV.dry });
    else if ({ r: 'reverse', f: 'full', s: 'shiny' }[key]) queueDraw(user(), options({ variant: { r: 'reverse', f: 'full', s: 'shiny' }[key] }));
  });
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
async function pollWebhookQueue() {
  try {
    const res = await fetch('/api/webhooks/queue');
    if (!res.ok) return;
    const event = await res.json();
    if (!event) return;
    if (event.type === 'pull')       queueDraw(event.username);
    else if (event.type === 'collection') queueCollection(event.username);
  } catch {
    // ignore — overlay keeps working if server is unreachable
  }
}

// ═══════════════════════════════════════════════════════
//  HEARTBEAT  (lets the admin dashboard see the overlay is open)
// ═══════════════════════════════════════════════════════
// One random id per page load. If OBS grants this source "Read access to OBS status information"
// (Browser source → Page permissions), window.obsstudio.getStatus() also tells us whether OBS is
// streaming/recording; without that permission those fields are simply null ("unknown").
const OVERLAY_ID = (window.crypto && crypto.randomUUID)
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);

function readObsStatus() {
  return new Promise(resolve => {
    if (!window.obsstudio || typeof window.obsstudio.getStatus !== 'function') return resolve(null);
    // Without the permission the callback may never fire, so don't wait forever.
    const timer = setTimeout(() => resolve(null), 1500);
    try {
      window.obsstudio.getStatus(status => {
        clearTimeout(timer);
        resolve(status ? { streaming: !!status.streaming, recording: !!status.recording } : null);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function sendHeartbeat() {
  const obs = await readObsStatus();
  fetch('/api/overlay/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({
      id: OVERLAY_ID,
      streaming: obs ? obs.streaming : null,
      recording: obs ? obs.recording : null,
      obs: !!window.obsstudio || /OBS\//i.test(navigator.userAgent),
      dev: new URLSearchParams(window.location.search).has('dev'),
    }),
  }).catch(() => {}); // never let a failed ping affect the overlay
}

function startHeartbeat() {
  sendHeartbeat();
  setInterval(sendHeartbeat, 10000);
  // OBS fires these when the stream/recording starts or stops — report the change straight away.
  ['obsStreamingStarted', 'obsStreamingStopped', 'obsRecordingStarted', 'obsRecordingStopped']
    .forEach(name => window.addEventListener(name, sendHeartbeat));
}

document.addEventListener('DOMContentLoaded', async () => {
  if (PREVIEW) {
    // Admin editor preview: fake data only, no heartbeat / queue polling / saving.
    document.getElementById('dev-panel')?.classList.add('hidden');
    await initSeason();
    revealedCardsByUser.preview = ALL_CARDS.slice(0, 10).map(c => c.number);
    showStatic('pack');
    return;
  }
  startHeartbeat(); // first, so "overlay open" shows even if the season fails to load
  await Promise.all([loadLayout(), initSeason()]);
  await loadCollection();
  initDevPanel();
  setInterval(pollWebhookQueue, 2000);
});
