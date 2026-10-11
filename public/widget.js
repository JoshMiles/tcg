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

async function loadLayout() {
  try {
    const res = await fetch('/api/overlay/config', { cache: 'no-store' });
    if (res.ok) applyLayout((await res.json()).layout);
  } catch { /* keep the defaults */ }
}

window.addEventListener('resize', () => applyLayout());
applyLayout();

// ── Admin editor preview (?preview) ──
// Shows a still of the pack opening / collection view while nothing is animating, so it can be positioned, and plays
// the real animation on request. Messages from the editor: layout, static (which view to show), pack, collection.
let previewMode = 'pack';

function clearStatic() {
  document.querySelectorAll('.static-preview').forEach(el => el.remove());
}

function showStatic(mode) {
  if (!PREVIEW) return;
  if (mode) previewMode = mode;
  clearStatic();
  if (PACKS.length === 0) return;

  const cfg = packConfig(PACKS[0].pack);
  const theater = createTheater(cfg);
  const { wrapper, packageContainer, cardBox, cardLabel, mainCard, cardInfoOverlay, radialContainer, cardInfo, userText, miniList } = theater;
  wrapper.classList.add('static-preview');
  wrapper.style.visibility = 'visible';
  packageContainer.style.opacity = '0';

  if (previewMode === 'pack') {
    // The settled moment of a pack opening: the revealed card, its label and the collection strip beneath it.
    const cards = PACKS.flatMap(p => p.cards);
    const card = [...cards].sort((x, y) => y.stars - x.stars)[0];
    wrapper.classList.add('is-pack', 'pack-fit');
    cardBox.style.animation = 'none';
    cardBox.style.opacity = '1';
    cardLabel.style.opacity = '1';
    cardLabel.style.visibility = 'visible';
    radialContainer.style.animation = 'none';
    radialContainer.style.opacity = '1';
    cardInfo.style.opacity = '1';
    cardInfo.style.transform = 'scale(1)';
    userText.textContent = 'Preview got:';
    if (card) {
      if (card.image) {
        mainCard.style.backgroundImage = `url('${card.image}')`;
        mainCard.style.backgroundSize = 'cover';
        mainCard.style.backgroundPosition = 'center';
        mainCard.style.backgroundRepeat = 'no-repeat';
        mainCard.style.backgroundColor = 'transparent';
      }
      mainCard.style.setProperty('--card-mask', card.thumb && card.thumb !== card.image ? `url('${card.thumb}')` : 'none');
      const num1 = mainCard.querySelector('.card-number-1 > span:first-child');
      const num2 = mainCard.querySelector('.card-number-2 > span:first-child');
      if (num1) num1.textContent = card.number;
      if (num2) num2.textContent = card.number;
      const nameEl = cardInfoOverlay.querySelector('.card-name');
      const starsEl = cardInfoOverlay.querySelector('.card-stars');
      if (nameEl) nameEl.textContent = card.name;
      if (starsEl) starsEl.innerHTML = STAR_SVG.repeat(card.stars);
      buildMiniList(miniList, revealedCardsByUser.preview || [], card.number, cfg);
    }
  } else {
    // The collection view: just the name and the card grid.
    wrapper.classList.add('is-collection');
    cardBox.style.display = 'none';
    radialContainer.style.display = 'none';
    cardInfo.style.opacity = '1';
    cardInfo.style.transform = 'scale(1)';
    userText.textContent = "Preview's collection:";
    buildMiniList(miniList, revealedCardsByUser.preview || [], null, cfg);
  }
}

if (PREVIEW) {
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'layout') applyLayout(e.data.layout);
    else if (e.data.type === 'static') { if (activeDraws === 0) showStatic(e.data.mode); else previewMode = e.data.mode === 'collection' ? 'collection' : 'pack'; }
    else if (e.data.type === 'pack') { clearStatic(); queueDraw('preview', { dry: true }); }
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

  return { card, variant, cfg: packConfig(chosen.pack), packName: chosen.pack.name };
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
  audio.volume = volume ?? 1.0;
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

function buildMiniList(miniList, userCards, highlightNumber, cfg) {
  miniList.innerHTML = '';
  const countMap = new Map();
  const bestVariant = new Map(); // highest variant index owned per card
  for (const entry of userCards) {
    const { cardNumber, variant } = decodeEntry(entry);
    countMap.set(cardNumber, (countMap.get(cardNumber) ?? 0) + 1);
    bestVariant.set(cardNumber, Math.max(bestVariant.get(cardNumber) ?? 0, VARIANTS.indexOf(variant)));
  }

  for (const card of ALL_CARDS) {
    const div = document.createElement('div');
    div.classList.add('mini-card');
    div.style.position = 'relative';

    const count   = countMap.get(card.number) ?? 0;
    const owned   = count > 0;
    const showImg = (owned || card.number === highlightNumber) && (card.thumb || card.image);

    if (showImg) {
      div.style.backgroundImage    = `url('${card.thumb || card.image}')`;
      div.style.backgroundSize     = 'cover';
      div.style.backgroundPosition = 'center';
      div.style.backgroundRepeat   = 'no-repeat';
      div.style.backgroundColor    = (cfg || PACK_DEFAULTS).accentColor;
      div.style.border             = '3px solid white';
    } else {
      const q = document.createElement('span');
      q.classList.add('mini-question');
      q.textContent = '?';
      div.appendChild(q);
    }

    if (count > 1) {
      const badge = document.createElement('div');
      badge.style.cssText = 'position:absolute;bottom:1px;right:1px;background:rgba(0,0,0,0.8);color:#f59e0b;font-size:7px;font-weight:700;padding:0 2px;border-radius:2px;line-height:1.4;pointer-events:none;';
      badge.textContent = '×' + count;
      div.appendChild(badge);
    }

    if ((bestVariant.get(card.number) ?? 0) > 0) {
      const spark = document.createElement('div');
      spark.style.cssText = 'position:absolute;top:1px;left:2px;font-size:8px;line-height:1;pointer-events:none;text-shadow:0 0 3px #000;';
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

  const { card, variant, packName } = pick;
  // Test panel "quick" mode shortens the on-screen time so many draws can be reviewed fast.
  const cfg = DEV.quick ? Object.assign({}, pick.cfg, { cardTime: Math.min(pick.cfg.cardTime, 1.5), cooldownTime: 0.2 }) : pick.cfg;
  // Full Art and Shiny use the card's full-art image when it has one; Regular and Reverse use the base art.
  const art = (variant === 'full' || variant === 'shiny') && card.fullArt ? card.fullArt : card.image;
  // The card isn't revealed for ~3s; fetch and decode its animated art now so the reveal never hitches.
  warmImage(art);
  const theater = createTheater(cfg);
  const { wrapper, packageContainer, tearBorder1, cardBox, cardLabel,
          mainCard, holoOverlay, cardInfoOverlay, radialContainer,
          cardInfo, userText, miniList } = theater;

  const vol = cfg.soundVolume;

  for (const s of PACK_SOUNDS) {
    setTimeout(() => playAudio(s.src, vol), s.delay);
  }

  // Reset state
  packageContainer.style.opacity = '0';
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
  wrapper.classList.remove('variant-reverse', 'variant-full', 'variant-shiny');
  if (variant !== 'regular') wrapper.classList.add('variant-' + variant);

  // Animations
  packageContainer.style.animation = 'none';
  void packageContainer.offsetWidth;
  packageContainer.style.animation = 'fadeScaleIn 4.5s ease';

  tearBorder1.style.animation = 'none';
  void tearBorder1.offsetWidth;
  tearBorder1.style.animation = 'tearBorderIn 4.5s';

  cardBox.style.animation = 'none';
  void cardBox.offsetWidth;
  cardBox.style.animation = 'cardBoxIn 7.5s ease forwards';

  // Card reveal sound + radial burst
  setTimeout(() => {
    playAudio(card.soundUrl || `assets/sounds/${card.number}.mp3`, vol);
    radialContainer.style.opacity   = '1';
    radialContainer.style.animation = 'spinRadial 4s linear infinite';
  }, 2800);

  // "new" label
  if (variant !== 'regular') cardLabel.textContent = variant === 'shiny' ? '✨ ' + VARIANT_LABELS[variant] : VARIANT_LABELS[variant];
  setTimeout(() => {
    cardLabel.style.opacity    = '1';
    cardLabel.style.visibility = 'visible';
  }, 3200);

  // User text
  setTimeout(() => {
    cardInfo.style.opacity   = '1';
    cardInfo.style.transform = 'scale(1)';
    userText.textContent     = (username || 'Someone') + ' got:';
  }, 3000);

  // Card image
  // The holo layer is masked to this art's silhouette using its static thumbnail (same shape, tiny, never animated).
  const isFullArt = (variant === 'full' || variant === 'shiny') && card.fullArt;
  const artThumb = isFullArt ? card.fullArtThumb : card.thumb;
  mainCard.style.setProperty('--card-mask', artThumb && artThumb !== art ? `url('${artThumb}')` : 'none');

  if (art) {
    mainCard.style.backgroundImage    = `url('${art}')`;
    mainCard.style.backgroundSize     = 'cover';
    mainCard.style.backgroundPosition = 'center';
    mainCard.style.backgroundRepeat   = 'no-repeat';
    mainCard.style.backgroundColor    = 'transparent';
  } else {
    mainCard.style.backgroundImage = 'none';
    mainCard.style.backgroundColor = 'white';
  }

  const num1 = mainCard.querySelector('.card-number-1 > span:first-child');
  const num2 = mainCard.querySelector('.card-number-2 > span:first-child');
  if (num1) num1.textContent = card.number;
  if (num2) num2.textContent = card.number;

  const nameEl  = cardInfoOverlay.querySelector('.card-name');
  const starsEl = cardInfoOverlay.querySelector('.card-stars');
  if (nameEl)  nameEl.textContent = card.name;
  if (starsEl) starsEl.innerHTML  = STAR_SVG.repeat(card.stars);

  if (holoOverlay) {
    // Reverse Holo and Shiny are the holo effect on top of their base art, whatever the card's star rating.
    if (card.stars >= cfg.holoMinStars || variant === 'reverse' || variant === 'shiny') {
      holoOverlay.classList.remove('holographic-animate');
      void holoOverlay.offsetWidth;
      holoOverlay.classList.add('holographic-animate');
    } else {
      holoOverlay.classList.remove('holographic-animate');
      holoOverlay.style.opacity = '0';
    }
  }

  buildMiniList(miniList, revealedCardsByUser[user], card.number, cfg);

  const entry = encodeEntry(card.number, variant);
  // Dry runs (test panel) show the draw but leave the collection, activity log and webhooks alone.
  if (!opts.dry) {
    revealedCardsByUser[user].push(entry);
    saveCollection({ username: user, cardNumber: card.number, entry, variant, cardName: card.name, stars: card.stars, packName });
  }

  // Hide + cleanup
  const showDuration = cfg.cardTime * 1000 + 4000;
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

  const cfg = packConfig(PACKS[0]?.pack);
  const theater = createTheater(cfg);
  const { wrapper, packageContainer, cardBox, radialContainer,
          cardInfo, userText, miniList } = theater;

  packageContainer.style.display = 'none';
  cardBox.style.display          = 'none';
  radialContainer.style.display  = 'none';

  // Fade in: commit the transparent start state, then release it so the opacity transition runs.
  wrapper.classList.add('fade-in', 'fade-in-start', 'is-collection');
  wrapper.style.visibility = 'visible';
  void wrapper.offsetWidth;
  wrapper.classList.remove('fade-in-start');
  cardInfo.style.opacity   = '1';
  cardInfo.style.transform = 'scale(1)';
  userText.textContent     = (username || 'Someone') + "'s collection:";

  if (!PREVIEW && !opts.dry) fetch('/api/webhooks/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'collectionShown', username: user }),
  }).catch(() => {});

  buildMiniList(miniList, revealedCardsByUser[user], null, cfg);

  if (collectionTimeout) clearTimeout(collectionTimeout);
  collectionTimeout = setTimeout(() => {
    wrapper.classList.remove('fade-in');   // fade-out keeps the shorter default timing
    wrapper.classList.add('hid');
    setTimeout(() => {
      wrapper.remove();
      activeDraws--;
      processCardQueue();
    }, 500);
  }, 4000);
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
