# The Cheesy TCG, roadmap

**Last updated 2026-10-21**

Open work only. Owned by the planning model (Opus, see "Model workflow" in `CLAUDE.md`). Execution picks up items marked Ready; Needs design or Needs a decision goes back to planning (or to the user) first. When an item ships, delete it here and make sure its area doc in `docs/` describes the result. Finished items and their original designs are archived in `docs/archive/roadmap-history.md`; read it only when you need the reasoning behind a done item.

**Status legend:** Ready (the design here is enough to build) · Needs design · Needs a decision (the user chooses) · Blocked (waiting on something outside the repo).

## Rules in force

- **Twitch panel freeze (from 2026-10-15).** The extension is under Twitch review. Do not touch `public/twitch-panel/*`, `scripts/lib/twitch-package.mjs`, the behaviour or response shape of `/api/twitch/*`, or the CORS rules in `middleware.ts` until the user lifts it. Panel-worthy ideas go under "Next extension version".
- One feature per PR, branched from up-to-date `origin/main`; every push gets a PR (see "Git and PRs" in `CLAUDE.md`).
- No em dashes, no emoji in the UI, FAQ / Privacy / Terms kept in step (`scripts/check-words.mts`), `npm run verify` before every PR.

## Open items

| # | Item | Status | Size |
|---|------|--------|------|
| 35.1 | iPhone icon still a "C" (code shipped in #330; waits on the user step) | Blocked (user) | S |
| 35.2 | Launch screen on iPhone | Ready | S |
| 35.3 | Richer Android install | Ready | S |
| 38.1 | Overlay Editor: tools, pan and shortcuts | Ready | M |
| 38.2 | Overlay Editor: History panel | Ready | S |
| 38.3 | Overlay Editor: rulers and your own guides | Ready | S |
| 38.4 | Overlay Editor: layer Properties (transform, opacity) | Ready | M |
| 38.5 | Overlay Editor: multi-select, lock, align and distribute | Ready | M |
| 38.6 | Overlay Editor: every part a layer (moment banner) | Ready | S |
| 38.7 | Overlay Editor: add your own layers (text, image) | Needs a decision | L |
| 38.8 | Overlay Editor: text formatting (a Character panel on every text layer) | Ready | L |
| 38.9 | Overlay Editor: better text fields (tokens, preview, checks) | Ready | S |
| 38.10 | Overlay Editor: styled words inside one text (rich text) | Needs a decision | M |
| 38.11 | Font library: more fonts, real weights, a proper font picker | Ready | M |
| 38.12 | Card back editor: full text tool (sizes, fitting, boxes, effects) | Ready | L |
| 34 | Next extension version (34.1 to 34.8) | Blocked (panel freeze) | L |

Tracks 25 to 33 and 36 are done and archived in `docs/archive/roadmap-history.md`, including the edition / print glossary (25.2) and the 29.3 decision.

## Track 35: home-screen app (2026-10-20)

Production checked on 2026-10-20: `/apple-touch-icon.png` serves the opaque 180 px cheese mascot (200, `image/png`), the head has one plain `apple-touch-icon` link, the manifest icons serve, and the middleware matcher skips dotted paths, so the closed gate never touches icons. The "C" is iOS's letter fallback, meaning the phone didn't take the icon when the app was added, or kept an old failure. The server side is already right, so 35.1 starts on the device. Read `docs/public-site.md` (install topic) first. One PR per item.

### 35.1 iPhone icon still a "C" (Blocked on the user step, S)
Steps 2 to 4 shipped in #330 (`apple-touch-icon-v3.png`, the 180 px manifest entry, `app/apple-icon.png` removed). Left: step 1 on the phone and the user step at the bottom; close this once the mascot shows.

1. **Diagnose on the phone first (user, with a Mac):** iPhone Settings > Apps > Safari > Advanced > Web Inspector on, plug into the Mac, Safari > Develop > the iPhone. Open `cheesytcg.app`, open the Network tab, then Share > Add to Home Screen. Note whether `/apple-touch-icon.png` is requested and what comes back. Also note the iOS version, and whether "Open as Web App" was on.
2. **Give the icon a new URL.** Copy the PNG to `public/apple-touch-icon-v3.png` and point `metadata.icons.apple` (`app/layout.tsx`) at it. iOS caches per URL and clearing Website Data doesn't always clear it, but a new filename forces a fresh fetch. Keep the root `apple-touch-icon.png` and `-precomposed.png` (iOS probes those by name). Don't use a `?v=` query (see the layout comment).
3. **Cover iOS 26 using the manifest.** Add a 180 px `purpose: 'any'` entry (the same PNG) to `app/manifest.ts`, so a web app added from the manifest gets the mascot too.
4. Delete `app/apple-icon.png`. `metadata.icons` switches it off (the head has no link to it), so it is a dead third copy. Update the layout comment that names it.
5. Verify: `npm run verify`, then check the head and each URL on the preview deploy. The user then removes the app, clears Website Data and adds it again (see the user step below). Close this item once the mascot shows.

### 35.3 Richer Android install (Ready, S)
- Add 2 or 3 `screenshots` (phone size, `form_factor: 'narrow'`) to the manifest so Chrome shows the bigger install sheet. Take them from the seeded local site (`docs/local-dev.md`), never production data with real usernames.

Not planned: offline caching of pages or data. `public/sw.js` deliberately caches only the offline page so nobody sees stale cards or scores.

## Track 38: Overlay Editor, the Photoshop pass (2026-10-21)

Goal: the Overlay Editor works like Photoshop. Track 36 gave it a canvas, layers, drag, corner handles, snapping, undo and a right-click menu; what is still missing is the rest of the habit: a tool strip and the usual shortcuts, panning around a zoomed canvas, a History list, rulers with guides you drag out, a Properties panel for the selected layer, multi-select with align / distribute, locking, and layers you add yourself. Read `docs/overlay.md` (layout, properties, editor) first. One PR per item, each from `origin/main`, in order; 38.1 to 38.6 stand alone.

**Reuse the card back editor.** `app/admin/components/card-back/` (`Canvas`, `Layers`, `Properties`) and `lib/card-back-edit.ts` already do multi-select, lock, show / hide, reorder, duplicate, Add text and `alignElements` / `distributeElements`. Lift what fits into shared code rather than writing it twice; the overlay differs only in that its layers live in an iframe and report their boxes by `postMessage`.

**Rules for the whole track.** Preview mode never touches the queue, heartbeat or collections. Layer edits stay global or per scene, never per pack (handles, Layers and these tools stay hidden in pack scope). Reveal keyframes animate `transform` / `rotate` / `opacity` / `filter`; layer settings use the standalone `translate` / `scale` properties or a wrapper so they stack with them, never the animated property itself. Every new stored field goes through `sanitizeLayout()` with an empty default that equals today's look (no migration), plus a `scripts/check-overlay.mts` case.

### 38.1 Tools, pan and shortcuts (Ready, M)
- A thin **tool strip** on the left of the canvas: **Move (V)**, the current select / drag; **Hand (H)**, drag pans the canvas; **Zoom (Z)**, click zooms in, Alt+click out. Holding **Space** is a temporary Hand, as in Photoshop. While Hand or Zoom is on, the canvas gets a transparent overlay above the iframe so presses don't reach the widget.
- When zoomed past fit the canvas pans (today it always fits and never scrolls). **Ctrl+wheel** zooms at the pointer, wheel / Shift+wheel pan. **Ctrl+0** fit, **Ctrl+1** 100% (one design px = one screen px), **Ctrl++ / Ctrl+-** step.
- More shortcuts in the existing `keydown` handler (`OverlayEditorContext.tsx`): **Ctrl+S** Save, **Ctrl+D** deselect, **Tab** hides the dock and rail (canvas only), **H** in Layers toggles the selected layer's eye where it has one. Forward them from the iframe like the arrow keys. Never fire while typing in a field.
- A **Keyboard shortcuts** sheet (`?` and a button in the options bar) listing all of them.
- Verify: zoom to 400%, pan with Space, Ctrl+0 back; Ctrl+S saves; shortcuts ignored in a text field.

### 38.2 History panel (Ready, S)
- A collapsible **History** section in the dock under Layers, listing the undo stack newest last ("Move label", "Resize card", "Reveal animation: Flip", "Load version 'Halloween'"), with the saved state as the first row. Click a row to jump there; steps after it grey out until a new edit drops them (Photoshop's model).
- Each undo snapshot gets a short `label`, set where the snapshot is taken (drag, resize, a property change by its `PropDef.label`, reset, load). The 60-step cap and 500 ms coalescing stay.

### 38.3 Rulers and your own guides (Ready, S)
- **Rulers** along the top and left of the canvas in design px (they follow zoom and pan), toggled with **Ctrl+R** and the Guides menu.
- Drag from a ruler to make a **guide**; drag it back off to delete; Guides menu: Clear guides, Lock guides. Snapping (36.4) includes them.
- Guides are an editor aid and are not saved to the overlay: keep them in localStorage per scope (`tcg:overlay-guides:<global|scene:id>`), like the canvas background.

### 38.4 Layer Properties (Ready, M)
- When a layer is selected, the dock shows a **Layer** section at the top (Photoshop's Properties panel): X, Y, size % as number fields for that part's `Placement.elements` entry (or the view's own placement when a view is selected), Reset, and a link "Look settings" that jumps to its category section, as a click does today.
- Add **opacity** (0 to 100%) to element placements: `opacity?: number` in the element entry, clamped, default omitted. Opacity is animated by the reveals, so apply it on a wrapper or through `filter: opacity()` only where `filter` isn't animated on that part; check every reveal style and the show-off with a faded part before shipping.
- Not in this item: rotation. `.main-card` animates `rotate` (tilt, rock); rotating other parts needs the same per-part check and goes in only if the user asks.

### 38.5 Multi-select, lock, align and distribute (Ready, M)
- **Shift+click** (canvas or Layers) adds to the selection; drag, arrows and corner handles move or scale all selected parts as one undo step. Selection state becomes a set; the widget outlines each.
- **Align** (left, centre, right, top, middle, bottom) to the selection, or to the stage when one part is selected, and **Distribute** horizontally / vertically with three or more, in the options bar while something is selected. Offsets are relative to each part's CSS spot, so the widget reports each selected part's on-stage box (`{ type: 'boxes', boxes }`, design px; it already measures them for snapping) and the editor turns the target box into new offsets. Reuse the maths in `lib/card-back-edit.ts`.
- **Lock** per layer (lock icon in Layers): a locked part can't be dragged, nudged or resized on the canvas (clicking still opens its settings). Locks are an editor aid kept in localStorage per scope, not saved to the overlay.

### 38.6 Every part a layer (Ready, S)
- Give the **moment banner** an element id (`banner`, pack view) with its `data-edit` tag, so it can be selected, moved and sized like the rest (docs/overlay.md notes it has none). Check the first-ever / first-pull / new-card banners and the show-off.
- Layers rows show an icon per kind (image, text, group) and the part's name as on the canvas tag. Double-click a row to jump to its settings.

### 38.7 Add your own layers (Needs a decision, L)
Photoshop's core: layers that aren't built in. Proposed: **Add layer** in Layers makes a **Text** layer (text, overlay font list, size, colour, alignment) or an **Image** layer (upload through `ImageUploadField` to Blob, e.g. a logo or a frame). Stored per view in the layout as `custom: CustomLayer[]` (`id`, `kind`, content, `Placement`, `opacity`, `visible`), so scenes carry them and versions snapshot them; at most 8 per view. Text can use `{viewer}`, `{card}`, `{pack}`, `{edition}` (filled by the widget, escaped). Custom layers can be reordered among themselves and put in one of two bands, **behind** or **in front of** the card; built-in parts keep their fixed order. Each one has "Show: always / during the reveal / after the reveal".
**For the user:** (a) is this wanted, (b) text and image only, or shapes too, (c) in both views or the pack opening only.

### 38.8 Text formatting: a Character panel on every text layer (Ready, L)
Today an overlay text layer has a font (36.5) and, for some, a size and colour; nothing else. The card back editor already has the full set (`BackEl` and `Effects` in `lib/card-back.ts`: weight, italic, underline, uppercase, letter spacing, line height, align, colour, opacity, and effects outline, glow, shadow, engrave, gradient text). Give every overlay text layer the same, as one Photoshop-style **Character** block. This replaces the old 38.8 (layer styles) and answers its question: one compact block per layer, not ~12 loose settings each.
- **Which layers:** card label (`reveal.label*`), edition pill and its serial line, corner numbers, name bar, "got:" line, strip ("?" and ×N), show-off label, the three moment banners and their small line, collection heading, collection card text, and custom text layers (38.7) if built. The `#alert` bar and dev panel stay unthemed.
- **Shared model:** use the `TextStyle` and `sanitizeTextStyle()` that 38.12 moves into `lib/text-style.ts`, so the two editors can't drift. Options that need a box the overlay layer doesn't have (height, vertical align, text on a curve) are hidden here, except on custom text layers (38.7).
- **Registry:** a new `PropType` `'textStyle'` (`lib/overlay-props.ts`): one key per layer (`reveal.labelStyle`, `reveal.gotStyle`, `collection.headingStyle`, ...) whose value is a partial `TextStyle`. Defaults are empty = today's look, so nothing migrates. Merging is **field by field** (defaults → global → season look → pack), so a pack can override just the outline colour. The existing font / size / colour keys stay where they are (no migration); the Character block shows them at its top so the user sees one panel. Teach `lib/overlay-diff.ts`, presets, import / export, versions and `scripts/check-overlay.mts` the object value (diff per field, e.g. "Label: outline 2 px → 3 px").
- **Editor:** one `CharacterPanel` component, lifted from the text section of `card-back/Properties.tsx`, used by both editors: font, size, colour on the first row; B / I / U and case as toggle buttons; align segmented; spacing and line height sliders; an **fx** row (outline, glow, shadow, gradient) each with an on switch and its few fields. Layers rows show an `fx` badge when any effect is on, and right-click gains **Copy text style / Paste text style** (to any text layer, across views).
- **Widget:** one `applyTextStyle(el, layerId, P)` beside `applyTextFont`, writing inline `font-weight`, `font-style`, `text-decoration`, `text-transform`, `letter-spacing`, `line-height`, `text-align`, and `text-shadow` / `-webkit-text-stroke` / `background-clip: text` for the effects. Do not set `opacity` or `filter` on the element itself (reveals animate them): fade text through its colour alpha, and put glow in `text-shadow`. Load the font file for the chosen weight (`BACK_FONTS` files are per weight; a missing weight falls back to the nearest).
- **Verify:** each layer with outline + shadow + uppercase in every reveal style, the show-off and the three moments; a pack override of one field; old saved looks unchanged; Review lists field changes; `npm run verify`.
- Split if it runs long: (a) shared model + card back on it, (b) registry type + widget, (c) the panel on every layer.

### 38.9 Better text fields (Ready, S)
The wording fields (label text, "got:" wording, banners, show-off wording, heading) are plain inputs with tokens explained in help text, and the tokens differ: `{user}` in some, `{username}` in others.
- **Tokens:** accept both `{user}` and `{username}` everywhere (the widget already treats them the same in some places; make one `fillTokens()` in `widget.js` used by every text layer), and offer the same set where the data exists: `{user}`, `{cardName}`, `{variant}`, `{pack}`, `{edition}`, `{stars}`. Unknown tokens stay as typed (no silent blanks).
- **Insert chips** under each text field listing its tokens; clicking one inserts it at the caret. Tokens show as highlighted chips inside the field.
- **Live result** under the field ("cheesygidds got:") using the preview's sample viewer and card, and a character count against `maxLength`.
- **Fit warning:** the widget reports when a text layer overflows its box in the still (`scrollWidth > clientWidth`) and the field shows "Too long for this size at 1280×720", with a one-click "Shrink to fit" (lowers that layer's size).

### 38.10 Styled words inside one text (Needs a decision, M)
Photoshop lets one text layer mix styles. Proposed: light markup in any wording field, `**bold**`, `*italic*` and `{color:#ffcc00}word{/color}`, plus an **Accent** style for tokens (e.g. the viewer's name in the pack's accent colour, set in the Character block as "Highlight tokens"). The editor field gets B / I / colour buttons that wrap the selection; the widget parses the markup into spans with `textContent` only (never `innerHTML` from saved text, since wording reaches OBS).
**For the user:** (a) is mixing styles inside one line wanted, or is one style per layer (38.8) enough? (b) if yes, markup only, or just the "highlight tokens" switch, which covers the common case (coloured viewer name) with no markup at all?

Not planned: free-floating or re-dockable panels, blend modes, masks, rotating the card itself (its tilt / rock animations own `rotate`).

**Text work order:** 38.11 (fonts) → 38.12 (card back text tool, which defines the full `TextStyle` in `lib/text-style.ts`) → 38.8 (the same Character panel on overlay text) → 38.9 → 38.10. The user's ask (2026-10-21): the card back's text tool "is too basic, it all needs to be expanded (more fonts, better sizes etc)", and every overlay label and text field gets the same tool.

### 38.11 Font library (Ready, M)
Today `BACK_FONTS` (`lib/card-back.ts`) has 15 faces: 3 site / system ones and 12 self-hosted files, most only 400 and 700, some only 400. The Weight select offers 400 to 900, so 500 / 600 / 800 / 900 silently snap to the nearest file (`loadBackFont`), and there are no italic files (italic is faked by the browser). The overlay shares this list (36.5).
- **More fonts:** grow to about 40 curated OFL faces, self-hosted in `public/fonts/back/` with their licences (no font service at runtime, as now). Fill the gaps by mood: bold display (Anton, Archivo Black, Luckiest Guy, Titan One, Bungee), friendly rounded (Baloo 2, Quicksand, Comfortaa), clean sans (Inter, Montserrat, Poppins, Rubik, Barlow Condensed), serif (Merriweather, Lora, DM Serif Display), fantasy / trading card (Cinzel Decorative, Uncial Antiqua, MedievalSharp, Metamorphous), handwritten / script (Caveat, Permanent Marker, Kalam, Satisfy), tech / game (Rajdhani, Audiowide, Russo One, VT323, Silkscreen). Final list is the builder's call within that spread; keep total font bytes reported in the PR.
- **Real weights and italics:** prefer **variable** woff2 files where the family has one (one file covers 100 to 900, `font-weight` range in the `FontFace` descriptor); otherwise ship each static weight offered. `BackFont` gains `weights: number[]` and `italic?: true`, and the Weight control offers only that font's weights (named: Thin, Light, Regular, Medium, SemiBold, Bold, Black). Existing saved weights a font lacks keep snapping to the nearest, so old designs don't change.
- **Font picker** (shared component, replaces the plain `<select>` in both editors): each font named in its own face with a sample of the layer's actual text, a search box, category tabs (Display, Sans, Serif, Script, Fantasy, Mono / Pixel, Site), **Recently used** and starred **Favourites** at the top (localStorage), and hover previews the font on the canvas before clicking (Photoshop does this).
- **Canvas parity:** `lib/card-back-canvas.ts` (share images) must load and draw the same face and weight; wait for `loadBackFonts` as now.
- `scripts/check-card-back.mts`: every `BACK_FONTS` file exists, every licence exists, an unknown font id falls back.
- **For the user (optional):** uploading your own font file (woff2 to Blob, staff confirm they hold the licence). Not in this item unless asked.

### 38.12 Card back editor: full text tool (Ready, L)
The card back's text controls (`card-back/Properties.tsx`, model `BackEl` / `Effects` in `lib/card-back.ts`) are one font select, size as a bare "Size (%)" number 2 to 30, a 400 to 900 weight select, B / I / U / uppercase, spacing, line height, three aligns, colour, opacity, and one each of outline, glow, shadow, gradient, engrave. Expand it into a full Character + Paragraph panel and move the model into `lib/text-style.ts` so the overlay (38.8) gets the identical tool. Every new field is optional with a default equal to today's render, so saved backs don't change; `sanitize` clamps each one.
- **Sizes:** a size field in **pt** (relative to the printed card, 1 pt = 1/72 in at the card's print size `PRINT_W`; stored as now, shown converted), a slider beside it, and presets (Tiny 6, Small 8, Body 10, Large 14, Title 20, Huge 32). Arrow keys step 0.5, Shift 5. **Auto-fit**: "Shrink to fit" (largest size where the text fits its box, down to a minimum) and "Fit width" (one line spanning the box). The layout code already measures text (`lib/card-back-layout.ts`); fitting lives there so DOM and canvas agree.
- **Text boxes:** free text gets a **height** as well as a width, drag handles for both on the canvas, **vertical align** (top / middle / bottom), **max lines** with an ellipsis, **wrap** on / off, and **padding**.
- **Character:** weight by name (only the font's real weights, 38.11), italic only where the face has it or marked "slanted", underline / **strikethrough** / overline, case (none, UPPER, lower, Title, small caps), letter spacing in thousandths of an em (Photoshop's tracking, -100 to 800), word spacing, line height as a multiple or "auto", **baseline shift** and superscript for one-line tokens, **kerning** auto / off.
- **Paragraph:** align left / centre / right / **justify**, first-line indent, space between paragraphs (texts may contain line breaks).
- **Colour:** solid, **gradient** with 2 to 4 stops and an angle (today: 2 colours), rarity colour and auto (as now), opacity.
- **Effects** (each on / off, several at once, Photoshop's Layer Style list): **stroke** with position outside / centre (canvas `strokeText`, DOM `paint-order: stroke` so outside strokes don't eat the letters), **drop shadow** (colour, angle, distance, blur, opacity; up to 2), **outer glow**, **inner shadow**, **bevel / emboss** (today's engrave becomes its "pressed" preset), and a **background plate** behind the text (colour, padding, corner radius, outline), which makes readable labels on busy patterns.
- **Text on a curve (decide size during build):** "Arc" with a bend from -100 to 100, for curved titles across the top of a back. Canvas draws glyph by glyph; DOM uses an SVG `textPath`. If it doubles the item, ship it as its own PR after the rest.
- **Style presets:** save the current text style under a name ("Gold title", "Fine print") and apply it to any text in either editor; a few built in. Stored in KV beside the card back settings (staff-wide), not per back.
- **Panel layout:** Character and Paragraph as two collapsible sections, Effects as a list with switches (like Photoshop's Layer Style dialog, but docked), every field with a reset dot when changed. Reuse `Num` / `Row` from `Properties.tsx`.
- **Parity is the hard part:** every option must render the same in the DOM back (`FlipCard`, site and overlay) and on the canvas (`lib/card-back-canvas.ts`, share images). Add a `scripts/check-card-back.mts` case per option for sanitize / defaults, and check DOM vs canvas by eye on the editor's export preview for each effect. Watch the reduced-motion learning: the bare editor back must keep `data-flipped="true"`.
- Split into PRs: (a) model to `lib/text-style.ts` + sizes, pt, presets, auto-fit; (b) boxes, wrapping, paragraph; (c) character extras + gradient stops; (d) effects + background plate; (e) style presets; (f) text on a curve.

### Ideas for Track 38 (Needs a decision: the user picks, then each becomes a numbered item)
Recommended first are marked ★. Sizes are rough.

**Safety (the editor can lose work today)**
- ★ **Save conflict guard (S).** Two staff editing at once: the second Save silently overwrites the first. Send the loaded version id with Save; if `overlay:versions` has a newer one, refuse and offer Review / Overwrite / Load theirs.
- ★ **Unsaved draft recovery (S).** Only a `beforeunload` warning exists. Keep the unsaved state in localStorage per scope (debounced) and offer "Restore unsaved changes from 14:02?" on open; cleared on Save or Revert.

**Photoshop habits**
- ★ **Timeline scrubber (M).** Photoshop / After Effects style: pause the reveal at any moment and scrub it, instead of only Play. The preview can drive `document.getAnimations()` (`pause()`, `currentTime`); the widget sequences phases with 15 `setTimeout`s, so the first version scrubs within the reveal phase, and a second pass moves the phase timings onto one clock. Makes tuning start delays, label timing and variant effects far quicker.
- **Artboards (M).** Show every scene side by side on the canvas (landscape and vertical) and click one to edit it, like Photoshop artboards, instead of switching scope.
- **Groups and linked layers (M).** Link label + serial + bar so they move together; collapse groups in Layers. Builds on 38.5's multi-select.
- **Measure with Alt (S).** Alt+hover over another layer shows the gap in px between it and the selected one (Photoshop's distance readout); a status bar shows pointer X / Y in design px.
- **Navigator (S).** A mini-map of the stage while zoomed in; drag its box to pan (after 38.1).
- **Swatches and eyedropper (S).** A Swatches row on every colour field: the active packs' accent colours, the site theme and recently used colours; an eyedropper button using the browser's `EyeDropper` (Chromium only, hidden elsewhere) to pick from the preview or the background screenshot.
- **Anchor point for resize (S).** A 9-point reference in the Layer section (38.4), so scaling grows from the centre or a corner instead of the CSS origin.

**Overlay-specific**
- ★ **Stream rehearsal (S).** "Play a stream": queue 5 dry pulls in the preview back to back with the real cooldowns and a mix of variants, packs and a moment, to judge pacing. Preview only; nothing saved.
- **Real frame-rate meter (S).** Measure frames in the preview with `requestAnimationFrame` during Play and show the worst stretch next to the load rating (a real number on the staff member's own machine, still not OBS).
- **Paste a screenshot as background (XS).** Ctrl+V an OBS screenshot onto the canvas as the background (today: a file picker). Never saved, like now.
- **Twitch UI zones (S).** Optional guide overlays for where a webcam box, chat overlay or alerts usually sit, set once per scene as editor-only rectangles, so layers can be kept clear of them.
- **Text readability check (S).** Warn in Layers when a text layer's colour is low contrast against its own background or the canvas background screenshot.
- **Preset and version thumbnails (M).** Capture a still of the preview when saving a preset or version, and show thumbnails in the Presets and versions lists, plus side-by-side compare of two versions.
- **Scheduled looks (M).** Season looks exist; add a look that switches on at a date and time (a Halloween stream) and back after, through the same config layering.

**Not suggested:** real-time co-editing, plugin / script actions, filters on card art (the card art is the pack's job).

## Blocked by the Twitch panel freeze

Nothing in a Ready item edits the frozen paths listed under "Rules in force".

### Track 34: next extension version (Blocked until the freeze lifts)

All of it ships as one reviewed panel version. Every item edits `public/twitch-panel/panel.js`, so run them **one at a time** in the order below, each its own PR from `origin/main`; the version is submitted only after 34.8. Read `docs/twitch-extension.md` first. Rules for the whole track: never rename or remove a JSON key on `/api/twitch/*` (the released panel keeps working against new responses until viewers update); new data goes in new fields; reuse the website's existing APIs and `lib/` helpers rather than copying logic into the panel.

**34.1 Collection security (Ready once lifted, S).** `GET /api/twitch/collection` takes `username` and returns that viewer's card numbers for every season, drafts included, with no session, extension JWT or private-profile check. Drop draft seasons; for a private profile return cards only when the caller is that viewer (extension JWT via `verifyExtensionAuth`, or a website session); keep `{ username, collections: [{ seasonId, seasonName, active, ownedNumbers }] }`. Public profiles answer without a token so old panels still load. Make the new panel send its `Authorization` header. Check: private profile without a token gets no cards; drafts never appear.

**34.2 Edition words (Ready once lifted, XS).** Panel copy says "print" for a card copy; switch to "edition" and "serial number" (glossary 25.2), and "collected" / "pulls" for counts (Track 37).

**34.3 Golden (Ready once lifted, M).** Was 29.5. Turn `GOLDEN_PULLS` on; packs opt in with a Golden weight (default 0). Teach the panel and its CSS the five-id list and index 4. `/api/twitch/upgrade` understands a step up to Golden. Overlay already knows Golden (29.1, 29.4).

**34.4 Trainer card Use (Ready once lifted, S).** Was 30.4. A Use button next to Upgrade on trainer cards only, through a new field on an existing authenticated route or a new `/api/twitch` route. Same two-tap and consume rules as 30.2.

**34.5 Trades tab (Ready once lifted, M).** Choosing editions when trading (6.4: composer and accept picker, exact serial preview), "Reversed by staff" on reversed trades (9.2), a link to `/trade/<id>`.

**34.6 Collection view (Ready once lifted, M).** Pack card back on flip backs (20.3), favourite editions (9.1: hearts, disabled picks), serial numbers on tiles (2.1), the copies-first dialog (2.5), staff and tester badges.

**34.7 New panel sections (Needs design, L).** Achievements, the binder, Looking for / listing alerts, share images. Planning pass first: which fit a 318px panel, which are a link out to the site instead, and whether this splits into its own panel version.

**34.8 Release (Ready once lifted, S).** Anything Twitch reviewers asked for; bump `version` in `package.json`, rebuild the zip (`scripts/lib/twitch-package.mjs`), refresh screenshots, update the change log in `twitch-extension/SUBMISSION.md`. A new freeze starts at submission.


## Standing decisions

- Paid-pull limits default to no limit and stay editable. Staff can add extra pulls for everyone for the current stream.
- Stars keep setting the card value (29.3); `copyPoints` does not change.
- Trainer cards can be traded until used.
- Collection words (Track 37): collected = different cards of a set, pulls = every pull, edition = one numbered copy.

## User steps still open

Outside the repo; tick off or delete when done (listed as of 2026-10-16).
- [ ] **Overlay key (13.2):** copy the browser-source address (ends `?key=...`) from Settings → OBS Overlay into every OBS browser source, and each scene's address from the Overlay Editor, then refresh the sources. Clear the pull queue first.
- [ ] **Mix It Up paid pulls (Track 12), when wanted:** a Mix It Up webhook command answering `{ "balance": n }` for `action: "balance"` and taking the currency for `action: "deduct"`; then fill in the Mix It Up admin page, press **Check balance** and **Send test message**, and switch it on.
- [ ] **Web Push keys:** set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` the legal contact) in Vercel Production, redeploy, then try a real iPhone (app installed), Android and a desktop browser.
- [ ] **GitHub webhook (3.5):** repo Settings → Webhooks, Payload URL `<discord webhook URL>/github`, events: pushes, pull requests, releases, deployment statuses.
- [ ] **Discord channels:** add the channels you want in Admin → Settings → Webhooks (Trade listings, Admin log, System, Recap, Feedback) and press Test on each.
- [ ] **Share-image channel (26.6):** create the Discord channel, paste its webhook under Admin → Settings → Webhooks, tick Shares, and press Test. The button on the share tab does nothing until this exists.
- [ ] **Card name (25.3):** in the pack workspace, rename the live card Bottomygidds to Bottomgidds. The seed fix does not rewrite production.
- [ ] **Print bonus cutoff (27.4):** after that PR is deployed, open Admin → Settings → Scoring and set the cutoff to 40 if the saved value is still 20, then save. The new default does not overwrite a saved value, and scores move when you save.
- [ ] **iPhone icon (1.1, 7.1, 35.1):** after 35.1 deploys, remove the home-screen app, delete `cheesytcg.app` under Settings > Apps > Safari > Advanced > Website Data, add it again from Safari; confirm the cheese logo shows.
- [ ] **Discord DM alerts (4.4):** create a Discord application and bot, invite the bot to the Cheesygidds server, add the redirect `https://cheesytcg.app/auth/discord/callback` in the Discord developer portal, and set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and `DISCORD_BOT_TOKEN` in Vercel. The option stays hidden until then.
