// The live pull feed window (ROADMAP 55.11, 59.8). The app sends the rows (src/home.ts mergeFeed: pulls, event rewards and Mix It Up jobs, newest first), already cut by
// the chosen filter chip (src/home.ts filterFeed), and a message per pull for the chime. Text is set with textContent; a card image is already a trusted address or empty.
const list = document.getElementById('list');
const empty = document.getElementById('empty');
const announce = document.getElementById('announce');
const chips = document.querySelector('.filters');
const EMPTY = { all: 'Waiting for the next pull...', pulls: 'No pulls yet.', events: 'No event rewards yet this session.', jobs: 'No Mix It Up jobs yet.' };
let ctx = null;
let filter = 'all';

/** A short chime; higher and longer for a rarer card. Web Audio, so no sound file is shipped. */
function chime(stars, volume) {
  try {
    ctx = ctx || new AudioContext();
    const now = ctx.currentTime;
    const notes = Math.min(5, Math.max(1, stars));
    for (let i = 0; i < notes; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 523 * Math.pow(1.26, i);
      gain.gain.setValueAtTime(0.0001, now + i * 0.11);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.4 * volume), now + i * 0.11 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.11 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.11);
      osc.stop(now + i * 0.11 + 0.32);
    }
  } catch { /* no audio device: the feed still shows */ }
}

/** A pull row: the card's image, its name, who pulled it and its rarity, variant and edition. */
function pullRow(r) {
  const p = r.pull;
  const li = document.createElement('li');
  li.className = 'pull-row ' + r.tone;
  if (p.image) {
    const img = document.createElement('img');
    img.src = p.image;
    img.alt = '';
    img.width = 44;
    img.height = 62;
    li.appendChild(img);
  }
  const body = document.createElement('div');
  body.className = 'pull-body';
  const title = document.createElement('b');
  title.textContent = p.card;
  const who = document.createElement('span');
  who.textContent = r.viewer + ' pulled it';
  const meta = document.createElement('small');
  meta.textContent = [p.rarity, p.variant && p.variant !== 'Regular' ? p.variant : '', p.serial ? 'edition #' + p.serial : ''].filter(Boolean).join(', ');
  body.append(title, who, meta);
  li.appendChild(body);
  return li;
}

function setPressed(id) {
  filter = id;
  for (const b of chips.querySelectorAll('[data-filter]')) b.setAttribute('aria-pressed', String(b.dataset.filter === id));
}

chips.addEventListener('click', e => {
  const b = e.target.closest('[data-filter]');
  if (!b) return;
  setPressed(b.dataset.filter);
  window.tools.setFilter(b.dataset.filter);
});

window.tools.onRows(msg => {
  if (!msg || !Array.isArray(msg.rows)) return;
  if (typeof msg.filter === 'string') setPressed(msg.filter);
  empty.textContent = EMPTY[filter] || EMPTY.all;
  empty.hidden = msg.rows.length > 0;
  list.hidden = msg.rows.length === 0;
  list.replaceChildren(...msg.rows.map(r => (r.kind === 'pull' && r.pull ? pullRow(r) : feedRow(r)))); // feedrow.js
});

// The chime and a spoken line for the pull that just arrived (the list itself is not a live region, since it is rebuilt on every change).
window.tools.onFeed(msg => {
  if (!msg || !msg.item) return;
  announce.textContent = `${msg.item.viewer} pulled ${msg.item.card}`;
  if (msg.play) chime(msg.item.stars, msg.volume);
});
window.tools.ready();
