// The live pull feed window (ROADMAP 55.11). Each message is already cleaned by the app: the image is a trusted address or empty.
const list = document.getElementById('list');
const empty = document.getElementById('empty');
const MAX = 40;
let ctx = null;

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

function row(item) {
  const li = document.createElement('li');
  li.className = 'pull stars-' + item.stars;
  if (item.image) {
    const img = document.createElement('img');
    img.src = item.image;
    img.alt = '';
    img.width = 44;
    img.height = 62;
    li.appendChild(img);
  }
  const body = document.createElement('div');
  const title = document.createElement('b');
  title.textContent = item.card;
  const who = document.createElement('span');
  who.textContent = item.viewer + ' pulled it';
  const meta = document.createElement('small');
  meta.textContent = [item.rarity, item.variant && item.variant !== 'Regular' ? item.variant : '', item.serial ? 'edition #' + item.serial : ''].filter(Boolean).join(', ');
  body.append(title, who, meta);
  li.appendChild(body);
  return li;
}

window.tools.onFeed(msg => {
  if (!msg || !msg.item) return;
  empty.hidden = true;
  list.prepend(row(msg.item));
  while (list.children.length > MAX) list.lastChild.remove();
  if (msg.play) chime(msg.item.stars, msg.volume);
});
window.tools.ready();
