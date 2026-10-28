// The Preview overlay window (ROADMAP 57.10). Shows the site's overlay page at the OBS canvas size, scaled to fit. The page has a read-only key of its own and
// never takes a real pull; the buttons use the staff test pull and show-card paths, which also play on the live overlay.
const $ = id => document.getElementById(id);
const frame = $('frame'), stage = $('stage'), msg = $('msg');
let canvas = { width: 1920, height: 1080 };
let force = false;

const say = (text, bad) => { msg.textContent = text || ''; msg.className = bad ? 'result fail' : 'result'; };

function fit() {
  const r = stage.getBoundingClientRect();
  const k = Math.min(r.width / canvas.width, r.height / canvas.height) || 1;
  frame.style.width = canvas.width + 'px';
  frame.style.height = canvas.height + 'px';
  frame.style.transform = `scale(${k})`;
  $('size').textContent = `${canvas.width} x ${canvas.height}, shown at ${Math.round(k * 100)}%`;
}

async function load() {
  say('Loading the preview...');
  const r = await window.preview.data();
  if (!r.ok || !r.data) { say(r.text || 'Could not open the preview.', true); return; }
  canvas = { width: Number(r.data.width) || 1920, height: Number(r.data.height) || 1080 };
  frame.src = String(r.data.src);
  fit();
  say('');
}

async function users() {
  const r = await window.preview.run({ op: 'users' });
  const list = r.ok && r.data && Array.isArray(r.data.users) ? r.data.users.slice(0, 500) : [];
  $('viewers').replaceChildren(...list.map(u => { const o = document.createElement('option'); o.value = String(u); return o; }));
}

async function go(button, body) {
  button.disabled = true;
  try {
    const r = await window.preview.run({ op: 'do', ...body });
    force = !r.ok && !!(r.data && r.data.needsForce);
    $('force').hidden = !force;
    say(force ? `${r.text} Press "Queue it anyway" to play it.` : r.text, !r.ok);
  } finally { button.disabled = false; }
}

$('test-pull').addEventListener('click', () => go($('test-pull'), { action: 'test-pull' }));
$('force').addEventListener('click', () => { $('force').hidden = true; return go($('force'), { action: 'test-pull', force: true }); });
$('show-card').addEventListener('click', () => {
  const name = $('viewer').value.trim();
  if (!name) { say('Type a viewer name first.', true); return; }
  return go($('show-card'), { action: 'show-card', username: name });
});
$('reload').addEventListener('click', () => { void load(); });
window.addEventListener('resize', fit);

void load();
void users();
