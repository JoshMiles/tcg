'use strict';

// ═══════════════════════════════════════════════════════
//  SEASON DATA  (loaded from /api/seasons/active)
// ═══════════════════════════════════════════════════════
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
function pickPackAndCard() {
  if (PACKS.length === 0) return null;

  // Weighted pack selection
  const totalWeight = PACKS.reduce((s, { pack }) => s + (pack.weight || 1), 0);
  let rw = Math.random() * totalWeight;
  let chosen = PACKS[PACKS.length - 1];
  for (const p of PACKS) {
    rw -= (p.pack.weight || 1);
    if (rw <= 0) { chosen = p; break; }
  }

  // Weighted card selection within the chosen pack
  if (chosen.cards.length === 0) return null;
  const totalProb = chosen.cards.reduce((s, c) => s + c.probability, 0);
  let rp = Math.random() * totalProb;
  let card = chosen.cards[chosen.cards.length - 1];
  for (const c of chosen.cards) {
    rp -= c.probability;
    if (rp <= 0) { card = c; break; }
  }

  return { card, cfg: packConfig(chosen.pack), packName: chosen.pack.name };
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
  if (!SEASON_CFG.collectionName) return;
  const body = { data: revealedCardsByUser };
  if (pull) body.pull = pull;
  fetch(`/api/collection?name=${SEASON_CFG.collectionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
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
  for (const n of userCards) countMap.set(n, (countMap.get(n) ?? 0) + 1);

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
function drawCard(username) {
  const user = (username || 'someone').toLowerCase().trim();
  if (!Array.isArray(revealedCardsByUser[user])) revealedCardsByUser[user] = [];

  const pick = pickPackAndCard();
  if (!pick) {
    showAlert('⚠️ No cards available — check your active season has packs with cards.');
    activeDraws--;
    setTimeout(processCardQueue, 1000);
    return;
  }

  const { card, cfg, packName } = pick;
  // The card isn't revealed for ~3s; fetch and decode its animated art now so the reveal never hitches.
  warmImage(card.image);
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
  wrapper.classList.add('pack-fit');

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
  if (card.image) {
    mainCard.style.backgroundImage    = `url('${card.image}')`;
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
    if (card.stars >= cfg.holoMinStars) {
      holoOverlay.classList.remove('holographic-animate');
      void holoOverlay.offsetWidth;
      holoOverlay.classList.add('holographic-animate');
    } else {
      holoOverlay.classList.remove('holographic-animate');
      holoOverlay.style.opacity = '0';
    }
  }

  buildMiniList(miniList, revealedCardsByUser[user], card.number, cfg);

  revealedCardsByUser[user].push(card.number);
  saveCollection({ username: user, cardNumber: card.number, cardName: card.name, stars: card.stars, packName });

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
function showCollection(username) {
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
  wrapper.classList.add('fade-in', 'fade-in-start');
  wrapper.style.visibility = 'visible';
  void wrapper.offsetWidth;
  wrapper.classList.remove('fade-in-start');
  cardInfo.style.opacity   = '1';
  cardInfo.style.transform = 'scale(1)';
  userText.textContent     = (username || 'Someone') + "'s collection:";

  fetch('/api/webhooks/notify', {
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
}

// ═══════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════
function queueDraw(username) {
  cardQueue.push(() => drawCard(username));
  processCardQueue();
}

function queueCollection(username) {
  cardQueue.push(() => showCollection(username));
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

  const usernameInput = document.getElementById('dev-username');

  document.getElementById('btn-draw').addEventListener('click', () => {
    queueDraw(usernameInput.value.trim() || 'testuser');
  });
  document.getElementById('btn-collection').addEventListener('click', () => {
    queueCollection(usernameInput.value.trim() || 'testuser');
  });
  document.getElementById('btn-reset-user').addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (!name) { showAlert('⚠️ Enter a username to reset'); return; }
    resetUserCollection(name);
  });
  document.getElementById('btn-reset-all').addEventListener('click', () => {
    if (confirm('Reset ALL player collections?')) resetAllCollections();
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const name = usernameInput.value.trim() || 'testuser';
    if (e.key === 'd' || e.key === 'D') queueDraw(name);
    if (e.key === 'c' || e.key === 'C') queueCollection(name);
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
  startHeartbeat(); // first, so "overlay open" shows even if the season fails to load
  await initSeason();
  await loadCollection();
  initDevPanel();
  setInterval(pollWebhookQueue, 2000);
});
