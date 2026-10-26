// Trading inside the Twitch panel: offers for you, your open offers, the open board, recent results and a small composer.
// A classic script loaded after panel.js, so it shares its globals (auth, season, collections, el, cardStatus, ...).
// Everything goes through /api/twitch/trades (signed Extension JWT), which uses the same engine as the website.

let tradesData = null;      // last GET /api/twitch/trades
let tradesLoadedAt = 0;
let tradesError = '';
let composer = null;        // { to, note, give: {key: n}, giveIds: {key: [edition ids]}, get: {key: n}, wantVar: {number: variant}, filter, busy, msg } while composing
const SHORT = { regular: '', reverse: 'RH', full: 'FA', shiny: 'FH', golden: 'GD' };
const tkey = (number, variant) => number + '|' + variant;

function tradeCardMap() {
  const m = new Map();
  if (season) season.packs.forEach(pack => pack.cards.forEach(c => m.set(c.number, c)));
  return m;
}
const timeLeftText = ms => {
  const left = ms - Date.now();
  if (left <= 0) return 'expired';
  const h = Math.floor(left / 3600000);
  return h >= 24 ? Math.floor(h / 24) + 'd left' : h >= 1 ? h + 'h left' : Math.max(1, Math.floor(left / 60000)) + 'm left';
};

function resetTrades() { tradesData = null; tradesLoadedAt = 0; tradesError = ''; composer = null; }

// Listings that match the viewer's Looking for list or saved alerts light the Trades dot until the tab has been opened (remembered per
// device, only the newest ids). Offers waiting for them always count.
const SEEN_KEY = 'tcg_panel_seen_alerts';
function seenAlerts() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; } }
function markAlertsSeen() {
  if (!tradesData) return;
  const ids = tradesData.board.filter(t => t.alert).map(t => t.id);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(0, 60))); } catch { /* storage unavailable */ }
  updateTradesDot();
}
function updateTradesDot() {
  const dot = document.getElementById('trades-dot');
  if (!dot) return;
  const seen = seenAlerts();
  const fresh = tradesData ? tradesData.board.filter(t => t.alert && seen.indexOf(t.id) === -1).length : 0;
  const waiting = tradesData ? tradesData.incoming.length : (me && me.offers) || 0;
  dot.classList.toggle('hidden', waiting + fresh === 0);
  dot.title = fresh > 0 && waiting === 0 ? 'A card you are looking for was listed' : 'Trade offers are waiting';
}

async function loadTrades(force) {
  if (!auth || !auth.token || !currentUsername) return;
  if (!force && tradesData && Date.now() - tradesLoadedAt < 30000) { renderTrades(); return; }
  try {
    const res = await fetch(api('/api/twitch/trades'), { headers: { Authorization: 'Bearer ' + auth.token } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { tradesError = body.error || 'Could not load trades (' + res.status + ')'; }
    else { tradesData = body; tradesError = ''; tradesLoadedAt = Date.now(); }
  } catch {
    tradesError = 'Could not reach the server';
  }
  if (currentView === 'trades') { renderTrades(); markAlertsSeen(); } else updateTradesDot();
}

async function tradeRequest(payload) {
  try {
    const res = await fetch(api('/api/twitch/trades'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth.token },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, body } : { ok: false, error: body.error || 'That did not work (' + res.status + ')' };
  } catch {
    return { ok: false, error: 'Could not reach the server' };
  }
}

// The viewer's own editions of one card + version ({ id, n, uid? }, from GET /api/twitch/trades `prints`; empty until editions are numbered).
const printsFor = (cardNumber, variant) => (tradesData && tradesData.prints && tradesData.prints[entryOf(cardNumber, variant)]) || [];
// A copy id is "<card>.<version>.<edition number>". `ids` on a stack names the exact editions that move.
const editionNo = id => String(id).split('.')[2];
const editionText = ids => (ids.length === 1 ? 'Edition #' : 'Editions #') + ids.map(editionNo).join(', #');
const newestIds = (list, n) => list.slice().sort((a, b) => b.n - a.n).slice(0, n).map(p => p.id);

// ── Pieces ────────────────────────────────────────────────
function stackChips(items, cards) {
  const wrap = el('div', 'tr-chips');
  items.forEach(i => {
    const card = cards.get(i.cardNumber);
    const chip = el('span', 'tr-chip');
    const thumb = el('span', 'tr-thumb');
    if (card && (card.thumbUrl || card.imageUrl)) { const img = el('img'); img.src = card.thumbUrl || card.imageUrl; img.alt = ''; thumb.appendChild(img); }
    chip.append(thumb, el('span', 'tr-chip-text', i.count + '× ' + (card ? card.name : '#' + i.cardNumber) + (SHORT[i.variant] ? ' (' + SHORT[i.variant] + ')' : '') + (i.ids && i.ids.length ? ' · ' + editionText(i.ids) : '')));
    wrap.appendChild(chip);
  });
  return wrap;
}

// Tick exactly `count` of the viewer's editions of one card + version (same rules as the website's picker: another tick when full drops the
// oldest one). `selected` is the list of ids now ticked; onChange gets the new list.
function editionPicker(list, count, selected, onChange, giving) {
  const box = el('div', 'tr-eds');
  const head = el('div', 'tr-eds-head');
  const newest = el('button', 'tr-link', 'Use the newest');
  newest.type = 'button';
  newest.addEventListener('click', () => onChange(newestIds(list, count)));
  head.append(el('span', 'tr-hint', 'Tick ' + (count === 1 ? 'one edition' : count + ' editions') + ' (' + selected.length + '/' + count + ')'), newest);
  const chips = el('div', 'tr-chips');
  list.slice().sort((a, b) => b.n - a.n).forEach(p => {
    const on = selected.indexOf(p.id) !== -1;
    const m = serialMult(p.n);
    const b = el('button', 'tr-ed' + (on ? ' on' : '') + (m > 1 ? ' bonus' : ''), '#' + p.n + (m > 1 ? ' ×' + m.toFixed(2) : ''));
    b.type = 'button';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = (p.uid ? 'Serial #' + p.uid + ', ' : '') + 'Edition #' + p.n;
    b.addEventListener('click', () => {
      if (on) { if (selected.length > 1) onChange(selected.filter(x => x !== p.id)); return; }
      onChange(selected.length >= count ? selected.slice(1).concat(p.id) : selected.concat(p.id));
    });
    chips.appendChild(b);
  });
  box.append(head, chips);
  const ticked = list.filter(p => selected.indexOf(p.id) !== -1);
  if (giving && ticked.some(p => p.n === 1 || serialMult(p.n) > 1)) {
    box.appendChild(el('p', 'tr-hint tr-warn', ticked.some(p => p.n === 1) ? 'You are giving away Edition #1, the first edition ever made.' : 'One of these editions earns an edition bonus. The points go with it.'));
  }
  return box;
}

function tradeLink(id) {
  const a = el('a', 'tr-link', 'Open on the site');
  a.href = siteUrl('/trade/' + encodeURIComponent(id));
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

// A button that needs a second tap to go ahead (a trade cannot be undone).
function confirmButton(label, className, run) {
  const b = el('button', className, label);
  b.type = 'button';
  let armed = false, timer = null;
  b.addEventListener('click', async () => {
    if (!armed) {
      armed = true; b.textContent = 'Sure?'; b.classList.add('armed');
      timer = setTimeout(() => { armed = false; b.textContent = label; b.classList.remove('armed'); }, 3000);
      return;
    }
    clearTimeout(timer);
    b.disabled = true; b.textContent = '…';
    await run();
  });
  return b;
}

async function answerTrade(action, id, doneText, getIds) {
  const r = await tradeRequest(getIds ? { action, id, getIds } : { action, id });
  showToast(r.ok ? doneText : r.error);
  await loadTrades(true);
  if (r.ok && action !== 'decline') { skipNextToast = action === 'accept'; refreshData(false); loadMe(true); }
}

function tradeRow(t, mode, cards) {
  const row = el('div', 'tr-row');
  const head = el('div', 'tr-head');
  const title = mode === 'incoming' ? '@' + t.from + (t.counter ? ' countered' : ' offers you')
    : mode === 'board' ? 'Listing by @' + t.from
    : t.kind === 'direct' ? 'Offer to @' + t.to : 'Your listing on the board';
  head.append(el('span', 'tr-who', title), el('span', 'tr-time', timeLeftText(t.expiresAt)));
  row.appendChild(head);
  if (mode === 'board' && t.alert) row.appendChild(el('span', 'tr-alert', 'On your list'));

  const mineOut = mode === 'outgoing';
  const getItems = mineOut ? t.get : t.give;   // what the viewer receives
  const giveItems = mineOut ? t.give : t.get;  // what the viewer hands over
  const getPts = mineOut ? t.getPts : t.givePts, givePts = mineOut ? t.givePts : t.getPts;
  const side = (label, items, pts) => {
    const s = el('div', 'tr-side');
    s.append(el('span', 'tr-label', label + ' · ' + fmtNum(pts) + ' pts'), stackChips(items, cards));
    return s;
  };
  row.append(side('You get', getItems, getPts), side('You give', giveItems, givePts));
  if (t.note) row.appendChild(el('p', 'tr-note', '“' + t.note + '”'));

  const actions = el('div', 'tr-actions');
  if (mode === 'outgoing') {
    actions.appendChild(confirmButton('Cancel offer', 'tr-btn ghost', () => answerTrade('cancel', t.id, 'Offer cancelled. Your cards are back.')));
  } else {
    if (t.canTake && tradesData.enabled) {
      const label = mode === 'board' ? 'Take trade' : 'Accept';
      // Asked-for cards the viewer holds spare editions of: they choose which ones go (the newest by default), like on the website.
      const need = giveItems.filter(i => !i.ids && printsFor(i.cardNumber, i.variant).length > i.count);
      if (need.length === 0) {
        actions.appendChild(confirmButton(label, 'tr-btn', () => answerTrade('accept', t.id, 'Trade done! Check your collection.')));
      } else {
        const pick = el('button', 'tr-btn', label);
        pick.type = 'button';
        pick.addEventListener('click', () => chooseEditions(row, actions, t, need, label, cards));
        actions.appendChild(pick);
      }
    } else {
      actions.appendChild(el('span', 'tr-hint', !tradesData.enabled ? tradesData.closedReason : 'You do not have the cards asked for.'));
    }
    if (mode === 'incoming') {
      const counter = el('button', 'tr-btn ghost', 'Counter');
      counter.type = 'button';
      counter.disabled = !tradesData.enabled;
      counter.addEventListener('click', () => startCounter(t));
      actions.append(counter, confirmButton('Decline', 'tr-btn ghost', () => answerTrade('decline', t.id, 'Offer declined.')));
    }
  }
  actions.appendChild(tradeLink(t.id));
  row.appendChild(actions);
  return row;
}

// The accept picker: swaps the Accept button for a tick list per asked-for card, then arms the usual "Sure?" with the chosen editions.
function chooseEditions(row, actions, t, need, label, cards) {
  const sel = {};
  need.forEach(i => { sel[entryOf(i.cardNumber, i.variant)] = newestIds(printsFor(i.cardNumber, i.variant), i.count); });
  const box = el('div', 'tr-pickbox');
  actions.classList.add('hidden');
  row.insertBefore(box, actions);
  const draw = () => {
    box.innerHTML = '';
    box.appendChild(el('span', 'tr-label', 'Choose which editions you hand over'));
    need.forEach(i => {
      const k = entryOf(i.cardNumber, i.variant);
      const card = cards.get(i.cardNumber);
      box.append(
        el('span', 'tr-hint', (card ? card.name : '#' + i.cardNumber) + (SHORT[i.variant] ? ' (' + SHORT[i.variant] + ')' : '') + (i.count > 1 ? ' ×' + i.count : '')),
        editionPicker(printsFor(i.cardNumber, i.variant), i.count, sel[k], ids => { sel[k] = ids; draw(); }, true),
      );
    });
    const back = el('button', 'tr-btn ghost', 'Back');
    back.type = 'button';
    back.addEventListener('click', () => { box.remove(); actions.classList.remove('hidden'); });
    const use = el('button', 'tr-btn', 'Use these editions');
    use.type = 'button';
    use.disabled = need.some(i => sel[entryOf(i.cardNumber, i.variant)].length !== i.count);
    use.addEventListener('click', () => {
      const getIds = {};
      need.forEach(i => { getIds[entryOf(i.cardNumber, i.variant)] = sel[entryOf(i.cardNumber, i.variant)]; });
      box.innerHTML = '';
      box.append(el('span', 'tr-label', 'You hand over'), stackChips(need.map(i => ({ ...i, ids: sel[entryOf(i.cardNumber, i.variant)] })), cards));
      actions.classList.remove('hidden');
      actions.innerHTML = '';
      const go = confirmButton(label, 'tr-btn', () => answerTrade('accept', t.id, 'Trade done! Check your collection.', getIds));
      actions.append(go, tradeLink(t.id));
      go.click(); // arms "Sure?" straight away: choosing the editions was the first step
    });
    box.appendChild(el('div', 'tr-actions')).append(back, use);
  };
  draw();
}

const STATUS_TEXT = { accepted: 'Completed', declined: 'Declined', cancelled: 'Cancelled', expired: 'Expired', countered: 'Countered', failed: 'Failed' };
function recentRow(t, cards) {
  const me = currentUsername;
  const other = t.from === me ? (t.to || t.resolvedBy || 'the board') : t.from;
  const row = el('div', 'tr-recent');
  const gave = t.from === me ? t.give : t.get;
  const got = t.from === me ? t.get : t.give;
  const sum = items => items.map(i => i.count + '× ' + (cards.get(i.cardNumber)?.name || '#' + i.cardNumber)).join(', ');
  // A completed trade that staff reversed keeps its 'accepted' status; `reversed` is set alongside it.
  const reversed = t.status === 'accepted' && t.reversed;
  row.append(
    el('span', 'tr-recent-status ' + (reversed ? 'reversed' : t.status), reversed ? 'Reversed by staff' : STATUS_TEXT[t.status] || t.status),
    el('span', 'tr-recent-text', ' @' + other + (t.status === 'accepted' && !reversed ? ': got ' + sum(got) + ' for ' + sum(gave) : '') + ' · '),
    tradeLink(t.id),
  );
  return row;
}

// ── The tab ───────────────────────────────────────────────
function renderTrades() {
  const area = document.getElementById('trades-area');
  if (!area || !season) return;
  if (composer) { renderComposer(area); return; }
  area.innerHTML = '';
  if (!tradesData) {
    area.appendChild(tradesError ? retryNote(tradesError, () => loadTrades(true)) : skeletonRows(4));
    return;
  }
  const cards = tradeCardMap();
  const d = tradesData;

  const top = el('div', 'tr-top');
  const newBtn = el('button', 'tr-btn', '+ New offer');
  newBtn.type = 'button';
  newBtn.disabled = !d.enabled;
  newBtn.addEventListener('click', () => { composer = { to: '', note: '', give: {}, giveIds: {}, get: {}, wantVar: {}, filter: '', busy: false, msg: '', counterOf: null }; renderTrades(); });
  top.append(newBtn, el('span', 'tr-limits', d.outgoing.length + '/' + d.limits.maxOpen + ' open offers'));
  area.appendChild(top);
  if (!d.enabled) area.appendChild(el('p', 'tr-closed', d.closedReason));

  const section = (title, count, ...children) => {
    const box = el('section', 'stat-box');
    box.appendChild(el('h3', 'stat-title', title + (count ? ' (' + count + ')' : '')));
    children.forEach(c => c && box.appendChild(c));
    area.appendChild(box);
  };
  if (d.incoming.length) section('Offers for you', d.incoming.length, ...d.incoming.map(t => tradeRow(t, 'incoming', cards)));
  if (d.outgoing.length) section('Your open offers', d.outgoing.length, ...d.outgoing.map(t => tradeRow(t, 'outgoing', cards)));
  section('The board', d.board.length, ...(d.board.length ? d.board.map(t => tradeRow(t, 'board', cards)) : [el('p', 'stat-muted', 'Nothing is listed right now. Post your own with New offer, and leave the name empty.')]));
  if (d.recent.length) section('Recent', 0, ...d.recent.map(t => recentRow(t, cards)));
  area.appendChild(el('div', 'tr-foot', 'Cards you offer are held safely until the offer is answered, cancelled or runs out (' + d.limits.expiryHours + 'h).'));
}

// ── Composer ──────────────────────────────────────────────
// Answering an offer with different terms: it starts from the mirror of the offer (you give what they asked for, as far as you own it,
// and want what they offered) and goes back to them as a new offer; the original is closed.
function startCounter(t) {
  const give = {}, get = {};
  const cards = tradeCardMap();
  t.get.forEach(i => {
    const card = cards.get(i.cardNumber);
    const have = card ? cardStatus(card).variants[i.variant] || 0 : 0;
    if (have > 0) give[tkey(i.cardNumber, i.variant)] = Math.min(i.count, have);
  });
  t.give.forEach(i => { get[tkey(i.cardNumber, i.variant)] = i.count; });
  composer = { to: t.from, note: '', give, giveIds: {}, get, wantVar: {}, filter: '', busy: false, msg: '', counterOf: t.id };
  renderTrades();
}
function stepper(value, max, onChange) {
  const box = el('span', 'tr-step');
  const minus = el('button', 'tr-step-btn', '−'); minus.type = 'button'; minus.disabled = value <= 0;
  const plus = el('button', 'tr-step-btn', '+'); plus.type = 'button'; plus.disabled = value >= max;
  minus.setAttribute('aria-label', 'One fewer'); plus.setAttribute('aria-label', 'One more');
  minus.addEventListener('click', () => onChange(value - 1));
  plus.addEventListener('click', () => onChange(value + 1));
  box.append(minus, el('span', 'tr-step-n', String(value)), plus);
  return box;
}
const stackCount = obj => Object.keys(obj).filter(k => obj[k] > 0).length;
const setCount = (obj, key, n) => { if (n > 0) obj[key] = n; else delete obj[key]; };

function cardRowBase(card, nameSuffix) {
  const row = el('div', 'tr-pick');
  const thumb = el('span', 'tr-thumb');
  if (card.thumbUrl || card.imageUrl) { const img = el('img'); img.src = card.thumbUrl || card.imageUrl; img.alt = ''; thumb.appendChild(img); }
  const name = el('span', 'tr-pick-name', card.name + (nameSuffix || ''));
  row.append(thumb, name);
  return row;
}

function renderGive(box) {
  box.innerHTML = '';
  const rows = [];
  cardsOfSeason().forEach(({ card }) => {
    const st = cardStatus(card);
    VARIANTS.forEach(v => { if (st.variants[v] > 0) rows.push({ card, v, have: st.variants[v] }); });
  });
  if (rows.length === 0) { box.appendChild(el('p', 'stat-muted', 'You have no cards to offer yet.')); return; }
  rows.forEach(({ card, v, have }) => {
    const k = tkey(card.number, v);
    const n = composer.give[k] || 0;
    const row = cardRowBase(card, SHORT[v] ? ' (' + SHORT[v] + ')' : '');
    row.classList.toggle('on', n > 0);
    row.appendChild(el('span', 'tr-have', 'have ' + have));
    row.appendChild(stepper(n, have, nn => {
      if (nn > 0 && n === 0 && stackCount(composer.give) >= tradesData.limits.maxStacks) { composer.msg = 'You can offer up to ' + tradesData.limits.maxStacks + ' different cards.'; renderSummary(); return; }
      composer.msg = '';
      setCount(composer.give, k, nn); resizeIds(k, card.number, v, nn); renderGive(box); renderSummary();
    }));
    box.appendChild(row);
    // Which editions go: the newest unless the viewer ticks others (only offered when they hold a spare).
    const list = printsFor(card.number, v), ticked = composer.giveIds[k];
    if (n > 0 && ticked) {
      const any = el('button', 'tr-link', 'Any edition (the newest)');
      any.type = 'button';
      any.addEventListener('click', () => { delete composer.giveIds[k]; renderGive(box); renderSummary(); });
      box.append(editionPicker(list, n, ticked, ids => { composer.giveIds[k] = ids; renderGive(box); renderSummary(); }, true), any);
    } else if (n > 0 && list.length > n) {
      const choose = el('button', 'tr-link', 'Choose editions (' + list.length + ' to pick from)');
      choose.type = 'button';
      choose.addEventListener('click', () => { composer.giveIds[k] = newestIds(list, n); renderGive(box); renderSummary(); });
      box.appendChild(choose);
    }
  });
}

// Chosen editions follow the count: one fewer drops the last tick, one more adds the newest not ticked yet (or goes back to "any edition").
function resizeIds(k, cardNumber, variant, nn) {
  const cur = composer.giveIds[k];
  if (!cur) return;
  if (nn <= 0) { delete composer.giveIds[k]; return; }
  if (nn <= cur.length) { composer.giveIds[k] = cur.slice(0, nn); return; }
  const extra = newestIds(printsFor(cardNumber, variant).filter(p => cur.indexOf(p.id) === -1), nn - cur.length);
  if (extra.length === nn - cur.length) composer.giveIds[k] = cur.concat(extra); else delete composer.giveIds[k];
}

function renderWant(box) {
  box.innerHTML = '';
  const q = composer.filter.trim().toLowerCase();
  let shown = 0;
  cardsOfSeason().forEach(({ card }) => {
    if (q && card.name.toLowerCase().indexOf(q) === -1 && String(card.number) !== q) return;
    if (!q && shown >= 12) return;
    shown++;
    const variants = (card.variants && card.variants.length) ? card.variants : ['regular'];
    const cur = variants.indexOf(composer.wantVar[card.number]) !== -1 ? composer.wantVar[card.number] : variants[0];
    const k = tkey(card.number, cur);
    const n = composer.get[k] || 0;
    const row = cardRowBase(card);
    row.classList.toggle('on', n > 0);
    if (variants.length > 1) {
      const sel = el('select', 'tr-select');
      variants.forEach(v => { const o = el('option', null, VARIANT_LABELS[v]); o.value = v; if (v === cur) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', () => { composer.wantVar[card.number] = sel.value; renderWant(box); });
      row.appendChild(sel);
    }
    row.appendChild(stepper(n, 20, nn => {
      if (nn > 0 && n === 0 && stackCount(composer.get) >= tradesData.limits.maxStacks) { composer.msg = 'You can ask for up to ' + tradesData.limits.maxStacks + ' different cards.'; renderSummary(); return; }
      composer.msg = '';
      setCount(composer.get, k, nn); renderWant(box); renderSummary();
    }));
    box.appendChild(row);
  });
  if (!q && cardsOfSeason().length > 12) box.appendChild(el('p', 'stat-muted', 'Type a name to find other cards.'));
  if (shown === 0) box.appendChild(el('p', 'stat-muted', 'No card matches that.'));
}

// Stacks to send; `ids` (the viewer's chosen editions) go on the stacks that have a choice.
const itemsOf = (obj, ids) => Object.keys(obj).filter(k => obj[k] > 0).map(k => {
  const [n, v] = k.split('|');
  return { cardNumber: Number(n), variant: v, count: obj[k], ...(ids && ids[k] ? { ids: ids[k] } : {}) };
});
const pickIncomplete = () => Object.keys(composer.giveIds).some(k => composer.giveIds[k].length !== (composer.give[k] || 0));

function renderSummary() {
  const box = document.getElementById('tr-summary');
  if (!box) return;
  box.innerHTML = '';
  const cards = tradeCardMap();
  const give = itemsOf(composer.give, composer.giveIds), get = itemsOf(composer.get);
  const line = (label, items) => {
    const s = el('div', 'tr-side');
    s.append(el('span', 'tr-label', label), items.length ? stackChips(items, cards) : el('span', 'tr-hint', 'nothing chosen yet'));
    box.appendChild(s);
  };
  line('You give', give);
  line('You want back', get);
  if (composer.msg) box.appendChild(el('p', 'tr-error', composer.msg));
  const send = document.getElementById('tr-send');
  if (send) send.disabled = composer.busy || give.length === 0 || get.length === 0 || pickIncomplete();
}

function renderComposer(area) {
  area.innerHTML = '';
  const head = el('div', 'tr-top');
  const back = el('button', 'tr-btn ghost', '‹ Back');
  back.type = 'button';
  back.addEventListener('click', () => { composer = null; renderTrades(); });
  head.append(back, el('span', 'tr-limits', composer.counterOf ? 'Counter-offer' : 'New offer'));
  area.appendChild(head);

  const section = (title, hint, child) => {
    const box = el('section', 'stat-box');
    box.appendChild(el('h3', 'stat-title', title));
    if (hint) box.appendChild(el('p', 'stat-muted', hint));
    box.appendChild(child);
    area.appendChild(box);
  };
  const giveBox = el('div', 'tr-list');
  section('1. What you give', 'Tap + on the cards to hand over. They are held safely until someone answers.', giveBox);
  renderGive(giveBox);

  const wantWrap = el('div');
  const search = el('input', 'tr-input');
  search.type = 'search'; search.placeholder = 'Find a card...'; search.value = composer.filter; search.setAttribute('aria-label', 'Find a card');
  const wantBox = el('div', 'tr-list');
  search.addEventListener('input', () => { composer.filter = search.value; renderWant(wantBox); });
  wantWrap.append(search, wantBox);
  section('2. What you want back', null, wantWrap);
  renderWant(wantBox);

  const sendWrap = el('div');
  const to = el('input', 'tr-input');
  to.type = 'text'; to.placeholder = 'Twitch name (empty = post on the board)'; to.value = composer.to; to.maxLength = 40; to.setAttribute('aria-label', 'Who the offer is for');
  if (composer.counterOf) { to.readOnly = true; to.title = 'A counter-offer goes back to the person who made the offer'; }
  to.addEventListener('input', () => { composer.to = to.value; });
  const note = el('input', 'tr-input');
  note.type = 'text'; note.placeholder = 'Add a note (optional)'; note.value = composer.note; note.maxLength = 140; note.setAttribute('aria-label', 'Note');
  note.addEventListener('input', () => { composer.note = note.value; });
  const summary = el('div'); summary.id = 'tr-summary';
  const send = el('button', 'tr-btn wide', 'Send offer'); send.id = 'tr-send'; send.type = 'button';
  send.addEventListener('click', async () => {
    composer.busy = true; composer.msg = ''; renderSummary();
    const target = composer.to.replace(/^@/, '').trim();
    const r = composer.counterOf
      ? await tradeRequest({ action: 'counter', id: composer.counterOf, give: itemsOf(composer.give, composer.giveIds), get: itemsOf(composer.get), note: composer.note })
      : await tradeRequest({ action: 'create', kind: target ? 'direct' : 'listing', to: target || undefined, give: itemsOf(composer.give, composer.giveIds), get: itemsOf(composer.get), note: composer.note });
    composer.busy = false;
    if (!r.ok) { composer.msg = r.error; renderSummary(); return; }
    const counterSent = !!composer.counterOf;
    composer = null;
    showToast(counterSent ? 'Counter-offer sent to @' + target + '.' : target ? 'Offer sent to @' + target + '.' : 'Listed on the board.');
    await loadTrades(true);
    refreshData(false); loadMe(true);
  });
  sendWrap.append(to, note, summary, send);
  section('3. Send it', composer.counterOf ? 'This goes back to ' + composer.to + ' as a new offer, and their original offer is closed.' : 'Name someone to offer it just to them, or leave the name empty to post it on the board for anyone.', sendWrap);
  renderSummary();
}
