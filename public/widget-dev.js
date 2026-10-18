// Test panel (?dev) for the OBS overlay. A classic script sharing widget.js globals;
// overlay.html loads it only when the URL has ?dev, before widget.js runs.

async function resetAllCollections() {
  revealedCardsByUser = {};
  await fetch(`/api/collection?name=${SEASON_CFG.collectionName}`, { method: 'DELETE' }).catch(() => {});
  showAlert('All collections reset');
}

async function resetUserCollection(username) {
  const user = (username || '').toLowerCase().trim();
  if (!user) return;
  delete revealedCardsByUser[user];
  await fetch(`/api/collection?name=${SEASON_CFG.collectionName}&username=${user}`, { method: 'DELETE' }).catch(() => {});
  showAlert('Reset collection for ' + user);
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
  const momentSel = $('dev-moment');
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
  PACKS.forEach(p => addOption(packSel, p.pack.id, p.pack.name + (p.pack.upgradesEnabled ? '  (variants)' : '')));

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
      info.textContent = 'Forced ' + VARIANT_LABELS[variantSel.value] + (upg.length === 0 ? ' (this pack has upgrades off, shown anyway)' : '');
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
    moment: momentSel && momentSel.value ? momentSel.value : null,
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

  // The chat "show off" plays: the picked card (random if none) in the picked version, with a sample serial.
  function showOff() {
    const source = packSel.value ? PACKS.filter(p => p.pack.id === packSel.value) : PACKS;
    const cards = source.flatMap(p => p.cards);
    if (!cards.length) return;
    const cardNumber = cardSel.value ? Number(cardSel.value) : cards[Math.floor(Math.random() * cards.length)].number;
    const n = 1 + Math.floor(Math.random() * 30);
    queueShowCard(user(), { cardNumber, variant: variantSel.value || 'regular', serial: n, serialMult: n <= 20 ? 1 + 2 * (1 - (n - 1) / 20) : 1, uid: 1000000 + 1 + Math.floor(Math.random() * 90000) });
  }

  $('btn-show-card').addEventListener('click', showOff);
  $('btn-first-ever').addEventListener('click', () => queueDraw(user(), options({ sampleSerial: 1 })));
  $('btn-draw').addEventListener('click', () => draw(Number(countInput.value)));
  $('btn-all-variants').addEventListener('click', drawAllVariants);
  $('btn-collection').addEventListener('click', () => queueCollection(user(), { dry: DEV.dry }));
  $('btn-clear-queue').addEventListener('click', () => { cardQueue.length = 0; });
  $('btn-reset-user').addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (!name) { showAlert('Enter a username to reset'); return; }
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
    else if (key === 'w') showOff();
    else if (key === '1') queueDraw(user(), options({ sampleSerial: 1 }));
    else if ({ r: 'reverse', f: 'full', s: 'shiny' }[key]) queueDraw(user(), options({ variant: { r: 'reverse', f: 'full', s: 'shiny' }[key] }));
  });
}
