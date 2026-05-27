'use strict';

// ═══════════════════════════════════════════════════════
//  CARD DATA  (Season 1 — 25 cards)
// ═══════════════════════════════════════════════════════
const CARDS = [
  { number:  1, name: 'Cheesygidds',  image: '../Old/Season 1 Assets/GIF/Cheesygidds.gif',   probability:  3, stars: 5 },
  { number:  2, name: 'Dinogidds',    image: '../Old/Season 1 Assets/GIF/Dinogidds.gif',     probability:  4, stars: 5 },
  { number:  3, name: 'Onesiegidds',  image: '../Old/Season 1 Assets/GIF/Onesiegidds.gif',   probability:  5, stars: 5 },
  { number:  4, name: 'Creamygidds',  image: '../Old/Season 1 Assets/GIF/Creamygidds.gif',   probability:  7, stars: 4 },
  { number:  5, name: 'Wheezygidds',  image: '../Old/Season 1 Assets/GIF/Wheezygidds.gif',   probability:  9, stars: 4 },
  { number:  6, name: 'Suitygidds',   image: '../Old/Season 1 Assets/GIF/Suitygidds.gif',    probability:  7, stars: 4 },
  { number:  7, name: 'Cringygidds',  image: '../Old/Season 1 Assets/GIF/Cringygidds.gif',   probability:  7, stars: 4 },
  { number:  8, name: 'Mysterygidds', image: '../Old/Season 1 Assets/GIF/Mysterygidds.gif',  probability:  8, stars: 4 },
  { number:  9, name: 'Bottomygidds', image: '../Old/Season 1 Assets/GIF/Bottomgidds.gif',   probability: 15, stars: 3 },
  { number: 10, name: 'Goatlygidds',  image: '../Old/Season 1 Assets/GIF/Goatlygidds.gif',   probability: 25, stars: 3 },
  { number: 11, name: 'Pokegidds',    image: '../Old/Season 1 Assets/GIF/PokegiddsV2.gif',   probability: 25, stars: 3 },
  { number: 12, name: 'UWUgidds',     image: '../Old/Season 1 Assets/GIF/UWUgidds.gif',      probability: 11, stars: 3 },
  { number: 13, name: 'Scaredygidds', image: '../Old/Season 1 Assets/GIF/Scaredygidds.gif',  probability: 17, stars: 3 },
  { number: 14, name: 'Angrygidds',   image: '../Old/Season 1 Assets/GIF/Angrygidds.gif',    probability: 16, stars: 3 },
  { number: 15, name: 'Sweatygidds',  image: '../Old/Season 1 Assets/GIF/Sweatygidds.gif',   probability: 20, stars: 2 },
  { number: 16, name: 'Comedygidds',  image: '../Old/Season 1 Assets/GIF/Comedygidds.gif',   probability: 75, stars: 2 },
  { number: 17, name: 'Glitchygidds', image: '../Old/Season 1 Assets/GIF/Glitchygidds.gif',  probability: 60, stars: 2 },
  { number: 18, name: 'Inkygidds',    image: '../Old/Season 1 Assets/GIF/Inkygidds.gif',     probability: 50, stars: 2 },
  { number: 19, name: 'Drinkygidds',  image: '../Old/Season 1 Assets/GIF/Drinkygidds.gif',   probability: 53, stars: 2 },
  { number: 20, name: 'Sillygidds',   image: '../Old/Season 1 Assets/GIF/Sillygidds.gif',    probability: 67, stars: 2 },
  { number: 21, name: 'Victorygidds', image: '../Old/Season 1 Assets/GIF/Victorygidds.gif',  probability: 82, stars: 1 },
  { number: 22, name: 'Gassygidds',   image: '../Old/Season 1 Assets/GIF/Gassygidds.gif',    probability: 90, stars: 1 },
  { number: 23, name: 'Crunchygidds', image: '../Old/Season 1 Assets/GIF/Cronchygidds.gif',  probability: 87, stars: 1 },
  { number: 24, name: 'Waxygidds',    image: '../Old/Season 1 Assets/GIF/Waxygidds.gif',     probability: 71, stars: 1 },
  { number: 25, name: 'Gaspygidds',   image: '../Old/Season 1 Assets/GIF/GaspygiddsV2.gif',  probability: 84, stars: 1 },
];

// ═══════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════
const CONFIG = {
  cardTime:        3,     // seconds card stays on screen after fully revealed
  cooldownTime:    1,     // seconds cooldown between queued draws
  soundVolume:     1.0,   // 0–1
  holoMinStars:    5,     // cards with this many stars or more get the holo effect
  collectionName:  'CheesyStarterDeck',
  packageImage:    '../Old/Season 1 Assets/Cheesy Starter Deck Cover.png',
  accentColor:     'rgb(241,187,6)',
  tearBorderColor: 'rgb(218,163,18)',  // match the pack wrapper edge color
};

// Pack-opening sound URLs (from freesound.org, same as the original widget)
const PACK_SOUNDS = [
  { src: 'https://cdn.freesound.org/previews/186/186719_105499-lq.mp3', delay:    0 },
  { src: 'https://cdn.freesound.org/previews/787/787409_12262933-lq.mp3', delay:  450 },
  { src: 'https://cdn.freesound.org/previews/787/787405_12262933-lq.mp3', delay: 1410 },
];
// Card-specific sound: '../Old/Season 1 Assets/Sounds/{cardNumber}.mp3' plays at 2800ms

// ═══════════════════════════════════════════════════════
//  STAR SVG  (repeated per star rating)
// ═══════════════════════════════════════════════════════
const STAR_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right:2px;"><path d="M9.15316 5.40838C10.4198 3.13613 11.0531 2 12 2C12.9469 2 13.5802 3.13612 14.8468 5.40837L15.1745 5.99623C15.5345 6.64193 15.7144 6.96479 15.9951 7.17781C16.2757 7.39083 16.6251 7.4699 17.3241 7.62805L17.9605 7.77203C20.4201 8.32856 21.65 8.60682 21.9426 9.54773C22.2352 10.4886 21.3968 11.4691 19.7199 13.4299L19.2861 13.9372C18.8096 14.4944 18.5713 14.773 18.4641 15.1177C18.357 15.4624 18.393 15.8341 18.465 16.5776L18.5306 17.2544C18.7841 19.8706 18.9109 21.1787 18.1449 21.7602C17.3788 22.3417 16.2273 21.8115 13.9243 20.7512L13.3285 20.4768C12.6741 20.1755 12.3469 20.0248 12 20.0248C11.6531 20.0248 11.3259 20.1755 10.6715 20.4768L10.0757 20.7512C7.77268 21.8115 6.62118 22.3417 5.85515 21.7602C5.08912 21.1787 5.21588 19.8706 5.4694 17.2544L5.53498 16.5776C5.60703 15.8341 5.64305 15.4624 5.53586 15.1177C5.42868 14.773 5.19043 14.4944 4.71392 13.9372L4.2801 13.4299C2.60325 11.4691 1.76482 10.4886 2.05742 9.54773C2.35002 8.60682 3.57986 8.32856 6.03954 7.77203L6.67589 7.62805C7.37485 7.4699 7.72433 7.39083 8.00494 7.17781C8.28555 6.96479 8.46553 6.64194 8.82547 5.99623L9.15316 5.40838Z" fill="rgb(241,187,6)"></path></svg>`;

// ═══════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════
let cardDrawing = false;
let cardQueue   = [];
let revealedCardsByUser = {};
let collectionTimeout   = null;

// ═══════════════════════════════════════════════════════
//  STORAGE  (localStorage replaces SE_API.store)
// ═══════════════════════════════════════════════════════
function loadCollection() {
  try {
    const raw = localStorage.getItem('tcg_' + CONFIG.collectionName);
    revealedCardsByUser = raw ? JSON.parse(raw) : {};
  } catch {
    revealedCardsByUser = {};
  }
}

function saveCollection() {
  localStorage.setItem('tcg_' + CONFIG.collectionName, JSON.stringify(revealedCardsByUser));
}

function resetAllCollections() {
  revealedCardsByUser = {};
  localStorage.removeItem('tcg_' + CONFIG.collectionName);
  showAlert('🔄 All collections reset');
}

function resetUserCollection(username) {
  const user = (username || '').toLowerCase().trim();
  if (!user) return;
  delete revealedCardsByUser[user];
  saveCollection();
  showAlert('🔄 Reset collection for ' + user);
}

// ═══════════════════════════════════════════════════════
//  AUDIO
// ═══════════════════════════════════════════════════════
function playAudio(src, volume) {
  const audio = new Audio(src);
  audio.volume = volume ?? CONFIG.soundVolume;
  audio.play().catch(() => {});
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
//  WEIGHTED RANDOM CARD SELECTION
// ═══════════════════════════════════════════════════════
function pickCard() {
  const total = CARDS.reduce((sum, c) => sum + c.probability, 0);
  let rand = Math.random() * total;
  for (const card of CARDS) {
    rand -= card.probability;
    if (rand <= 0) return card;
  }
  return CARDS[CARDS.length - 1];
}

// ═══════════════════════════════════════════════════════
//  BUILD MINI CARD LIST  (shared by drawCard + showCollection)
// ═══════════════════════════════════════════════════════
function buildMiniList(miniList, userCards, highlightNumber) {
  miniList.innerHTML = '';
  for (const card of CARDS) {
    const div = document.createElement('div');
    div.classList.add('mini-card');
    div.style.position = 'relative';

    const owned   = userCards.includes(card.number);
    const showImg = (owned || card.number === highlightNumber) && card.image;

    if (showImg) {
      div.style.backgroundImage    = `url('${card.image}')`;
      div.style.backgroundSize     = 'cover';
      div.style.backgroundPosition = 'center';
      div.style.backgroundRepeat   = 'no-repeat';
      div.style.backgroundColor    = CONFIG.accentColor;
      div.style.border             = '3px solid white';
    } else {
      const q = document.createElement('span');
      q.classList.add('mini-question');
      q.textContent = '?';
      div.appendChild(q);
    }
    miniList.appendChild(div);
  }
}

// ═══════════════════════════════════════════════════════
//  DRAW CARD  (main animation sequence)
// ═══════════════════════════════════════════════════════
function drawCard(username) {
  const user = (username || 'someone').toLowerCase().trim();
  if (!Array.isArray(revealedCardsByUser[user])) revealedCardsByUser[user] = [];

  const vol = CONFIG.soundVolume;

  // Pack opening sounds
  for (const s of PACK_SOUNDS) {
    setTimeout(() => playAudio(s.src, vol), s.delay);
  }

  // DOM refs
  const wrapper          = document.querySelector('.card-wrapper');
  const packageContainer = wrapper.querySelector('.package-container');
  const tearBorder1      = wrapper.querySelector('.tear-border-1');
  const cardBox          = wrapper.querySelector('.card-box');
  const cardLabel        = wrapper.querySelector('.card-label');
  const mainCard         = wrapper.querySelector('.main-card');
  const holoOverlay      = wrapper.querySelector('.holographic-overlay');
  const cardInfoOverlay  = wrapper.querySelector('.card-info-overlay');
  const radialContainer  = wrapper.querySelector('.radial-container');
  const cardInfo         = wrapper.querySelector('.card-info');
  const userText         = wrapper.querySelector('.user-text');
  const miniList         = wrapper.querySelector('.card-mini-list');

  // Reset all opacities / visibility
  packageContainer.style.opacity   = '0';
  cardBox.style.opacity             = '0';
  cardLabel.style.opacity           = '0';
  cardLabel.style.visibility        = 'hidden';
  cardInfo.style.opacity            = '0';
  cardInfo.style.transform          = 'scale(0)';
  radialContainer.style.opacity     = '0';
  radialContainer.style.animation   = 'none';
  wrapper.style.visibility          = 'visible';
  wrapper.classList.remove('hid');
  wrapper.classList.remove('hidden');

  // ── Animations ──
  // Package flies in then drops away (4.5s)
  packageContainer.style.animation = 'none';
  void packageContainer.offsetWidth;
  packageContainer.style.animation = 'fadeScaleIn 4.5s ease';

  // Tear border rips off (4.5s)
  tearBorder1.style.animation = 'none';
  void tearBorder1.offsetWidth;
  tearBorder1.style.animation = 'tearBorderIn 4.5s';

  // Card box slides into place (7.5s)
  cardBox.style.animation = 'none';
  void cardBox.offsetWidth;
  cardBox.style.animation = 'cardBoxIn 7.5s ease forwards';

  // ── Pick the card ──
  const card = pickCard();

  // ── Card-specific reveal sound + radial burst at 2800ms ──
  setTimeout(() => {
    playAudio(`../Old/Season 1 Assets/Sounds/${card.number}.mp3`, vol);
    radialContainer.style.opacity   = '1';
    radialContainer.style.animation = 'spinRadial 4s linear infinite';
  }, 2800);

  // ── Card label "new" fades in at 3200ms ──
  setTimeout(() => {
    cardLabel.style.opacity    = '1';
    cardLabel.style.visibility = 'visible';
  }, 3200);

  // ── User text + mini collection fades in at 3000ms ──
  setTimeout(() => {
    cardInfo.style.opacity   = '1';
    cardInfo.style.transform = 'scale(1)';
    userText.textContent     = (username || 'Someone') + ' got:';
  }, 3000);

  // ── Set card image ──
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

  // ── Card number display (top-left / bottom-right) ──
  const num1 = mainCard.querySelector('.card-number-1 > span:first-child');
  const num2 = mainCard.querySelector('.card-number-2 > span:first-child');
  if (num1) num1.textContent = card.number;
  if (num2) num2.textContent = card.number;

  // ── Card name + stars ──
  const nameEl  = cardInfoOverlay.querySelector('.card-name');
  const starsEl = cardInfoOverlay.querySelector('.card-stars');
  if (nameEl)  nameEl.textContent = card.name;
  if (starsEl) starsEl.innerHTML  = STAR_SVG.repeat(card.stars);

  // ── Holographic effect for high-rarity cards ──
  if (holoOverlay) {
    if (card.stars >= CONFIG.holoMinStars) {
      holoOverlay.classList.remove('holographic-animate');
      void holoOverlay.offsetWidth;
      holoOverlay.classList.add('holographic-animate');
    } else {
      holoOverlay.classList.remove('holographic-animate');
      holoOverlay.style.opacity = '0';
    }
  }

  // ── Build mini card list (shows whole collection, highlights new card) ──
  buildMiniList(miniList, revealedCardsByUser[user], card.number);

  // ── Save to collection (only if first time getting this card) ──
  if (!revealedCardsByUser[user].includes(card.number)) {
    revealedCardsByUser[user].push(card.number);
    saveCollection();
  }

  // ── Hide wrapper after display time ──
  const showDuration = CONFIG.cardTime * 1000 + 4000;
  setTimeout(() => {
    wrapper.classList.add('hid');
    setTimeout(() => { wrapper.style.visibility = 'hidden'; }, 500);
  }, showDuration);
}

// ═══════════════════════════════════════════════════════
//  SHOW COLLECTION  (no pack animation, just the mini grid)
// ═══════════════════════════════════════════════════════
function showCollection(username) {
  const user = (username || 'someone').toLowerCase().trim();
  if (!Array.isArray(revealedCardsByUser[user])) revealedCardsByUser[user] = [];

  const wrapper          = document.querySelector('.card-wrapper');
  const packageContainer = wrapper.querySelector('.package-container');
  const cardBox          = wrapper.querySelector('.card-box');
  const cardInfo         = wrapper.querySelector('.card-info');
  const userText         = wrapper.querySelector('.user-text');
  const miniList         = wrapper.querySelector('.card-mini-list');

  // Hide the pack + card art; only show the collection grid
  cardBox.style.visibility          = 'hidden';
  packageContainer.style.visibility = 'hidden';

  wrapper.style.visibility = 'visible';
  wrapper.classList.remove('hid');
  wrapper.classList.remove('hidden');

  // Show collection section
  cardInfo.style.opacity   = '1';
  cardInfo.style.transform = 'scale(1)';
  userText.textContent     = (username || 'Someone') + "'s collection:";

  buildMiniList(miniList, revealedCardsByUser[user], null);

  // Restore card-box/package visibility after hide (cleanup for next draw)
  setTimeout(() => {
    cardBox.style.visibility          = 'visible';
    packageContainer.style.visibility = 'visible';
  }, 5000);

  // Auto-hide after 4 seconds
  if (collectionTimeout) clearTimeout(collectionTimeout);
  collectionTimeout = setTimeout(() => {
    wrapper.classList.add('hid');
    setTimeout(() => { wrapper.style.visibility = 'hidden'; }, 500);
  }, 4000);
}

// ═══════════════════════════════════════════════════════
//  QUEUE PROCESSING
// ═══════════════════════════════════════════════════════
function processCardQueue() {
  if (cardQueue.length === 0) {
    cardDrawing = false;
    return;
  }
  cardDrawing = true;
  const fn = cardQueue.shift();
  fn();
  const nextDelay = CONFIG.cooldownTime * 1000 + CONFIG.cardTime * 1000 + 4000;
  setTimeout(processCardQueue, nextDelay);
}

// ═══════════════════════════════════════════════════════
//  PUBLIC API  (call these from chat bots, hotkeys, etc.)
// ═══════════════════════════════════════════════════════
function queueDraw(username) {
  cardQueue.push(() => drawCard(username));
  if (!cardDrawing) processCardQueue();
}

function queueCollection(username) {
  cardQueue.push(() => showCollection(username));
  if (!cardDrawing) processCardQueue();
}

// ═══════════════════════════════════════════════════════
//  DEV / TEST PANEL
// ═══════════════════════════════════════════════════════
function initDevPanel() {
  const panel = document.getElementById('dev-panel');
  if (!panel) return;

  // Show only when ?dev is in the URL
  const params = new URLSearchParams(window.location.search);
  if (!params.has('dev')) {
    panel.classList.add('hidden');
    return;
  }

  const usernameInput = document.getElementById('dev-username');

  document.getElementById('btn-draw').addEventListener('click', () => {
    const name = usernameInput.value.trim() || 'testuser';
    queueDraw(name);
  });

  document.getElementById('btn-collection').addEventListener('click', () => {
    const name = usernameInput.value.trim() || 'testuser';
    queueCollection(name);
  });

  document.getElementById('btn-reset-user').addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (!name) { showAlert('⚠️ Enter a username to reset'); return; }
    resetUserCollection(name);
  });

  document.getElementById('btn-reset-all').addEventListener('click', () => {
    if (confirm('Reset ALL player collections?')) resetAllCollections();
  });

  // Keyboard shortcuts (only active in dev mode)
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
document.addEventListener('DOMContentLoaded', () => {
  loadCollection();

  const packageImg = document.getElementById('package-image');
  if (packageImg) packageImg.src = CONFIG.packageImage;

  // Sync tear border image textures with the package image
  document.querySelectorAll('#tb1-clip, #tb2-clip').forEach(clip => {
    const img = clip.closest('svg').querySelector('image');
    if (img) img.setAttribute('href', CONFIG.packageImage);
  });

  // Apply CSS custom properties from config
  document.documentElement.style.setProperty('--tear-color', CONFIG.tearBorderColor);

  initDevPanel();
});
