'use strict';

// ═══════════════════════════════════════════════════════
//  STAGE LAYOUT  (Settings → Overlay layout)
// ═══════════════════════════════════════════════════════
// Everything is drawn on a fixed "design stage" (default 1280x720) and scaled to fit whatever size the OBS
// browser source actually is, so a differently sized source still shows the whole animation. The admin's
// scale/offset are applied on top. `?preview` is the admin editor's iframe: it takes layout changes by
// postMessage and never talks to the real queue, heartbeat or collection data.
// Sandbox: with ?sandbox=<id> every request to this site carries the sandbox header, so the overlay reads and writes that
// sandbox's data instead of production's (see lib/db.ts). A badge makes it obvious the overlay is not live data.
const SANDBOX_ID = new URLSearchParams(window.location.search).get('sandbox');
if (SANDBOX_ID) {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (typeof input !== 'string' || !(url.startsWith('/') || url.startsWith(window.location.origin))) return nativeFetch(input, init);
    const headers = new Headers((init && init.headers) || undefined);
    headers.set('x-tcg-sandbox', SANDBOX_ID);
    return nativeFetch(input, Object.assign({}, init, { headers }));
  };
  window.addEventListener('DOMContentLoaded', () => {
    const badge = document.createElement('div');
    badge.textContent = 'SANDBOX · ' + SANDBOX_ID;
    badge.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:99998;font:700 12px Poppins,sans-serif;color:#f3e8ff;background:rgba(88,28,135,.9);border:1px solid rgba(192,132,252,.6);border-radius:999px;padding:4px 12px;pointer-events:none;';
    document.body.appendChild(badge);
  });
}

// Overlay key: the OBS URL carries ?key=..., and the server only lets the overlay take queued pulls, report shown collections,
// read the collection and check in when that key (or a staff session) comes with the request (lib/overlay-key.ts). Sent on every request to this site.
const OVERLAY_KEY = new URLSearchParams(window.location.search).get('key');
if (OVERLAY_KEY) {
  const keyedFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (typeof input !== 'string' || !(url.startsWith('/') || url.startsWith(window.location.origin))) return keyedFetch(input, init);
    const headers = new Headers((init && init.headers) || undefined);
    headers.set('x-overlay-key', OVERLAY_KEY);
    return keyedFetch(input, Object.assign({}, init, { headers }));
  };
}

const PREVIEW = new URLSearchParams(window.location.search).has('preview');
// The Overlay Editor loads ?preview&editor; the pack workspace preview (plain ?preview) keeps only the nudge and clear keys.
const EDITOR = PREVIEW && new URLSearchParams(window.location.search).has('editor');
// Editor timeline (preview only): the reveal's phase timers go through phaseTimer so Pause can hold them, and the editor scrubs the
// CSS animations meanwhile. Outside the editor phaseTimer / phaseClear ARE setTimeout / clearTimeout, so live behaviour is unchanged.
const TL = { timers: new Set(), paused: false, start: 0, at: 0, pausedAt: 0, anims: new Map(), dur: 0, markers: null, active: false, tick: 0 };
const tlElapsed = () => (TL.paused ? TL.at : performance.now() - TL.start);
const tlReport = () => window.parent.postMessage({ type: 'timeline', active: TL.active, paused: TL.paused, t: tlElapsed() / 1000, dur: TL.dur / 1000, markers: TL.markers }, window.location.origin);
const editorTimer = (fn, ms) => {
  const h = { id: 0, due: performance.now() + ms, remain: ms };
  h.run = () => { TL.timers.delete(h); fn(); };
  if (!TL.paused) h.id = setTimeout(h.run, ms);
  TL.timers.add(h);
  return h;
};
const editorClear = (h) => { if (h && typeof h === 'object') { clearTimeout(h.id); TL.timers.delete(h); } else clearTimeout(h); };
const phaseTimer = EDITOR ? editorTimer : setTimeout;
const phaseClear = EDITOR ? editorClear : clearTimeout;
const tlBegin = (dur, markers) => {
  TL.timers.clear(); TL.anims.clear(); TL.paused = false; TL.start = performance.now(); TL.dur = dur; TL.markers = markers; TL.active = true;
  clearInterval(TL.tick); TL.tick = setInterval(tlReport, 100); tlReport();
};
const tlEnd = () => { TL.active = false; TL.paused = false; clearInterval(TL.tick); tlReport(); };
const tlCommand = (action, t) => {
  if (!TL.active) return;
  if (action === 'pause' && !TL.paused) {
    const now = performance.now();
    TL.at = TL.pausedAt = now - TL.start; TL.paused = true;
    TL.timers.forEach(h => { clearTimeout(h.id); h.remain = Math.max(0, h.due - now); });
    TL.anims.clear();
    for (const a of document.getAnimations()) { TL.anims.set(a, (a.startTime == null ? now : a.startTime) - TL.start); a.pause(); }
  } else if (action === 'seek' && TL.paused && Number.isFinite(t)) {
    const ms = Math.min(TL.dur, Math.max(0, t * 1000));
    TL.anims.forEach((off, a) => { a.currentTime = Math.max(0, ms - off); a.pause(); });
    TL.at = ms;
  } else if (action === 'resume' && TL.paused) {
    const now = performance.now();
    const shift = TL.at - TL.pausedAt;   // how far the scrubber moved while paused: pending timers move with it
    TL.start = now - TL.at; TL.paused = false;
    TL.timers.forEach(h => { h.remain = Math.max(0, h.remain - shift); h.due = now + h.remain; h.id = setTimeout(h.run, h.remain); });
    TL.anims.forEach((off, a) => { try { a.play(); } catch (e) { /* finished or removed */ } });
    TL.anims.clear();
  }
  tlReport();
};
// The stage is the browser source's size; scale/offset are set separately for the pack opening and the collection
// view (each theater wrapper gets .is-pack or .is-collection, which picks up its own --pack-* / --col-* variables).
let STAGE = { width: 1280, height: 720 };
let PLACEMENTS = {
  pack:       { scale: 1, offsetX: 0, offsetY: 0 },
  collection: { scale: 1, offsetX: 0, offsetY: 0 },
};

// Parts moved on their own, per id (see lib/overlay-layout.ts ELEMENT_IDS); offsets are relative to the part's normal spot.
const EL_IDS = ['card', 'label', 'serial', 'bar', 'got', 'strip', 'showlabel', 'banner', 'heading', 'grid'];
let ELEMENTS = {};

const n0 = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);

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
    ELEMENTS = Object.assign({}, layout.pack && layout.pack.elements, layout.collection && layout.collection.elements);
  }
  const fit = Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height);
  const root = document.documentElement.style;
  root.setProperty('--stage-w', STAGE.width + 'px');
  root.setProperty('--stage-h', STAGE.height + 'px');
  root.setProperty('--stage-scale', String(fit));
  // Offsets are in design pixels and applied inside the scaled stage, so they scale with the fit automatically.
  for (const id of EL_IDS) {
    const e = ELEMENTS[id] || {};
    root.setProperty('--el-' + id + '-x', n0(e.offsetX) + 'px');
    root.setProperty('--el-' + id + '-y', n0(e.offsetY) + 'px');
    root.setProperty('--el-' + id + '-s', String(typeof e.scale === 'number' && e.scale > 0.05 ? e.scale : 1));
    // Opacity goes through filter, which never touches the opacity the reveal animations and the fade-ins drive on these nodes.
    if (typeof e.opacity === 'number' && e.opacity >= 0 && e.opacity < 1) root.setProperty('--el-' + id + '-f', 'opacity(' + e.opacity + ')');
    else root.removeProperty('--el-' + id + '-f');
  }
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
let BACKS = {};   // each pack's designed card back, laid out at a reference size (lib/card-back-overlay.ts)
let FONT_CATALOG = [];   // card-back faces (lib/card-back-overlay.ts overlayFontCatalog); display leaves the stylesheet alone
const loadedFaces = new Set();
function loadFace(family, weight, file) {
  if (!family || !file) return;
  const k = family + ':' + weight;
  if (loadedFaces.has(k)) return;
  loadedFaces.add(k);
  try {
    const face = new FontFace(family, "url('/fonts/back/" + file + "') format('woff2')", { weight: String(weight), display: 'swap' });
    document.fonts.add(face); face.load().catch(() => {});
  } catch { /* the fallback font shows */ }
}
// `inherit` follows the overlay font (text.font). Site display (the default) clears any inline family so today's stylesheet face stays. Any other id sets one.
function textFontId(P, id) { return !id || id === 'inherit' ? (P && P['text.font']) || 'display' : id; }
function applyTextFont(el, id, P) {
  if (!el) return;
  id = textFontId(P, id);
  if (!id || id === 'display') { el.style.fontFamily = ''; return; }
  const f = FONT_CATALOG.find(x => x.id === id);
  if (!f || !f.css) return;
  if (f.file) loadFace(f.family, f.weight, f.file);
  el.style.fontFamily = f.css;
}
let PREVIEW_PROPS = null;   // admin editor: unsaved values shown live (replaces the saved ones)
let PREVIEW_VARIANT = '';   // admin editor: "preview as" variant

function effectiveProps(packId) {
  const out = Object.assign({}, PROP_DEFAULTS);
  if (PREVIEW_PROPS) return Object.assign(out, PREVIEW_PROPS);
  Object.assign(out, PROPS_GLOBAL);
  if (packId && PACK_OVERRIDES[packId]) Object.assign(out, PACK_OVERRIDES[packId]);
  return out;
}
// ── The pack's designed card back (reveal.flipBack = design) ──
// The server sends the nodes already laid out (layoutBack) at a reference card size; this draws them as DOM, the way the site's FlipCard
// does (same classes, rules in widget.css under .tcg-back), and scales the plate to the card. Keep backNodeSpec in step with FlipCard's
// BackNodeView; scripts/check-card-back.mts runs it against the server's node list.
// BACK-RENDERER-START
const BACK_UNITLESS = { opacity: 1, zIndex: 1, lineHeight: 1, fontWeight: 1 };
const backCssName = k => k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
// One node as plain data: its tag, classes, text and a map of CSS property -> value (px added to bare numbers); null = nothing to draw.
function backNodeSpec(n) {
  if (!n || (n.tag !== 'img' && n.tag !== 'p' && n.tag !== 'ul')) return null; // facts about a print (qr, link) are hidden; empty = nothing to print
  const style = {};
  for (const k of Object.keys(n.vars || {})) style[k] = String(n.vars[k]);
  for (const k of Object.keys(n.css || {})) { const v = n.css[k]; style[backCssName(k)] = typeof v === 'number' && !BACK_UNITLESS[k] ? v + 'px' : String(v); }
  return { tag: n.tag, cls: n.cls || '', text: n.text || '', src: n.src || '', items: n.items || [], style };
}
function backNodeEl(spec) {
  const el = document.createElement(spec.tag);
  if (spec.cls) el.className = spec.cls;
  if (spec.tag === 'img') { el.src = spec.src; el.alt = ''; }
  else if (spec.tag === 'p') el.textContent = spec.text;
  for (const k of Object.keys(spec.style)) el.style.setProperty(k, spec.style[k]);
  return el;
}
// Draws the design into `host` (the .card-back element), scaled to its width. False = nothing drawn (the caller keeps the cover).
function mountDesignBack(host, design) {
  const w = host.offsetWidth;
  if (!design || !design.nodes || !w) return false;
  for (const f of design.fonts || []) loadFace(f.family, f.weight, f.file);
  const root = document.createElement('div');
  root.className = 'tcg-back';
  root.style.width = design.w + 'px'; root.style.height = design.h + 'px';
  root.style.transform = 'scale(' + (w / design.w) + ')';
  const plate = document.createElement('div');
  plate.className = 'flip-plate';
  for (const k of Object.keys(design.vars || {})) plate.style.setProperty(k, design.vars[k]);
  for (const n of design.nodes) { const spec = backNodeSpec(n); if (spec) plate.appendChild(backNodeEl(spec)); }
  root.appendChild(plate);
  host.appendChild(root);
  host.classList.add('card-back-design');
  return true;
}
// BACK-RENDERER-END
// Falls back to the literal (the shipped default) if the config couldn't be fetched.
const pv = (P, key, fallback) => (P[key] !== undefined ? P[key] : fallback);

async function loadLayout() {
  try {
    // ?preset=<id> in the browser source's URL picks a scene: its own layout and values (see lib/overlay-settings.ts).
    const scene = new URLSearchParams(window.location.search).get('preset');
    const res = await fetch('/api/overlay/config' + (scene ? '?preset=' + encodeURIComponent(scene) : ''), { cache: 'no-store' });
    if (res.ok) {
      const cfg = await res.json();
      // The editor preview posts its own layout and values. Loading those here would overwrite them. The font list is still needed.
      if (!PREVIEW) applyLayout(cfg.layout);
      PROP_DEFAULTS = cfg.defaults || {};
      if (!PREVIEW) {
        PROPS_GLOBAL = cfg.props || {};
        PACK_OVERRIDES = cfg.packOverrides || {};
      }
      BACKS = cfg.backs || {};
      FONT_CATALOG = cfg.fonts || [];
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
let previewCardNumber = 0;
let previewShowOff = false;   // the editor's "Show off" view: the still and Play use the show-off settings

// The pack workspace's preview sends the UNSAVED pack and card fields; they are laid over the loaded data (this page only ever shows a preview).
const DRAFT_PACK_FIELDS = ['name', 'coverImageUrl', 'accentColor', 'tearBorderColor', 'holoMinStars', 'cardTime', 'cooldownTime', 'soundVolume', 'upgradesEnabled', 'variantWeights', 'disabledVariants'];
const DRAFT_CARD_FIELDS = ['name', 'stars', 'probability', 'image', 'thumb', 'soundUrl', 'fullArt', 'fullArtThumb', 'upgradesEnabled', 'disabledVariants'];
function applyDraft(d) {
  const chosen = PACKS.find(p => p.pack.id === d.packId);
  if (!chosen) return;
  if (d.pack && typeof d.pack === 'object') for (const k of DRAFT_PACK_FIELDS) if (k in d.pack) chosen.pack[k] = d.pack[k];
  const c = d.card && typeof d.card === 'object' ? chosen.cards.find(x => x.number === d.card.number) : null;
  if (c) for (const k of DRAFT_CARD_FIELDS) if (k in d.card) c[k] = d.card[k];
}

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
    const PS = previewShowOff ? showOffProps(P, variant) : P;
    const card = chosen.cards.find(c => c.number === previewCardNumber) || [...chosen.cards].sort((x, y) => y.stars - x.stars)[0] || ALL_CARDS[0];
    wrapper.classList.add('is-pack', 'pack-fit');
    cardBox.style.animation = 'none';
    cardBox.style.opacity = '1';
    radialContainer.style.animation = 'none';
    cardInfo.style.opacity = '1';
    cardInfo.style.transform = 'scale(1)';
    if (card) {
      applyLook(theater, PS, variant, card, cfg, false);
      cardLabel.style.opacity = '1';
      cardLabel.style.visibility = 'visible';
      showSerial(theater, PS, { n: 3, mult: 2.8, uid: 1023381 });
      editable(theater.cardBox.querySelector('.serial-badge'), 'serial', 'Click to edit the edition badge');
      const burst = burstSpec(PS, variant);
      radialContainer.style.opacity = String(burst.opacity);
      if (!burst.on) radialContainer.style.display = 'none';
      if (previewShowOff) {
        userText.textContent = showText(PS, 'Preview', { cardName: card.name, variant });
        styleShowLabel(userText, PS);
        editable(userText, 'showlabel', 'Click to edit the show-off label');
        miniList.style.display = 'none';
      } else {
        userText.textContent = gotText(PS, 'Preview');
        editable(userText, 'got', 'Click to edit the "got:" line');
        editable(miniList, 'strip', 'Click to edit the cards under the card');
      }
      const usesFull = (variant === 'full' || variant === 'shiny' || variant === 'golden') && card.fullArt;
      const art = usesFull ? card.fullArt : card.image;
      paintCard(theater, card, art, usesFull ? card.fullArtThumb : card.thumb);
      const fx = mainCardAnimation(PS, variant, 1, 0, true);
      mainCard.style.animation = fx.anim;
      wrapper.style.setProperty('--fx-start', '0s');
      cardBox.style.animation = tiltAnimation(PS, variant, 1, 0) || 'none';
      buildMiniList(miniList, revealedCardsByUser.preview || [], card.number, cfg, listOpts(PS, true));
      if (holoOn(PS, variant, card, cfg)) holoOverlay.classList.add('holographic-animate');
    }
  } else {
    // The collection view: just the name and the card grid.
    wrapper.classList.add('is-collection');
    cardBox.style.display = 'none';
    radialContainer.style.display = 'none';
    cardInfo.style.opacity = '1';
    cardInfo.style.transform = 'scale(1)';
    userText.textContent = headingText(P, 'Preview');
    applyTextFont(userText, pv(P, 'collection.headingFont', 'inherit'), P);
    editable(userText, 'heading', 'Click to edit the heading');
    editable(miniList, 'grid', 'Click to edit the collection grid');
    if (!pv(P, 'collection.showHeading', true)) userText.style.display = 'none';
    const opts = listOpts(P, false);
    if (opts.perRow > 0) wrapper.style.maxWidth = 'none';
    buildMiniList(miniList, revealedCardsByUser.preview || [], null, cfg, opts);
  }
}

if (PREVIEW) {
  // Clicking an element in the editor's preview asks the editor to open that element's settings.
  document.body.classList.add('preview-edit');
  // Pointer down selects; dragging past 3 px moves that element's view (design px, cumulative from the press).
  const toParent = (msg) => { if (window.parent !== window) window.parent.postMessage(msg, window.location.origin); };
  let press = null;
  let resizing = null;
  const stageFit = () => parseFloat(document.documentElement.style.getPropertyValue('--stage-scale')) || 1;
  const boxOf = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const visibleEdits = () => [...document.querySelectorAll('[data-edit]')].filter(el => el.getBoundingClientRect().width > 0);
  const unionOf = (boxes) => boxes.length ? { l: Math.min(...boxes.map(b => b.l)), t: Math.min(...boxes.map(b => b.t)), r: Math.max(...boxes.map(b => b.r)), b: Math.max(...boxes.map(b => b.b)) } : null;
  // Snap guides (lines drawn over the stage while a drag is locked to the stage or another element) and the size / position readout.
  const guideEls = [];
  const showGuides = (list) => {
    list.forEach((g, i) => {
      const d = guideEls[i] || (guideEls[i] = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'edit-guide' })));
      d.style.display = 'block';
      d.style.left = ('x' in g ? g.x : 0) + 'px'; d.style.top = ('y' in g ? g.y : 0) + 'px';
      d.style.width = 'x' in g ? '1px' : '100vw'; d.style.height = 'x' in g ? '100vh' : '1px';
    });
    for (let i = list.length; i < guideEls.length; i++) guideEls[i].style.display = 'none';
  };
  const SNAP_PX = 6;
  let userGuides = { x: [], y: [] }; // the editor's own guide lines (design px), sent as { type: 'guides' }
  let selSet = new Set();    // every selected part (the editor's multi-select) and the locked ones, sent with { type: 'selected' }
  let lockedSet = new Set();
  // The closest of `lines` to any of the moving edges (start, middle, end), within SNAP_PX: { d: shift to apply, line }.
  const snapAxis = (vals, lines) => {
    let best = null;
    for (const v of vals) for (const ln of lines) { const d = ln - v; if (Math.abs(d) <= SNAP_PX && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line: ln }; }
    return best;
  };
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest && e.target.closest('[data-edit]');
    if (!el || e.button !== 0) return;
    const t = el.dataset.edit;
    // Shift+click toggles a part in the selection; Shift+drag still moves the whole view when nothing is selected yet.
    const toggle = e.shiftKey && selSet.size > 0;
    // A press on one of several selected parts drags them all; a click without a drag then picks just that part.
    const inGroup = !toggle && selSet.size > 1 && selSet.has(t);
    const edits = visibleEdits();
    const others = edits.filter(o => inGroup ? !selSet.has(o.dataset.edit) : o !== el).map(boxOf);
    const rect = inGroup ? unionOf(edits.filter(o => selSet.has(o.dataset.edit)).map(boxOf)) : boxOf(el);
    press = { id: e.pointerId, target: t, x: e.clientX, y: e.clientY, moved: false, rect, others, all: unionOf(others.concat(rect)), locked: lockedSet.has(t), toggle, inGroup };
    if (!inGroup) toParent({ type: 'select', target: t, shift: toggle });
  });
  document.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id || press.locked) return;
    if (!press.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 3) return;
    press.moved = true;
    let sdx = e.clientX - press.x, sdy = e.clientY - press.y;
    let sx = false, sy = false;
    const guides = [];
    if (document.body.dataset.snap && !e.altKey) {
      // Snap the moving box's edges and middle to the stage and (for a single part) to the other parts.
      const viewMove = e.shiftKey && !press.toggle;
      const b = viewMove ? press.all : press.rect;
      const xs = [0, innerWidth / 2, innerWidth, ...userGuides.x], ys = [0, innerHeight / 2, innerHeight, ...userGuides.y];
      if (!viewMove) for (const o of press.others) { xs.push(o.l, (o.l + o.r) / 2, o.r); ys.push(o.t, (o.t + o.b) / 2, o.b); }
      const bx = snapAxis([b.l + sdx, (b.l + b.r) / 2 + sdx, b.r + sdx], xs);
      const by = snapAxis([b.t + sdy, (b.t + b.b) / 2 + sdy, b.b + sdy], ys);
      if (bx) { sdx += bx.d; sx = true; guides.push({ x: bx.line }); }
      if (by) { sdy += by.d; sy = true; guides.push({ y: by.line }); }
    }
    showGuides(guides);
    const fit = stageFit();
    toParent({ type: 'drag', target: press.target, dx: sdx / fit, dy: sdy / fit, alt: e.altKey, shift: e.shiftKey && !press.toggle, sx, sy });
  });
  const endPress = (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (press.moved) toParent({ type: 'dragend' });
    else if (press.inGroup) toParent({ type: 'select', target: press.target });
    press = null;
    showGuides([]);
  };
  // Right-click on a part opens the editor's layer menu there.
  document.addEventListener('contextmenu', (e) => {
    const el = e.target.closest && e.target.closest('[data-edit]');
    if (!el) return;
    e.preventDefault();
    toParent({ type: 'context', target: el.dataset.edit, x: e.clientX, y: e.clientY });
  });
  // Focus sits in this frame after a click, so hand the nudge / clear keys and the editor's shortcuts (tools, zoom, save) to the editor.
  const FWD_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape'];
  const FWD_EDITOR_KEYS = ['v', 'h', 'z', 'Tab', '?', ' '];
  const FWD_CTRL = ['s', 'd', '0', '1', '=', '+', '-', 'z', 'y', 'r'];
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!(mod ? EDITOR && FWD_CTRL.includes(e.key.toLowerCase()) : FWD_KEYS.includes(e.key) || (EDITOR && FWD_EDITOR_KEYS.includes(e.key)))) return;
    e.preventDefault();
    toParent({ type: 'key', key: e.key, shift: e.shiftKey, ctrl: mod });
  });
  document.addEventListener('keyup', (e) => {
    if (EDITOR && e.key === ' ') toParent({ type: 'key', key: ' ', up: true });
  });
  // The frame swallows wheel turns, so the editor pans and zooms from them (x / y are in this frame's pixels).
  document.addEventListener('wheel', (e) => {
    if (!EDITOR) return;
    e.preventDefault();
    toParent({ type: 'wheel', dx: e.deltaX, dy: e.deltaY, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, x: e.clientX, y: e.clientY });
  }, { passive: false });
  document.addEventListener('pointerup', endPress);
  document.addEventListener('pointercancel', endPress);
  // Selected element: a solid outline (CSS, by body[data-selected]) plus a name tag kept on top of it.
  const TAG_NAMES = { card: 'Card', label: 'Label', bar: 'Name and stars bar', got: '"got:" line', strip: 'Card strip', showlabel: 'Show-off label', serial: 'Edition badge', banner: 'Moment banner', heading: 'Heading', grid: 'Collection grid' };
  const selTag = document.createElement('div');
  selTag.className = 'edit-tag';
  document.body.appendChild(selTag);
  // Four corner handles resize the selected part (or, with a view selected, the whole view): the factor is the
  // pointer's distance from the scaling centre against where the press began.
  const readout = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'edit-tag edit-readout' }));
  const handles = ['nw', 'ne', 'sw', 'se'].map(c => {
    const h = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'edit-handle ' + c }));
    h.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      const wholeView = !document.body.dataset.selected;
      const wrap = document.querySelector('.is-pack, .is-collection');
      const b = wholeView && wrap ? boxOf(wrap) : curBox();
      if (!b) return;
      const cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2;
      resizing = { id: e.pointerId, cx, cy, d0: Math.hypot(e.clientX - cx, e.clientY - cy) || 1, target: document.body.dataset.selected || '', view: wholeView };
      h.setPointerCapture(e.pointerId);
    });
    h.addEventListener('pointermove', (e) => {
      if (!resizing || e.pointerId !== resizing.id) return;
      toParent({ type: 'resize', target: resizing.target, view: resizing.view, factor: Math.hypot(e.clientX - resizing.cx, e.clientY - resizing.cy) / resizing.d0 });
    });
    const end = (e) => {
      if (!resizing || e.pointerId !== resizing.id) return;
      resizing = null;
      toParent({ type: 'dragend' });
    };
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
    return h;
  });
  // The box the handles and readout wrap: the selected part, or all parts together when a view is selected.
  const curBox = () => {
    const t = document.body.dataset.selected;
    if (t && selSet.size > 1) return unionOf(visibleEdits().filter(o => selSet.has(o.dataset.edit)).map(boxOf));
    if (t) { const el = document.querySelector('[data-edit="' + t + '"]'); return el ? boxOf(el) : null; }
    return document.body.dataset.view ? unionOf(visibleEdits().map(boxOf)) : null;
  };
  const placeTag = () => {
    const t = document.body.dataset.selected;
    const el = t && document.querySelector('[data-edit="' + t + '"]');
    if (el) {
      const r = el.getBoundingClientRect();
      selTag.textContent = selSet.size > 1 ? selSet.size + ' layers' : TAG_NAMES[t] || t;
      selTag.style.display = 'block';
      selTag.style.left = Math.max(0, r.left) + 'px';
      selTag.style.top = Math.max(0, r.top - 22) + 'px';
    } else selTag.style.display = 'none';
    document.querySelectorAll('[data-edit]').forEach(o => { o.classList.toggle('edit-sel', selSet.has(o.dataset.edit)); o.classList.toggle('edit-locked', lockedSet.has(o.dataset.edit)); });
    const b = document.body.dataset.canedit ? curBox() : null;
    handles.forEach(h => {
      h.style.display = b ? 'block' : 'none';
      if (!b) return;
      h.style.left = (h.classList.contains('nw') || h.classList.contains('sw') ? b.l : b.r) + 'px';
      h.style.top = (h.classList.contains('nw') || h.classList.contains('ne') ? b.t : b.b) + 'px';
    });
    if (b && ((press && press.moved) || resizing)) {
      const fit = stageFit();
      const w = b.r - b.l, h = b.b - b.t;
      readout.textContent = 'X ' + Math.round(b.l / fit) + '  Y ' + Math.round(b.t / fit) + '  ' + Math.round(w / fit) + ' x ' + Math.round(h / fit)
        + ' (' + Math.round(w / innerWidth * 100) + '% x ' + Math.round(h / innerHeight * 100) + '%)';
      readout.style.display = 'block';
      readout.style.left = Math.max(0, Math.min(innerWidth - 220, b.l)) + 'px';
      readout.style.top = Math.min(innerHeight - 20, b.b + 6) + 'px';
    } else readout.style.display = 'none';
    requestAnimationFrame(placeTag);
  };
  requestAnimationFrame(placeTag);
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin || e.source !== window.parent || !e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'selected') {
      if (typeof e.data.target === 'string' && e.data.target) document.body.dataset.selected = e.data.target;
      else delete document.body.dataset.selected;
      const ids = (a) => new Set(Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);
      selSet = ids(e.data.selection); if (document.body.dataset.selected) selSet.add(document.body.dataset.selected);
      lockedSet = ids(e.data.locked);
      // `view`: a whole view is selected (handles wrap all its parts); canEdit / snap come from the editor.
      const flag = (k, on) => { if (on) document.body.dataset[k] = '1'; else delete document.body.dataset[k]; };
      flag('view', !!e.data.view); flag('canedit', !!e.data.canEdit); flag('snap', !!e.data.snap);
    }
    else if (EDITOR && e.data.type === 'timeline') tlCommand(e.data.action, e.data.t);
    else if (EDITOR && e.data.type === 'measure') {
      // The editor's Align / Distribute asks where parts sit now: reply with each part's box in design px.
      const fit = stageFit();
      const boxes = {};
      for (const el of visibleEdits()) {
        const id = el.dataset.edit;
        if (!Array.isArray(e.data.ids) || !e.data.ids.includes(id)) continue;
        const b = boxOf(el);
        boxes[id] = { x: b.l / fit, y: b.t / fit, w: (b.r - b.l) / fit, h: (b.b - b.t) / fit };
      }
      toParent({ type: 'boxes', boxes, seq: e.data.seq });
    }
    else if (e.data.type === 'guides') {
      const nums = (a) => (Array.isArray(a) ? a.filter((n) => Number.isFinite(n)) : []);
      userGuides = { x: nums(e.data.x), y: nums(e.data.y) };
    }
    else if (e.data.type === 'hover') {
      if (typeof e.data.target === 'string' && e.data.target) document.body.dataset.hover = e.data.target;
      else delete document.body.dataset.hover;
    }
    else if (e.data.type === 'layout') applyLayout(e.data.layout);
    else if (e.data.type === 'props') {
      PREVIEW_PROPS = e.data.props && typeof e.data.props === 'object' ? e.data.props : null;
      previewPackId = typeof e.data.packId === 'string' ? e.data.packId : '';
      previewCardNumber = Number.isInteger(e.data.cardNumber) ? e.data.cardNumber : 0;
      if (activeDraws === 0) showStatic();
    }
    else if (e.data.type === 'draft') applyDraft(e.data);
    else if (e.data.type === 'variant') {
      PREVIEW_VARIANT = ['reverse', 'full', 'shiny', 'golden'].includes(e.data.variant) ? e.data.variant : '';
      if (activeDraws === 0) showStatic();
    }
    else if (e.data.type === 'static') { previewShowOff = !!e.data.showoff && e.data.mode !== 'collection'; if (activeDraws === 0) showStatic(e.data.mode); else previewMode = e.data.mode === 'collection' ? 'collection' : 'pack'; }
    else if (e.data.type === 'showoff') {
      clearStatic();
      const chosen = PACKS.find(p => p.pack.id === previewPackId) || PACKS[0];
      const c = chosen && (chosen.cards.find(x => x.number === previewCardNumber) || [...chosen.cards].sort((x, y) => y.stars - x.stars)[0]);
      if (c) queueShowCard('preview', { cardNumber: c.number, variant: PREVIEW_VARIANT || 'regular', serial: 3, serialMult: 2.8, uid: 1023381 });
    }
    else if (e.data.type === 'pack') { clearStatic(); queueDraw('preview', { dry: true, packId: previewPackId || undefined, cardNumber: previewCardNumber || undefined, variant: PREVIEW_VARIANT || undefined, moment: MOMENT_IDS.includes(e.data.moment) ? e.data.moment : undefined }); }
    else if (e.data.type === 'collection') { clearStatic(); queueCollection('preview', { dry: true }); }
  });
}

// ═══════════════════════════════════════════════════════
//  SEASON DATA  (loaded from /api/seasons/active)
// ═══════════════════════════════════════════════════════
// Collection entries encode the variant: cardNumber + VARIANT_OFFSET * variantIndex (regular = plain number).
// Keep in sync with lib/variants.ts.
const VARIANTS = ['regular', 'reverse', 'full', 'shiny', 'golden'];
const VARIANT_OFFSET = 1000000;
const GOLDEN_PULLS = false;
const VARIANT_LABELS = { regular: 'Regular', reverse: 'Reverse Holo', full: 'Full Art', shiny: 'Full Art Holo', golden: 'Golden' };
const DEFAULT_VARIANT_WEIGHTS = { regular: 100, reverse: 25, full: 5, shiny: 1, golden: 0 };
function encodeEntry(cardNumber, variant) { return cardNumber + VARIANT_OFFSET * Math.max(0, VARIANTS.indexOf(variant)); }
function decodeEntry(entry) {
  const idx = Math.min(Math.floor(entry / VARIANT_OFFSET), VARIANTS.length - 1);
  return { cardNumber: entry - idx * VARIANT_OFFSET, variant: VARIANTS[idx] };
}
// Test-panel switches (?dev). Only the panel changes these; real draws never see them.
const DEV = { dry: true, mute: false, quick: false };

// `off` lists the variants switched off for this pack / card: they are never rolled (Regular can't be switched off).
function rollVariant(weights, off) {
  const w = Object.assign({}, DEFAULT_VARIANT_WEIGHTS, weights);
  const weight = v => ((v === 'golden' && !GOLDEN_PULLS) || (v !== 'regular' && off && off.indexOf(v) !== -1) ? 0 : Math.max(0, w[v]));
  const total = VARIANTS.reduce((s, v) => s + weight(v), 0);
  if (total <= 0) return 'regular';
  let r = Math.random() * total;
  for (const v of VARIANTS) { r -= weight(v); if (r < 0) return v; }
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
        disabledVariants: c.disabledVariants || [],
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
  else if (chosen.pack.upgradesEnabled && card.upgradesEnabled) variant = rollVariant(chosen.pack.variantWeights, (chosen.pack.disabledVariants || []).concat(card.disabledVariants || []));

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

// Returns a promise of the server's reply ({ owned, serial, uid, serialMult } for a pull), or null.
function saveCollection(pull) {
  if (PREVIEW || !SEASON_CFG.collectionName) return Promise.resolve(null);
  const body = { data: revealedCardsByUser };
  if (pull) body.pull = pull;
  return fetch(`/api/collection?name=${SEASON_CFG.collectionName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
    .then(res => (res.ok ? res.json() : null))
    // The server appended the pull to the real collection (which may have changed since the overlay
    // loaded it, e.g. a viewer upgraded a card); take its copy for this user.
    .then(r => { if (pull && r && Array.isArray(r.owned)) revealedCardsByUser[pull.username] = r.owned; return r; })
    .catch(() => null);
}

// The serial number a card was given, as a pill on the card's top-left (the label pill sits on the right). Hidden when the season's
// copies are not numbered yet, or the admin turned it off (Overlay Editor -> Pack opening -> Label).
function showSerial(theater, P, info) {
  const { cardBox } = theater;
  if (!info || !info.n || !pv(P, 'reveal.showSerial', true) || !cardBox) return;
  cardBox.querySelectorAll('.serial-badge').forEach(e => e.remove());
  const el = document.createElement('div');
  el.className = 'serial-badge' + (info.mult > 1 ? ' bonus' : '') + (info.n === 1 ? ' first' : '');
  const num = document.createElement('span');
  num.className = 'serial-num';
  // Print (#7, the default), the serial number (#1023381) or both (the print pill with a small "Serial #" line under it).
  // Without a serial number (older server, untracked ledger) the print is shown whatever the format says.
  const fmt = info.uid ? String(pv(P, 'reveal.serialFormat', 'edition')) : 'edition';
  num.textContent = '#' + (fmt === 'uid' ? info.uid : info.n);
  el.appendChild(num);
  if (info.n === 1 || info.mult > 1) {
    const note = document.createElement('span');
    note.className = 'serial-note';
    note.textContent = info.n === 1 ? 'first ever' : '\u00d7' + (Math.round(info.mult * 10) / 10);
    el.appendChild(note);
  }
  if (fmt === 'both') {
    el.classList.add('has-print');
    const print = document.createElement('span');
    print.className = 'serial-print';
    print.textContent = 'Serial #' + info.uid;
    el.appendChild(print);
  }
  applyTextFont(el, pv(P, 'reveal.serialFont', 'inherit'), P);
  cardBox.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
}

// ── Special moments (Overlay Editor -> Special moments) ──
// One moment plays per pull and the highest wins: first-ever print, a viewer's first pull, a new card for them.
// pickMoment mirrors lib/overlay-moments.ts (scripts/check-overlay.mts runs both).
const MOMENT_IDS = ['firstEver', 'firstPull', 'newCard'];
const MOMENT_DEFAULT_BG = ['#ffe27a', '#f1bb06', '#fff2b0', '#f1bb06'];
const momentKey = (id, name) => {
  if (id === 'firstEver') { if (name === 'on') return 'reveal.firstEver'; if (name === 'text') return 'reveal.firstEverText'; if (name === 'hold') return 'reveal.firstEverHold'; }
  return 'moment.' + id + '.' + name;
};
function momentEnabled(P) {
  return { firstEver: !!pv(P, momentKey('firstEver', 'on'), true), firstPull: !!pv(P, momentKey('firstPull', 'on'), false), newCard: !!pv(P, momentKey('newCard', 'on'), false) };
}
function pickMoment(facts, enabled) {
  if (facts.firstEver && enabled.firstEver) return 'firstEver';
  if (facts.firstForViewer && enabled.firstPull) return 'firstPull';
  if (facts.isNew && enabled.newCard) return 'newCard';
  return null;
}
function momentFill(text, ctx) {
  return String(text).replace(/\{username\}/g, ctx.username).replace(/\{cardName\}/g, ctx.cardName);
}
/** Everything one moment's banner needs, read from the effective properties. */
function momentSpec(P, id, ctx) {
  const g = (name, d) => pv(P, momentKey(id, name), d);
  const auto = id === 'firstEver' ? 'edition #1' + (ctx.variant === 'regular' ? '' : ' · ' + VARIANT_LABELS[ctx.variant]) : id === 'firstPull' ? 'their first card' : 'new to their collection';
  const sub = String(g('subText', ''));
  return {
    id,
    text: momentFill(g('text', id === 'firstEver' ? 'FIRST EVER!' : id === 'firstPull' ? 'Welcome, {username}!' : 'NEW CARD!'), ctx),
    sub: sub ? momentFill(sub, ctx) : auto,
    bg: g('bgColors', id === 'firstEver' ? MOMENT_DEFAULT_BG : ['#8b5cf6', '#ec4899']),
    textColor: g('textColor', id === 'firstEver' ? '#1a1205' : '#ffffff'),
    textSize: g('textSize', 26),
    font: g('font', 'inherit'),
    position: g('position', 'top'),
    sparkles: Math.round(g('sparkles', id === 'firstEver' ? 44 : 0)),
    sparkleColor: g('sparkleColor', '#ffe27a'),
    sound: String(g('sound', '')),
    volume: g('volume', 1),
    hold: Math.max(0, g('hold', id === 'firstEver' ? 2.5 : id === 'firstPull' ? 2 : 1)),
    vol: ctx.vol,
    variant: ctx.variant,
  };
}
/** A banner over the card, optional sparkles and sound, and a longer hold. One shared by every moment. */
function momentBanner(theater, P, spec, S, extendHold) {
  const { cardBox } = theater;
  if (!cardBox || cardBox.querySelector('.first-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'first-banner moment-' + spec.id + (spec.position === 'middle' ? ' pos-middle' : spec.position === 'bottom' ? ' pos-bottom' : '');
  const main = document.createElement('span');
  main.className = 'first-main';
  main.textContent = spec.text;
  const sub = document.createElement('span');
  sub.className = 'first-sub';
  sub.textContent = spec.sub;
  banner.append(main, sub);
  // The stylesheet is the first-ever look; only what differs from it is written inline.
  const defaultBg = JSON.stringify(spec.bg) === JSON.stringify(MOMENT_DEFAULT_BG);
  if (!defaultBg) {
    banner.style.background = spec.bg.length > 1 ? 'linear-gradient(100deg, ' + spec.bg.join(', ') + ')' : spec.bg[0];
    banner.style.backgroundSize = '220% 100%';
    banner.style.borderColor = spec.bg[0];
  }
  banner.style.color = spec.textColor;
  main.style.fontSize = spec.textSize + 'px';
  applyTextFont(banner, spec.font, P);
  if (PREVIEW) { banner.dataset.edit = 'banner'; banner.title = 'Click to edit the moment banner'; }
  cardBox.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add('on'));
  if (spec.sparkles > 0) {
    const fx = Object.assign({}, P);
    fx['variant.' + spec.variant + '.sparkleCount'] = spec.sparkles;
    fx['variant.' + spec.variant + '.sparkleColor'] = spec.sparkleColor;
    burstSparkles(cardBox, fx, spec.variant, S);
    setTimeout(() => burstSparkles(cardBox, fx, spec.variant, S), 650 / S);
  }
  if (spec.sound) playAudio(spec.sound, Math.min(1, spec.vol * spec.volume));
  extendHold(spec.hold * 1000);
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
    font:            textFontId(P, strip ? pv(P, 'reveal.stripFont', 'inherit') : pv(P, 'collection.cardFont', 'inherit')),
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
      applyTextFont(q, opts.font);
      div.appendChild(q);
    }

    if (count > 1 && opts.showCounts) {
      const badge = document.createElement('div');
      badge.style.cssText = 'position:absolute;bottom:1px;right:1px;background:rgba(0,0,0,0.8);color:#f59e0b;font-weight:700;padding:0 2px;border-radius:2px;line-height:1.4;pointer-events:none;font-size:' + Math.max(7, Math.round(7 * k)) + 'px;';
      badge.textContent = '×' + count;
      applyTextFont(badge, opts.font);
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
//  THEATER FACTORY. Each draw gets its own DOM clone
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
  'rip-slice': { pack: ['ripSlicePack', 3.6, 'ease'], tear: ['ripSliceTear', 3.6, 'ease'], card: ['ripSliceCard', 3.6, 'ease'], reveal: 2.4, info: 2.6, label: 2.8, sounds: true },
  'rip-explode': { pack: ['ripExplodePack', 3.2, 'ease'], tear: ['ripExplodeTear', 3.2, 'ease'], card: ['ripExplodeCard', 3.2, 'ease'], reveal: 1.9, info: 2.1, label: 2.3, sounds: true },
  drop:        { pack: null, tear: null, card: ['revealDrop', 1.2, 'ease'], reveal: 0.6, info: 1.0, label: 1.2, sounds: false },
  spin:        { pack: null, tear: null, card: ['revealSpin', 1.5, 'ease'], reveal: 1.0, info: 1.3, label: 1.5, sounds: false },
  impact:      { pack: null, tear: null, card: ['revealImpact', 1.0, 'cubic-bezier(.2,.8,.2,1)'], reveal: 0.4, info: 0.8, label: 1.0, sounds: false },
  deal:        { pack: null, tear: null, card: ['revealDeal', 1.1, 'ease-out'], reveal: 0.7, info: 1.0, label: 1.1, sounds: false },
};

// The light burst behind a revealed card is per variant (see the Variants editor).
function burstSpec(P, variant) {
  const g = (s, d) => pv(P, 'variant.' + variant + '.' + s, d);
  return {
    on:      g('burst', true),
    opacity: g('burstOpacity', 0.85),
    size:    g('burstSize', 1),
    rays:    Math.max(3, Math.round(g('burstRays', 8))),
    speed:   g('burstSpeed', 4),
  };
}
// Rebuilds the rays (the template ships eight) and sets their spacing and the burst's size.
function buildRays(radialContainer, spec) {
  radialContainer.innerHTML = '';
  for (let i = 0; i < spec.rays; i++) {
    const ray = document.createElement('div');
    ray.className = 'fade-square';
    ray.style.setProperty('--i', String(i));
    radialContainer.appendChild(ray);
  }
  radialContainer.style.setProperty('--ray-step', (360 / spec.rays) + 'deg');
  radialContainer.style.scale = String(spec.size);
}

function rgba(hex, a) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

function setAnim(el, spec, speed, delay) {
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = spec ? spec[0] + ' ' + (spec[1] / speed) + 's ' + spec[2] + ' ' + (delay || 0) + 's forwards' : 'none';
}

const gotText = (P, user) => String(pv(P, 'reveal.gotText', '{user} got:')).split('{user}').join(user || 'Someone');
const showText = (P, user, ctx) => String(pv(P, 'show.text', '{user} is showing off:')).split('{user}').join(user || 'Someone')
  .split('{username}').join(user || 'Someone').split('{cardName}').join(ctx && ctx.cardName ? ctx.cardName : '').split('{variant}').join(ctx && ctx.variant ? VARIANT_LABELS[ctx.variant] || ctx.variant : '');

// Show off (Overlay Editor -> Show off): the show-off settings folded into the properties the shared drawing code already reads,
// so the card, effects and print pill need no show-off branches of their own. At the defaults nothing changes.
function showOffProps(P, variant) {
  const O = Object.assign({}, P);
  O['reveal.cardScale'] = pv(P, 'reveal.cardScale', 1) * pv(P, 'show.cardScale', 1);
  if (pv(P, 'show.glow', 'inherit') === 'off') O['variant.' + variant + '.glow'] = false;
  if (pv(P, 'show.sparkles', 'inherit') === 'off') O['variant.' + variant + '.sparkles'] = false;
  if (!pv(P, 'show.showPrint', true)) O['reveal.showSerial'] = false;
  const fmt = pv(P, 'show.printFormat', 'inherit');
  if (fmt !== 'inherit') O['reveal.serialFormat'] = fmt;
  return O;
}
// The label pill's own wording is set by the caller; this applies its on/off, colours, size and nudge.
function styleShowLabel(el, P) {
  if (!pv(P, 'show.showLabel', true)) { el.style.display = 'none'; return; }
  if (pv(P, 'show.ownLabelLook', false)) {
    el.style.background = pv(P, 'show.labelColor', '#f1bb06');
    el.style.color = pv(P, 'show.labelTextColor', '#fffefe');
  }
  el.style.fontSize = pv(P, 'show.labelSize', 14) + 'px';
  applyTextFont(el, pv(P, 'show.labelFont', 'inherit'), P);
  const x = pv(P, 'show.labelX', 0), y = pv(P, 'show.labelY', 0);
  // The Overlay Editor's own move of this label (the pack opening's "showlabel" part) adds to the nudge above.
  el.style.translate = 'calc(' + x + 'px + var(--el-showlabel-x, 0px)) calc(' + y + 'px + var(--el-showlabel-y, 0px))';
  el.style.scale = 'var(--el-showlabel-s, 1)';
  el.style.filter = 'var(--el-showlabel-f, none)';
}
const headingText = (P, user) => String(pv(P, 'collection.headingText', "{user}'s collection:")).split('{user}').join(user || 'Someone');

function holoOn(P, variant, card, cfg) {
  const mode = pv(P, 'variant.' + variant + '.holoMode', variant === 'reverse' || variant === 'shiny' || variant === 'golden' ? 'on' : 'auto');
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

  wrapper.classList.remove('variant-reverse', 'variant-full', 'variant-shiny', 'variant-golden');
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
  st.setProperty('--pack-size', String(pv(P, 'reveal.packScale', 1)));
  buildRays(theater.radialContainer, burstSpec(P, variant));
  st.setProperty('--label-size', pv(P, 'reveal.labelSize', 14) + 'px');
  applyTextFont(cardLabel, pv(P, 'reveal.labelFont', 'inherit'), P);
  applyTextFont(userText, pv(P, 'reveal.gotFont', 'inherit'), P);
  applyTextFont(cardInfoOverlay.querySelector('.card-name'), pv(P, 'reveal.nameFont', 'inherit'), P);
  theater.mainCard.querySelectorAll('.card-number-1, .card-number-2').forEach(e => applyTextFont(e, pv(P, 'reveal.cardNumberFont', 'inherit'), P));
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

  // Show-off (chat command): a card the viewer owns, pinned by the server. Nothing is rolled or saved.
  const show = opts.show || null;
  const pick = pickPackAndCard(show ? { cardNumber: show.cardNumber, variant: show.variant } : opts);
  if (!pick) {
    showAlert('No cards available. Check your active season has packs with cards.');
    activeDraws--;
    setTimeout(processCardQueue, 1000);
    return;
  }

  const { card, variant, packName, packId } = pick;
  const P = show ? showOffProps(effectiveProps(packId), variant) : effectiveProps(packId);
  const S = Math.max(0.25, pv(P, 'reveal.speed', 1));

  // A first-ever moment with its own entrance style has to know the serial number before the reveal starts, so that pull
  // is saved first and played when the server has answered (a fraction of a second; nothing changes while the style is "inherit").
  if (!show && !opts.dry && opts.ticket && !opts._pre && !PREVIEW && !opts.moment
      && pv(P, 'reveal.firstEver', true) && pv(P, 'moment.firstEver.style', 'inherit') !== 'inherit') {
    const prior = revealedCardsByUser[user].slice();
    const entry0 = encodeEntry(card.number, variant);
    revealedCardsByUser[user].push(entry0);
    saveCollection({ username: user, cardNumber: card.number, entry: entry0, variant, cardName: card.name, stars: card.stars, packName, ticket: opts.ticket })
      .then(r => drawCard(username, Object.assign({}, opts, { _pre: { r: r || null, prior } })));
    return;
  }
  const pre = opts._pre || null;
  const prior = pre ? pre.prior : revealedCardsByUser[user];

  // Which special moment (if any) this pull plays. A forced one (editor preview, test panel) plays whatever its switch says.
  const forcedMoment = MOMENT_IDS.indexOf(opts.moment) !== -1 ? opts.moment : null;
  const momentOn = momentEnabled(P);
  const earlyFacts = {
    firstEver: !!(pre && pre.r && pre.r.serial === 1) || (!!opts.dry && opts.sampleSerial === 1),
    firstForViewer: prior.length === 0,
    isNew: !show && !prior.some(e => decodeEntry(e).cardNumber === card.number),
  };
  const earlyMoment = show ? null : (forcedMoment || pickMoment(earlyFacts, momentOn));
  const momentStyle = earlyMoment ? pv(P, momentKey(earlyMoment, 'style'), 'inherit') : 'inherit';
  // A variant can override the pack opening's style (e.g. Shiny always rips the pack).
  const variantStyle = pv(P, 'variant.' + variant + '.style', 'inherit');
  let R = REVEALS[variantStyle !== 'inherit' ? variantStyle : pv(P, 'reveal.style', 'classic')] || REVEALS.classic;
  if (momentStyle !== 'inherit' && REVEALS[momentStyle]) R = REVEALS[momentStyle];
  if (show) { R = REVEALS[pv(P, 'show.style', 'drop')]; if (!R || R.pack) R = REVEALS.drop; }
  const D = pv(P, 'reveal.startDelay', 0);   // seconds to wait before anything happens
  const at = sec => (sec * 1000) / S + D * 1000;
  // Test panel "quick" mode shortens the on-screen time so many draws can be reviewed fast.
  const cfg = DEV.quick ? Object.assign({}, pick.cfg, { cardTime: Math.min(pick.cfg.cardTime, 1.5), cooldownTime: 0.2 }) : pick.cfg;
  // Full Art, Full Art Holo and Golden use the card's full-art image when it has one; Regular and Reverse use the base art.
  const isFullArt = (variant === 'full' || variant === 'shiny' || variant === 'golden') && card.fullArt;
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
    for (const s of PACK_SOUNDS) phaseTimer(() => playAudio(s.src, vol), s.delay / S + D * 1000);
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

  const owned = show ? true : prior.some(e => decodeEntry(e).cardNumber === card.number);
  applyLook(theater, P, variant, card, cfg, owned);
  paintCard(theater, card, art, isFullArt ? card.fullArtThumb : card.thumb);

  // Flip reveal: a card back (the pack's cover) sits over the art until the card turns edge-on.
  if (R.back) {
    const back = document.createElement('div');
    back.className = 'card-back';
    back.style.backgroundImage = "url('" + cfg.packageImage + "')";
    mainCard.appendChild(back);
    // reveal.flipBack = design: the pack's designed back instead of its cover (also for the show-off flip). No design or no size: the cover stays.
    if (pv(P, 'reveal.flipBack', 'cover') === 'design' && BACKS[packId]) mountDesignBack(back, BACKS[packId]);
    setAnim(back, ['flipBack', R.card[1], 'linear'], S, D);
  }

  // Animations
  if (R.pack) { setAnim(packageContainer, R.pack, S, D); setAnim(tearBorder1, R.tear, S, D); }
  setAnim(cardBox, R.card, S, D);
  const fx = mainCardAnimation(P, variant, S, R.reveal + D * S, false);
  mainCard.style.animation = fx.anim;
  wrapper.style.setProperty('--fx-start', fx.start + 's');
  const tilt = tiltAnimation(P, variant, S, fx.start);
  if (tilt) cardBox.style.animation = cardBox.style.animation + ', ' + tilt;

  // Card reveal sound + radial burst
  phaseTimer(() => {
    const so = show ? pv(P, 'show.sound', 'on') : 'on';
    if (so === 'custom') { const u = String(pv(P, 'show.soundUrl', '')); if (u) playAudio(u, Math.min(1, vol * pv(P, 'show.volume', 1))); }
    else if (so !== 'off') playAudio(card.soundUrl || `assets/sounds/${card.number}.mp3`, show ? Math.min(1, cardVol * pv(P, 'show.volume', 1)) : cardVol);
    if (pv(P, 'variant.' + variant + '.sparkles', false)) burstSparkles(cardBox, P, variant, S);
    const burst = burstSpec(P, variant);
    if (burst.on) {
      radialContainer.style.opacity   = String(burst.opacity);
      radialContainer.style.animation = 'spinRadial ' + (burst.speed / S) + 's linear infinite';
    }
  }, at(R.reveal));

  // Label
  phaseTimer(() => {
    cardLabel.style.opacity    = '1';
    cardLabel.style.visibility = 'visible';
    // The serial the server gave this copy (the reply is normally in long before the label shows).
    saved.then(r => {
      if (r && r.serial) showSerial(theater, P, { n: r.serial, mult: r.serialMult || 1, uid: r.uid || 0 });
      if (show) return;
      // A real pull the server did not confirm plays no moment (nothing was recorded); dry runs and the preview use what they know.
      if (!r && !opts.dry && !forcedMoment) return;
      const facts = {
        firstEver: !!(r && r.serial === 1),
        firstForViewer: r && r.firstForViewer !== undefined ? !!r.firstForViewer : earlyFacts.firstForViewer,
        isNew: r && r.isNew !== undefined ? !!r.isNew : earlyFacts.isNew,
      };
      const id = forcedMoment || pickMoment(facts, momentOn);
      if (id) momentBanner(theater, P, momentSpec(P, id, { username: user, cardName: card.name, variant, vol: cfg.soundVolume }), S, extendHold);
    });
  }, at(R.label));

  // User text
  phaseTimer(() => {
    cardInfo.style.opacity   = '1';
    cardInfo.style.transform = 'scale(1)';
    userText.textContent     = show ? showText(P, username, { cardName: card.name, variant }) : gotText(P, username);
    if (show) styleShowLabel(userText, P);
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

  if (show) miniList.style.display = 'none';
  else {
    buildMiniList(miniList, prior, card.number, cfg, listOpts(P, true));
    if (listOpts(P, true).perRow > 0) wrapper.style.maxWidth = 'none';
  }

  const entry = encodeEntry(card.number, variant);
  let saved = Promise.resolve(null);
  // Dry runs (test panel) show the draw but leave the collection, activity log and webhooks alone.
  if (show) {
    // A shown card is never saved: the server already checked it and sent the serial of the viewer's copy.
    saved = Promise.resolve(show.serial ? { serial: show.serial, serialMult: show.serialMult || 1, uid: show.uid || 0 } : null);
  } else if (pre) {
    saved = Promise.resolve(pre.r);   // already saved before the reveal (see the first-ever style above)
  } else if (!opts.dry) {
    revealedCardsByUser[user].push(entry);
    saved = saveCollection({ username: user, cardNumber: card.number, entry, variant, cardName: card.name, stars: card.stars, packName, ...(opts.ticket ? { ticket: opts.ticket } : {}) });
  } else if (!PREVIEW) {
    // Test panel (dry run): nothing is saved, so show a sample serial to see how the badge looks.
    const n = opts.sampleSerial || 1 + Math.floor(Math.random() * 30);
    saved = Promise.resolve({ serial: n, serialMult: n <= 20 ? 1 + 2 * (1 - (n - 1) / 20) : 1, uid: 1000000 + 1 + Math.floor(Math.random() * 90000) });
  }

  // Hide + cleanup. The hold can be extended (a first-ever pull stays up longer) until it has run out.
  const holdFor = show ? pv(P, 'show.hold', 6) * 1000 : cfg.cardTime * 1000;
  const showDuration = at(R.label) + 800 + holdFor + pv(P, 'variant.' + variant + '.holdExtra', 0) * 1000;
  const startedAt = Date.now();
  let hideAt = startedAt + showDuration;
  let hideTimer = null;
  const hide = () => {
    radialContainer.style.opacity   = '0';
    radialContainer.style.animation = 'none';
    wrapper.classList.add('hid');
    setTimeout(() => {
      wrapper.remove();
      if (EDITOR) tlEnd();
      activeDraws--;
      setTimeout(processCardQueue, cfg.cooldownTime * 1000);
    }, 500);
  };
  hideTimer = phaseTimer(hide, showDuration);
  if (EDITOR) tlBegin(showDuration, { reveal: at(R.reveal) / 1000, label: at(R.label) / 1000, info: at(R.info) / 1000 });
  function extendHold(ms) {
    if (!hideTimer || Date.now() >= hideAt) return;
    phaseClear(hideTimer);
    hideAt += ms;
    hideTimer = phaseTimer(hide, Math.max(0, hideAt - Date.now()));
  }
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
  applyTextFont(userText, pv(P, 'collection.headingFont', 'inherit'), P);
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

/** Chat "show off a card": `ev` = { cardNumber, variant, serial?, serialMult?, uid? } already checked by the server. */
function queueShowCard(username, ev) {
  cardQueue.push(() => drawCard(username, { show: ev }));
  processCardQueue();
}

function queueCollection(username, opts) {
  cardQueue.push(() => showCollection(username, opts));
  processCardQueue();
}


// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
// The server refused the overlay: the browser source URL has no (or an old) key. Say so on the overlay itself, now and then.
let keyWarnedAt = 0;
function warnKey() {
  if (Date.now() - keyWarnedAt < 60000) return;
  keyWarnedAt = Date.now();
  showAlert('Overlay key missing or changed: copy the new URL from Settings > OBS Overlay');
}

async function pollWebhookQueue() {
  try {
    const res = await fetch('/api/webhooks/queue');
    if (res.status === 401) { warnKey(); return; }
    if (!res.ok) return;
    const event = await res.json();
    if (!event) return;
    if (event.type === 'pull')       queueDraw(event.username, event.draw ? { packId: event.draw.packId, cardNumber: event.draw.cardNumber, variant: event.draw.variant, ticket: event.id } : undefined);
    else if (event.type === 'collection') queueCollection(event.username);
    else if (event.type === 'card' && event.cardNumber != null) queueShowCard(event.username, event);
  } catch {
    // ignore, overlay keeps working if server is unreachable
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
  }).then(r => (r.ok ? r.json() : null)).then(j => checkReload(j && j.reload)).catch(() => {}); // never let a failed ping affect the overlay
}

// The admin can ask every open overlay to refresh (Overlay Editor). The first heartbeat records the current token; a later
// change reloads the page, but only while nothing is animating or queued, so a pack opening is never cut short.
let reloadBaseline;
function checkReload(token) {
  if (typeof token !== 'number') return;
  if (reloadBaseline === undefined) { reloadBaseline = token; return; }
  if (token !== reloadBaseline && activeDraws === 0 && cardQueue.length === 0) window.location.reload();
}

function startHeartbeat() {
  sendHeartbeat();
  setInterval(sendHeartbeat, 10000);
  // OBS fires these when the stream/recording starts or stops, report the change straight away.
  ['obsStreamingStarted', 'obsStreamingStopped', 'obsRecordingStarted', 'obsRecordingStopped']
    .forEach(name => window.addEventListener(name, sendHeartbeat));
}

document.addEventListener('DOMContentLoaded', async () => {
  if (PREVIEW) {
    // Admin editor preview: fake data only, no heartbeat / queue polling / saving.
    document.getElementById('dev-panel')?.classList.add('hidden');
    await Promise.all([loadLayout(), initSeason()]);
    revealedCardsByUser.preview = ALL_CARDS.slice(0, 10).map(c => c.number);
    showStatic('pack');
    return;
  }
  startHeartbeat(); // first, so "overlay open" shows even if the season fails to load
  await Promise.all([loadLayout(), initSeason()]);
  await loadCollection();
  // widget-dev.js (the test panel) is only loaded under ?dev; elsewhere the panel stays hidden.
  if (typeof initDevPanel === 'function') initDevPanel();
  else document.getElementById('dev-panel')?.classList.add('hidden');
  setInterval(pollWebhookQueue, 2000);
});
