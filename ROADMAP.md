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
| 35.3 | Richer Android install | Ready | S |
| 38.1 | Overlay Editor: tools, pan and shortcuts | Ready | M |
| 38.2 | Overlay Editor: History panel | Ready | S |
| 38.3 | Overlay Editor: rulers and your own guides | Ready | S |
| 38.4 | Overlay Editor: layer Properties (transform, opacity) | Ready | M |
| 38.5 | Overlay Editor: multi-select, lock, align and distribute | Ready | M |
| 38.6 | Overlay Editor: every part a layer (moment banner) | Ready | S |
| 38.7 | Overlay Editor: add your own layers (text, image, shape) | Ready | L |
| 38.8 | Overlay Editor: text formatting (a Character panel on every text layer) | Ready | L |
| 38.9 | Overlay Editor: better text fields (tokens, preview, checks) | Ready | S |
| 38.10 | Overlay Editor: styled words inside one text (rich text) | Ready | M |
| 38.11 | Font library: more fonts, real weights, a proper font picker | Ready | M |
| 38.12 | Card back editor: full text tool (sizes, fitting, boxes, effects) | Ready | L |
| 38.15 | Overlay Editor: timeline scrubber | Ready | M |
| 38.16 | Overlay Editor: stream rehearsal | Ready | S |
| 38.17 | Overlay Editor: artboards (scenes side by side) | Ready | M |
| 38.18 | Overlay Editor: groups and linked layers | Ready | M |
| 38.19 | Overlay Editor: measure with Alt, status bar | Ready | S |
| 38.20 | Overlay Editor: navigator | Ready | S |
| 38.21 | Both editors: swatches and eyedropper | Ready | S |
| 38.22 | Overlay Editor: anchor point for resize | Ready | S |
| 38.23 | Overlay Editor: real frame-rate meter | Ready | S |
| 38.24 | Overlay Editor: paste a screenshot as background | Ready | XS |
| 38.25 | Overlay Editor: Twitch UI zones | Ready | S |
| 38.26 | Overlay Editor: text readability check | Ready | S |
| 38.27 | Overlay Editor: preset / version thumbnails and compare | Ready | M |
| 38.28 | Overlay Editor: scheduled looks | Ready | M |
| 38.29 | Overlay Editor: workspace redesign (menu bar, panels, contextual Properties) | Ready | L |
| 38.30 | Card back editor: the same workspace, plus shapes and images | Ready | L |
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

Goal: the Overlay Editor works like Photoshop. Track 36 gave it a canvas, layers, drag, corner handles, snapping, undo and a right-click menu; what is still missing is the rest of the habit: a tool strip and the usual shortcuts, panning around a zoomed canvas, a History list, rulers with guides you drag out, a Properties panel for the selected layer, multi-select with align / distribute, locking, and layers you add yourself. Read `docs/overlay.md` (layout, properties, editor) first. One PR per item (or per split named in the item), each from `origin/main`, following the build order at the end of the track.

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

### 38.7 Add your own layers (Ready, L)
Photoshop's core: layers that aren't built in. **Decided (user, 2026-10-21):** text, image **and shape** layers, in both views (pack opening and collection).
- **Adding:** the Text (T), Shape (U) and Image tools in the tool strip (38.29) and **Add layer** in Layers. Click on the canvas places one; drag draws it at that size.
- **Text:** a box with wording and the full Character / Paragraph / Effects panel (38.8, 38.12), including box height, vertical align and styled words (38.10). Tokens are 38.9's set (`{user}`, `{cardName}`, `{variant}`, `{pack}`, `{edition}`, `{stars}`), filled by the widget with `textContent` only.
- **Image:** upload through `ImageUploadField` to Blob (a logo, a frame); fit (contain / cover / stretch), corner radius, opacity, effects (shadow, glow, stroke). URLs checked to be Blob or same-site on save.
- **Shape:** rectangle (corner radius per corner or linked), ellipse, line (end caps, arrowheads), polygon and star (sides 3 to 12, inner radius). Fill: none, solid, or a gradient (linear / radial, 2 to 4 stops, the same gradient editor as text); stroke: colour, width, dash, position inside / centre / outside; effects: drop shadow, outer glow (the shared `Effects`). Shift while drawing keeps proportions. Rendered by the widget as an inline SVG sized to its box, so it scales cleanly at any stage size. Shapes are what make plates behind text, bars, frames and dividers.
- **Data:** stored per view in the layout as `custom: CustomLayer[]` (`id`, `kind: 'text' | 'image' | 'shape'`, `name`, kind-specific fields, a box `{ x, y, w, h }` in design px plus `rotate`, `opacity`, `visible`; locks stay an editor aid as in 38.5), so scenes carry them and versions snapshot them; at most 16 per view. `sanitizeLayout()` validates every field and drops unknown kinds; an absent `custom` is today's look. Global or per scene, never per pack, like other layer edits.
- **Order:** custom layers reorder freely among themselves (drag in Layers, Ctrl+[ / Ctrl+]) and sit in one of two bands, **behind the card** or **in front of it**; built-in parts keep their fixed order between the bands. Each has **Show: always / during the reveal / after the reveal** (pack view) and an optional fade in / out.
- **Free transform:** custom layers (unlike built-in parts) get side handles for width / height, a rotate handle (Shift = 15° steps), and the 9-point anchor (38.22). Rotation is safe here because no reveal keyframe animates these wrappers.
- **Editing:** duplicate (Ctrl+J, Photoshop's), copy / paste between views and scenes, rename by double-click in Layers, delete.
- Split: (a) data, sanitize, widget render for all three kinds, Add / delete; (b) the Text tool and text panel; (c) the Shape tool, fill / stroke / effects; (d) the Image tool; (e) bands, ordering, "Show when", fades; (f) free transform. `scripts/check-overlay.mts` cases for each kind's sanitize and the 16 cap.

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

### 38.10 Styled words inside one text (Ready, M)
Photoshop lets one text layer mix styles. **Decided (user, 2026-10-21):** wanted, both parts below. Light markup in any wording field, `**bold**`, `*italic*` and `{color:#ffcc00}word{/color}`, plus an **Accent** style for tokens (e.g. the viewer's name in the pack's accent colour, set in the Character block as "Highlight tokens"). The editor field gets B / I / colour buttons that wrap the selection; the widget parses the markup into spans with `textContent` only (never `innerHTML` from saved text, since wording reaches OBS). Ship "Highlight tokens" first (no markup needed, covers the coloured viewer name), then the markup and buttons. The card back text boxes get the same markup through the shared text code (DOM spans and canvas runs). Fit and ellipsis (38.9, 38.12) measure the styled runs, not the raw string.

Not planned: free-floating or re-dockable panels, blend modes, masks, rotating the card itself (its tilt / rock animations own `rotate`).

**Text work order:** 38.11 (fonts) → 38.12 (card back text tool, which defines the full `TextStyle` in `lib/text-style.ts`) → 38.8 (the same Character panel on overlay text) → 38.9 → 38.10. The user's ask (2026-10-21): the card back's text tool "is too basic, it all needs to be expanded (more fonts, better sizes etc)", and every overlay label and text field gets the same tool.

### 38.11 Font library (Ready, M)
Today `BACK_FONTS` (`lib/card-back.ts`) has 15 faces: 3 site / system ones and 12 self-hosted files, most only 400 and 700, some only 400. The Weight select offers 400 to 900, so 500 / 600 / 800 / 900 silently snap to the nearest file (`loadBackFont`), and there are no italic files (italic is faked by the browser). The overlay shares this list (36.5).
- **More fonts:** grow to about 40 curated OFL faces, self-hosted in `public/fonts/back/` with their licences (no font service at runtime, as now). Fill the gaps by mood: bold display (Anton, Archivo Black, Luckiest Guy, Titan One, Bungee), friendly rounded (Baloo 2, Quicksand, Comfortaa), clean sans (Inter, Montserrat, Poppins, Rubik, Barlow Condensed), serif (Merriweather, Lora, DM Serif Display), fantasy / trading card (Cinzel Decorative, Uncial Antiqua, MedievalSharp, Metamorphous), handwritten / script (Caveat, Permanent Marker, Kalam, Satisfy), tech / game (Rajdhani, Audiowide, Russo One, VT323, Silkscreen). Final list is the builder's call within that spread; keep total font bytes reported in the PR.
- **Real weights and italics:** prefer **variable** woff2 files where the family has one (one file covers 100 to 900, `font-weight` range in the `FontFace` descriptor); otherwise ship each static weight offered. `BackFont` gains `weights: number[]` and `italic?: true`, and the Weight control offers only that font's weights (named: Thin, Light, Regular, Medium, SemiBold, Bold, Black). Existing saved weights a font lacks keep snapping to the nearest, so old designs don't change.
- **Font picker** (shared component, replaces the plain `<select>` in both editors): each font named in its own face with a sample of the layer's actual text, a search box, category tabs (Display, Sans, Serif, Script, Fantasy, Mono / Pixel, Site), **Recently used** and starred **Favourites** at the top (localStorage), and hover previews the font on the canvas before clicking (Photoshop does this).
- **Canvas parity:** `lib/card-back-canvas.ts` (share images) must load and draw the same face and weight; wait for `loadBackFonts` as now.
- `scripts/check-card-back.mts`: every `BACK_FONTS` file exists, every licence exists, an unknown font id falls back.
- **Decided (user, 2026-10-21):** no uploading of your own font files; the curated list only.

### 38.12 Card back editor: full text tool (Ready, L)
The card back's text controls (`card-back/Properties.tsx`, model `BackEl` / `Effects` in `lib/card-back.ts`) are one font select, size as a bare "Size (%)" number 2 to 30, a 400 to 900 weight select, B / I / U / uppercase, spacing, line height, three aligns, colour, opacity, and one each of outline, glow, shadow, gradient, engrave. Expand it into a full Character + Paragraph panel and move the model into `lib/text-style.ts` so the overlay (38.8) gets the identical tool. Every new field is optional with a default equal to today's render, so saved backs don't change; `sanitize` clamps each one.
- **Sizes:** a size field in **pt** (as if printed on a standard 2.5 in wide card, which the editor draws as `PRINT_W` = 260 px; stored as now, shown converted), a slider beside it, and presets (Tiny 6, Small 8, Body 10, Large 14, Title 20, Huge 32). Arrow keys step 0.5, Shift 5. **Auto-fit**: "Shrink to fit" (largest size where the text fits its box, down to a minimum) and "Fit width" (one line spanning the box). The layout code already measures text (`lib/card-back-layout.ts`); fitting lives there so DOM and canvas agree.
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

### 38.29 Workspace redesign (Ready, L)
Today the workspace is an options bar crowded with popovers (scope, Presets, Scenes, Versions, Import / Export, Pack tools, Review, Save options, Guides, undo / redo, Revert / Save; `EditorTopBar.tsx`, `EditorMenus.tsx`), the canvas with a preview toolbar under it (view, show as, moment, pack, card, Play; `PreviewToolbar.tsx`), and one 26rem dock (`PropertiesDock.tsx`) holding Layers on top, then a category rail, search and the category's settings. Settings are found by **category**, not by clicking the thing; Layers is squeezed; there is no status bar. Rearrange it as Photoshop does, so every later item has a fixed home:

```
┌ Menu bar: File  Edit  View  Layer  Scene  Window  Help ─────────────────── Revert  Save ┐
├ Options bar (changes with the tool / selection)                                        ┤
├──┬ Tabs: [Everything] [Scene: Vertical] [Pack: Halloween ×] ───────┬ Properties ───────┤
│T │ ruler                                                           │ (selected layer:  │
│o │ ┌─────────────────────────────────────────────┐                 │  Layer, Character,│
│o │ │                 canvas                      │                 │  Paragraph, fx,   │
│l │ │                                             │                 │  its look settings│
│s │ └─────────────────────────────────────────────┘                 │  / nothing: the   │
│  ├ Timeline: ▶ ■  scrubber  |  View  Show as  Moment  Pack  Card ──┤  categories)      │
│  │                                                                 ├ Layers ───────────┤
│  │                                                                 ├ History│Swatches│ │
│  │                                                                 │ Navigator         │
├──┴ Status: zoom · X,Y · 1280×720 · load ●● · 58 fps · 3 unsaved ───┴───────────────────┤
```

- **Menu bar** replaces the popover row: **File** (Save, Save options, Versions, Import / Export, Revert), **Edit** (Undo / Redo, Copy / Paste style, Pack tools in pack scope, Find a setting Ctrl+F), **View** (zoom, fit, 100%, rulers, guides, snap, artboards, background, Before / after), **Layer** (Add text / image / shape, Duplicate, Group, Lock, Align / Distribute, Reset position), **Scene** (the Scenes list, New scene, Copy position to scenes), **Window** (show / hide each panel, Reset workspace), **Help** (Keyboard shortcuts, the first-use hint again). Each item shows its shortcut. Presets and Season / Scheduled looks go under File → Looks. Review stays one click away as the "3 unsaved" button in the status bar and next to Save.
- **Scope as document tabs** above the canvas: Everything, each scene and each open pack override is a tab (open more from Scene / Pack menus, close with ×), replacing the scope select. Each tab shows a dot when it has unsaved changes.
- **Tool strip** (38.1's Move / Hand / Zoom plus Text, Shape, Image from 38.7) on the left of the canvas.
- **Contextual options bar** under the menu bar, as in Photoshop: Move shows Auto-select, Show transform controls, Align / Distribute (38.5); Text shows font, size, colour, B / I / U, align; Shape shows shape type, fill, stroke, radius; Hand / Zoom show Fit / 100%.
- **Timeline area** under the canvas: the scrubber (38.15) with the preview controls from `PreviewToolbar` in its header (View, Show as, Moment, Pack, Card, Play, Play a stream 38.16). Collapsible to one row.
- **Right column, a stack of collapsible panels:** **Properties** on top is contextual: with a layer selected it shows that layer's Layer (38.4), Character / Paragraph / Effects (38.8) and then **that layer's look settings from the registry** (e.g. selecting the label shows the label's wording, colours, `reveal.label*`), so the category rail is no longer the way in. With nothing selected it shows the document: stage size and presets (today's Layout panel) and the categories (Pack opening timing, Variants, Moments, Show off, Collection) as a list that opens each one, plus Find a setting. Selecting the card opens its Variants picker. **Layers** below takes the remaining height (groups for the two views, custom layers, bands, lock, eye, link). Bottom: **History** (38.2), **Swatches** (38.21) and **Navigator** (38.20) as tabs.
- **Panels:** each collapses to its title bar; the right column is resizable (drag its edge, 20 to 36rem) and panels can collapse to an icon strip, all remembered in localStorage with Window → Reset workspace. Not free-floating (still not planned).
- **Status bar:** zoom, pointer X / Y (38.19), stage size, load rating, frame rate (38.23), unsaved count (opens Review), last saved time and the save-conflict state (38.13).
- **Look:** a tighter, darker workspace (panel headers 28 px, 12 px labels, number fields with drag-to-scrub labels as in Photoshop: drag on a field's label to change its value), the daisyUI `cheesy` colours kept; icons from `Icon.tsx`, no emoji. Below `xl` the right column moves under the canvas as tabs (Properties / Layers / History).
- **Keep:** every existing behaviour and message to the iframe; the auto-collapsed admin sidebar; no page scroll at `xl`.
- **Split, behaviour unchanged until (d):** (a) menu bar + status bar, moving the popovers' contents into menus as is; (b) scope tabs; (c) the right panel stack, Layers full height, History / Swatches / Navigator slots; (d) contextual Properties replacing the rail; (e) tool strip + contextual options bar (with 38.1); (f) timeline area absorbing `PreviewToolbar` (with 38.15); (g) resizable / collapsible panels and the compact look. Update `docs/overlay.md` (Editor section) in each.
- **Build the shell to be shared:** the menu bar, document tabs, tool strip, options bar, panel stack, status bar, History, Swatches, Navigator, `CharacterPanel` and font picker go in `app/admin/components/workspace/` with no overlay imports (the overlay feeds them its state), because the card back editor moves onto the same shell in 38.30.

### 38.30 Card back editor on the same workspace (Ready, L)
**Decided (user, 2026-10-21):** the card back editor gets the same redesign, so both editors feel like one app. Today it is a full-screen dialog (`CardBackEditor.tsx`, opened by **Edit design** in the pack workspace) with Layers on the left, the canvas in the middle (`card-back/Canvas.tsx`) with the three-size preview, and Properties on the right; undo / redo, but no menu bar, history list, zoom, rulers, status bar or tools.
- **Same shell (from 38.29):** menu bar (File: Save, Presets, Copy from another pack, Reset to classic, Export PNG; Edit: undo / redo, copy / paste style, Find a setting; View: zoom, fit, rulers, guides, snap, the three-size preview, background; Layer: add text / image / shape, duplicate, group, lock, align / distribute, arrange; Window; Help), tool strip (Move, Hand, Zoom, Text, Shape, Image), contextual options bar, the right panel stack (contextual Properties on top, Layers under it, History / Swatches / Navigator tabs) and the status bar (zoom, pointer X / Y in % of the card and pt, unsaved state). It stays a full-screen view opened from the pack, as now, and keeps its own save action.
- **Contextual Properties:** a selected element shows Layer (position, size, rotation, opacity), Character / Paragraph / Effects (38.12) for text, its kind's own fields (QR, logo, history lines); nothing selected shows the back itself (background, gradient, pattern, edge, alignment) where today's top-level settings live.
- **Shapes and images (with 38.7's model):** the back gets the same Shape tool (rectangle, ellipse, line, polygon, star; fill, gradient, stroke, effects) and free Image layers (Blob upload; the existing logo element stays). Add `shape` and `image` to `ELEMENT_KINDS` with optional fields so saved backs don't change, and draw both in the DOM back and in `lib/card-back-canvas.ts` (share images); the 38.12 parity rule applies. Share the shape and gradient types with the overlay in `lib/shapes.ts`.
- **Keep:** reduced-motion behaviour (the bare editor back keeps `data-flipped="true"`), the stacked layout in the narrow pack panel for the preview card and the **Edit design** button, `MAX_ELEMENTS` / `MAX_TEXT_BOXES` (raise them only with the canvas renderer checked), every saved back reading back unchanged (`scripts/check-card-back.mts`).
- **Order:** after 38.29 (a) to (d) and 38.12 (a). Split: (a) shell around today's panels, no behaviour change; (b) contextual Properties; (c) tools, zoom, rulers, status bar; (d) shapes and images, DOM and canvas. Update the card back part of `docs/admin/packs-and-seasons.md` in each.

### Safety first (do these before 38.1)


### More Photoshop habits

### 38.15 Timeline scrubber (Ready, M)
Pause the reveal at any moment and scrub it, instead of only Play. A timeline bar under the canvas (play / pause, a scrubber, the time in seconds, markers for each phase: pack, tear, card, label, strip). The preview drives `document.getAnimations()` (`pause()`, `currentTime`) on the iframe document. The widget runs its phases with about 15 `setTimeout`s, so: (a) first PR scrubs within the reveal phase only; (b) second PR moves the preview's phase timings onto one clock (`PREVIEW_CLOCK`, preview mode only; live OBS keeps its timers) so the whole pull scrubs end to end. Variant effects and moments included. Preview only.

### 38.16 Stream rehearsal (Ready, S)
"Play a stream" in the canvas bar: 5 dry pulls back to back with the real `cardTime` / `cooldownTime`, a mix of packs, versions and one special moment, plus a show-off. Uses the editor's existing preview path (fake `preview` user); nothing queued, saved or heard by OBS. Stop button.

### 38.17 Artboards (Ready, M)
A canvas mode showing the global layout and every scene side by side (landscape and vertical, each at its own stage size and scaled to fit), like Photoshop artboards. Click one to make it the edited scope; each is a live iframe still, the selected one playable. Off by default (several iframes cost memory); a View menu toggle.

### 38.18 Groups and linked layers (Ready, M)
Link layers so they move and scale together (chain icon in Layers, stored as `links: ElementId[][]` per view in the layout, editor and widget both ignore unknown ids). Groups collapse in Layers. Built-in default: none linked. Builds on 38.5.

### 38.19 Measure with Alt (Ready, S)
With a layer selected, Alt+hover over another shows the gaps between them in design px (red lines and numbers in the preview, from the boxes 38.5 reports). A status bar under the canvas shows the pointer X / Y in design px and the zoom.

### 38.20 Navigator (Ready, S)
A small mini-map of the stage in the dock while zoomed past fit (after 38.1); its box shows the view, drag it to pan, the slider zooms.

### 38.21 Swatches and eyedropper (Ready, S)
A Swatches row in every colour field in both editors: the active packs' accent colours, the site theme colours, the 8 most recently used (localStorage) and **saved swatches** (staff-wide, KV beside overlay settings). An eyedropper button using the browser's `EyeDropper` API (Chromium only; hidden where missing) to pick any colour on screen.

### 38.22 Anchor point for resize (Ready, S)
A 9-point reference grid in the Layer section (38.4): corner-handle scaling and the size field grow from that point (centre by default for views, the part's CSS origin for parts) by adjusting the offset with the scale. Editor-only; nothing new is stored.

### Overlay helpers

### 38.23 Real frame-rate meter (Ready, S)
During Play the preview counts frames with `requestAnimationFrame` and reports the average and the worst 250 ms stretch; shown beside the load rating. Labelled "on this computer", since OBS's own browser differs.

### 38.24 Paste a screenshot as background (Ready, XS)
Ctrl+V an image (an OBS screenshot) onto the canvas sets it as the background, beside the existing file picker. Never saved, as now.

### 38.25 Twitch UI zones (Ready, S)
Editor-only rectangles marking where the webcam, chat overlay or alerts sit on stream ("Add zone" in the Guides menu, drag to place and size, name it). Shown as a hatched area; snapping avoids them; a warning in Layers when a part overlaps one. Saved per scope in the overlay settings (staff-wide, so every editor sees them), never sent to the widget's live render.

### 38.26 Text readability check (Ready, S)
For each text layer the widget samples the pixels behind it in the still (or the background screenshot) and the editor warns in Layers and the Character panel when contrast is under 3:1, with a one-click "Add outline" or "Add plate" fix (38.8 / 38.12).

### 38.27 Thumbnails and compare (Ready, M)
Saving a preset or version captures a still of the preview (the widget draws its settled still to a canvas, or the editor uses the iframe's own render, at 320 px wide) uploaded to Blob; Presets and the versions list show them. **Compare** picks two versions and shows them side by side (two preview iframes fed each version's values), with Review's list between.

### 38.28 Scheduled looks (Ready, M)
A look (a preset) that switches on at a start time and off at an end (a Halloween stream), set from Presets → Scheduled looks, stored in KV beside season looks. `GET /api/overlay/config` layers the active scheduled look above the season look (pack overrides still win). The overlay reads config once, so the heartbeat's reload token also changes at each start / end (fold the active schedule id into the token) and an idle overlay reloads by itself. Times in the streamer's timezone, shown with it. A `scripts/check-overlay.mts` case for the layering and the token.

**Build order for the track:** 38.13, 38.14 (safety) → 38.29 (a) to (d) (the new workspace, so later items are built into their final home) → 38.1 with 38.29 (e) → 38.2 to 38.6 → 38.15 with 38.29 (f), 38.16 → text work (38.11, 38.12, 38.8, 38.9, 38.10) → 38.7 → 38.29 (g) → 38.30 (after 38.12 (a)) → 38.17 to 38.28 in any order.

**Not planned:** real-time co-editing, plugin / script actions, filters on card art (the card art is the pack's job), uploading font files.

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
