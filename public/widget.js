'use strict';

// ═══════════════════════════════════════════════════════
//  CARD DATA + CONFIG  (loaded from /api/seasons/active)
// ═══════════════════════════════════════════════════════
let CARDS = [];
let CONFIG = {
  cardTime:           3,
  cooldownTime:       1,
  soundVolume:        1.0,
  holoMinStars:       5,
  maxConcurrentPacks: 1,
  collectionName:     '',
  packageImage:       'assets/pack-cover.png',
  accentColor:        'rgb(241,187,6)',
  tearBorderColor:    'rgb(218,163,18)',
};

async function initSeason() {
  try {
    const res = await fetch('/api/seasons/active');
    if (!res.ok) return;
    const { season, cards } = await res.json();
    CARDS = cards.map(c => ({
      number: c.number, name: c.name, image: c.imageUrl,
      probability: c.probability, stars: c.stars,
    }));
    CONFIG = {
      cardTime:           season.cardTime,
      cooldownTime:       season.cooldownTime,
      soundVolume:        season.soundVolume ?? 1.0,
      holoMinStars:       season.holoMinStars,
      maxConcurrentPacks: season.maxConcurrentPacks ?? 1,
      collectionName:     season.collectionName,
      packageImage:       season.coverImageUrl || 'assets/pack-cover.png',
      accentColor:        season.accentColor,
      tearBorderColor:    season.tearBorderColor,
    };
  } catch {
    // fall back to defaults if API unreachable
  }
}

// Pack-opening sound URLs
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
  try {
    const res = await fetch(`/api/collection?name=${CONFIG.collectionName}`);
    revealedCardsByUser = res.ok ? await res.json() : {};
  } catch {
    revealedCardsByUser = {};
  }
}

function saveCollection() {
  fetch(`/api/collection?name=${CONFIG.collectionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: revealedCardsByUser }),
  }).catch(() => {});
}

async function resetAllCollections() {
  revealedCardsByUser = {};
  await fetch(`/api/collection?name=${CONFIG.collectionName}`, { method: 'DELETE' }).catch(() => {});
  showAlert('🔄 All collections reset');
}

async function resetUserCollection(username) {
  const user = (username || '').toLowerCase().trim();
  if (!user) return;
  delete revealedCardsByUser[user];
  await fetch(`/api/collection?name=${CONFIG.collectionName}&username=${user}`, { method: 'DELETE' }).catch(() => {});
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
  audio.volume = volume ?? CONFIG.soundVolume;
  audio.play().catch(() => {});
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
//  BUILD MINI CARD LIST
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
//  THEATER FACTORY  — each draw gets its own DOM clone
// ═══════════════════════════════════════════════════════
function createTheater() {
  const tpl = document.getElementById('theater-tpl');
  const id  = ++drawCounter;
  const frag = tpl.content.cloneNode(true);

  // Give clipPath IDs a unique suffix so multiple SVGs don't collide
  const clips = frag.querySelectorAll('clipPath');
  if (clips[0]) clips[0].id = `tb1-clip-${id}`;
  if (clips[1]) clips[1].id = `tb2-clip-${id}`;
  frag.querySelectorAll('image').forEach((img, i) => {
    img.setAttribute('href', CONFIG.packageImage);
    img.setAttribute('clip-path', `url(#${i === 0 ? 'tb1' : 'tb2'}-clip-${id})`);
  });

  // Set pack image
  frag.querySelectorAll('.package-image').forEach(img => { img.src = CONFIG.packageImage; });

  const stage = document.getElementById('stage');
  stage.appendChild(frag);
  const wrapper = stage.lastElementChild;

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

  const theater = createTheater();
  const { wrapper, packageContainer, tearBorder1, cardBox, cardLabel,
          mainCard, holoOverlay, cardInfoOverlay, radialContainer,
          cardInfo, userText, miniList } = theater;

  const vol = CONFIG.soundVolume;

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

  const card = pickCard();

  // Card reveal sound + radial burst
  setTimeout(() => {
    playAudio(`assets/sounds/${card.number}.mp3`, vol);
    radialContainer.style.opacity   = '1';
    radialContainer.style.animation = 'spinRadial 4s linear infinite';
  }, 2800);

  // "new" label
  setTimeout(() => {
    cardLabel.style.opacity    = '1';
    cardLabel.style.visibility = 'visible';
  }, 3200);

  // User text + collection
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
    if (card.stars >= CONFIG.holoMinStars) {
      holoOverlay.classList.remove('holographic-animate');
      void holoOverlay.offsetWidth;
      holoOverlay.classList.add('holographic-animate');
    } else {
      holoOverlay.classList.remove('holographic-animate');
      holoOverlay.style.opacity = '0';
    }
  }

  buildMiniList(miniList, revealedCardsByUser[user], card.number);

  if (!revealedCardsByUser[user].includes(card.number)) {
    revealedCardsByUser[user].push(card.number);
    saveCollection();
  }

  // Hide + cleanup
  const showDuration = CONFIG.cardTime * 1000 + 4000;
  setTimeout(() => {
    radialContainer.style.opacity   = '0';
    radialContainer.style.animation = 'none';
    wrapper.classList.add('hid');
    setTimeout(() => {
      wrapper.remove();
      activeDraws--;
      setTimeout(processCardQueue, CONFIG.cooldownTime * 1000);
    }, 500);
  }, showDuration);
}

// ═══════════════════════════════════════════════════════
//  SHOW COLLECTION
// ═══════════════════════════════════════════════════════
function showCollection(username) {
  const user = (username || 'someone').toLowerCase().trim();
  if (!Array.isArray(revealedCardsByUser[user])) revealedCardsByUser[user] = [];

  const theater = createTheater();
  const { wrapper, packageContainer, cardBox, radialContainer,
          cardInfo, userText, miniList } = theater;

  // Hide pack animation parts — only show the collection panel
  packageContainer.style.display = 'none';
  cardBox.style.display          = 'none';
  radialContainer.style.display  = 'none';

  wrapper.style.visibility = 'visible';
  cardInfo.style.opacity   = '1';
  cardInfo.style.transform = 'scale(1)';
  userText.textContent     = (username || 'Someone') + "'s collection:";

  buildMiniList(miniList, revealedCardsByUser[user], null);

  if (collectionTimeout) clearTimeout(collectionTimeout);
  collectionTimeout = setTimeout(() => {
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
  while (cardQueue.length > 0 && activeDraws < CONFIG.maxConcurrentPacks) {
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
document.addEventListener('DOMContentLoaded', async () => {
  await initSeason();
  await loadCollection();
  document.documentElement.style.setProperty('--tear-color', CONFIG.tearBorderColor);
  initDevPanel();
});
