# The Cheesy TCG, roadmap

**Last updated 2026-10-22**

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
| 38.7 | Overlay Editor: add your own layers, (f) left | Ready | M |
| 38.17 | Overlay Editor: artboards (scenes side by side) | Ready | M |
| 38.18 | Overlay Editor: groups and linked layers | Ready | M |
| 38.19 | Overlay Editor: measure with Alt, status bar | Ready | S |
| 38.20 | Overlay Editor: navigator | Ready | S |
| 38.21 | Both editors: swatches and eyedropper | Ready | S |
| 38.22 | Overlay Editor: anchor point for resize | Ready | S |
| 38.23 | Overlay Editor: real frame-rate meter | Ready | S |
| 38.25 | Overlay Editor: Twitch UI zones | Ready | S |
| 38.26 | Overlay Editor: text readability check | Ready | S |
| 38.27 | Overlay Editor: preset / version thumbnails and compare | Ready | M |
| 38.28 | Overlay Editor: scheduled looks | Ready | M |
| 38.29 | Overlay Editor: workspace redesign, (g) left | Ready | M |
| 38.30 | Card back editor: the same workspace, plus shapes and images | Ready | L |
| 38.31 | Overlay Editor: text formatting in the options bar | Ready | M |
| 39.2 | Mobile: "More" bottom sheet replaces the burger menu | Ready | S |
| 39.4 | Mobile: dialogs and filters as bottom sheets | Ready | M |
| 39.5 | Mobile: touch pass (tap targets, press states, no hover-only controls) | Ready | S |
| 39.6 | Mobile: phone-width sweep of every public page | Ready | M |
| 39.7 | Mobile: swipe gestures | Needs a decision | M |
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

Not planned: offline caching of pages or data. `public/sw.js` deliberately caches only the offline page so nobody sees stale cards or scores.

## Track 38: Overlay Editor, the Photoshop pass (2026-10-21)

Goal: the Overlay Editor works like Photoshop. Track 36 gave it a canvas, layers, drag, corner handles, snapping, undo and a right-click menu; what is still missing is the rest of the habit: a tool strip and the usual shortcuts, panning around a zoomed canvas, a History list, rulers with guides you drag out, a Properties panel for the selected layer, multi-select with align / distribute, locking, and layers you add yourself. Read `docs/overlay.md` (layout, properties, editor) first. One PR per item (or per split named in the item), each from `origin/main`, following the build order at the end of the track.

**Reuse the card back editor.** `app/admin/components/card-back/` (`Canvas`, `Layers`, `Properties`) and `lib/card-back-edit.ts` already do multi-select, lock, show / hide, reorder, duplicate, Add text and `alignElements` / `distributeElements`. Lift what fits into shared code rather than writing it twice; the overlay differs only in that its layers live in an iframe and report their boxes by `postMessage`.

**Rules for the whole track.** Preview mode never touches the queue, heartbeat or collections. Layer edits stay global or per scene, never per pack (handles, Layers and these tools stay hidden in pack scope). Reveal keyframes animate `transform` / `rotate` / `opacity` / `filter`; layer settings use the standalone `translate` / `scale` properties or a wrapper so they stack with them, never the animated property itself. Every new stored field goes through `sanitizeLayout()` with an empty default that equals today's look (no migration), plus a `scripts/check-overlay.mts` case.

### 38.7 Add your own layers (Ready, L)
**Progress:** (a) in #385, (b) in #386, (c) in #392, (d) in #395, (e) bands, order, Show when and fades; `docs/overlay.md` describes them. Left: (f).

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

Not planned: free-floating or re-dockable panels, blend modes, masks, rotating the card itself (its tilt / rock animations own `rotate`).

### 38.29 Workspace redesign (Ready, L)
**Progress:** (a) to (e) shipped in #352 to #357, (f) in #366 (menu bar, status bar, scope tabs, panel stack, contextual Properties, tool strip with 38.1); `docs/overlay.md` describes them. Left: (g).

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

### 38.31 Text formatting in the options bar (Ready, M)
**Decided (user, 2026-10-22):** the text formatting tools move out of Properties into the options bar, which is mostly empty while Properties is getting cluttered. 38.29 (e) planned "Text shows font, size, colour, B / I / U, align" in the options bar but shipped with only the Move / Hand / Zoom options; this item does the text part.
- **When:** the options bar shows the text row while the Text tool is active (it sets the defaults for the next layer placed) or while a text layer is selected: a custom text layer, or a built-in part with wording (label, got, showlabel, banner, heading). Several text layers selected: the row edits them all, showing a mixed state where they differ.
- **What moves (out of Properties, not copied):** font picker, size, colour, B / I / U, horizontal align, vertical align (custom text), and the Highlight tokens switch with its colour. Properties keeps the wording field with its token chips and live result, and the less used Character / Paragraph / Effects settings (tracking, leading, case, gradient, stroke, shadows, glow), so it gets shorter, not split in two.
- **Same data:** the row writes the same `TextPatch` / fields as the panel today, through the same handlers, in global, scene and pack scope exactly as the panel does now; no stored field changes and no migration.
- **Shared:** build the row in `app/admin/components/workspace/` with no overlay imports (fed by props, like `CharacterPanel`), so the card back editor uses it when it moves onto the shell in 38.30.
- **Fit:** the row stays one line at `xl`; below that it wraps or the rarer controls go into a "More" popover. Compact controls (the font picker as a dropdown, size as a number field with a scrub label, colour as a swatch).
- Update `docs/overlay.md` (Editor section). A check-overlay case is only needed if a handler moves into shared code.

### 38.30 Card back editor on the same workspace (Ready, L)
**Decided (user, 2026-10-21):** the card back editor gets the same redesign, so both editors feel like one app. Today it is a full-screen dialog (`CardBackEditor.tsx`, opened by **Edit design** in the pack workspace) with Layers on the left, the canvas in the middle (`card-back/Canvas.tsx`) with the three-size preview, and Properties on the right; undo / redo, but no menu bar, history list, zoom, rulers, status bar or tools.
- **Same shell (from 38.29):** menu bar (File: Save, Presets, Copy from another pack, Reset to classic, Export PNG; Edit: undo / redo, copy / paste style, Find a setting; View: zoom, fit, rulers, guides, snap, the three-size preview, background; Layer: add text / image / shape, duplicate, group, lock, align / distribute, arrange; Window; Help), tool strip (Move, Hand, Zoom, Text, Shape, Image), contextual options bar, the right panel stack (contextual Properties on top, Layers under it, History / Swatches / Navigator tabs) and the status bar (zoom, pointer X / Y in % of the card and pt, unsaved state). It stays a full-screen view opened from the pack, as now, and keeps its own save action.
- **Contextual Properties:** a selected element shows Layer (position, size, rotation, opacity), Character / Paragraph / Effects (38.12) for text, its kind's own fields (QR, logo, history lines); nothing selected shows the back itself (background, gradient, pattern, edge, alignment) where today's top-level settings live.
- **Shapes and images (with 38.7's model):** the back gets the same Shape tool (rectangle, ellipse, line, polygon, star; fill, gradient, stroke, effects) and free Image layers (Blob upload; the existing logo element stays). Add `shape` and `image` to `ELEMENT_KINDS` with optional fields so saved backs don't change, and draw both in the DOM back and in `lib/card-back-canvas.ts` (share images); the 38.12 parity rule applies. Share the shape and gradient types with the overlay in `lib/shapes.ts`.
- **Keep:** reduced-motion behaviour (the bare editor back keeps `data-flipped="true"`), the stacked layout in the narrow pack panel for the preview card and the **Edit design** button, `MAX_ELEMENTS` / `MAX_TEXT_BOXES` (raise them only with the canvas renderer checked), every saved back reading back unchanged (`scripts/check-card-back.mts`).
- **Order:** after 38.29 (a) to (d) and 38.12 (a). Split: (a) shell around today's panels, no behaviour change; (b) contextual Properties; (c) tools, zoom, rulers, status bar; (d) shapes and images, DOM and canvas. Update the card back part of `docs/admin/packs-and-seasons.md` in each.

### More Photoshop habits

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

### 38.25 Twitch UI zones (Ready, S)
Editor-only rectangles marking where the webcam, chat overlay or alerts sit on stream ("Add zone" in the Guides menu, drag to place and size, name it). Shown as a hatched area; snapping avoids them; a warning in Layers when a part overlaps one. Saved per scope in the overlay settings (staff-wide, so every editor sees them), never sent to the widget's live render.

### 38.26 Text readability check (Ready, S)
For each text layer the widget samples the pixels behind it in the still (or the background screenshot) and the editor warns in Layers and the Character panel when contrast is under 3:1, with a one-click "Add outline" or "Add plate" fix (38.8 / 38.12).

### 38.27 Thumbnails and compare (Ready, M)
Saving a preset or version captures a still of the preview (the widget draws its settled still to a canvas, or the editor uses the iframe's own render, at 320 px wide) uploaded to Blob; Presets and the versions list show them. **Compare** picks two versions and shows them side by side (two preview iframes fed each version's values), with Review's list between.

### 38.28 Scheduled looks (Ready, M)
A look (a preset) that switches on at a start time and off at an end (a Halloween stream), set from Presets → Scheduled looks, stored in KV beside season looks. `GET /api/overlay/config` layers the active scheduled look above the season look (pack overrides still win). The overlay reads config once, so the heartbeat's reload token also changes at each start / end (fold the active schedule id into the token) and an idle overlay reloads by itself. Times in the streamer's timezone, shown with it. A `scripts/check-overlay.mts` case for the layering and the token.

**Build order for the track:** 38.7 (d) to (f) → 38.31 → 38.29 (g) → 38.30 → 38.17 to 38.28 in any order.

**Not planned:** real-time co-editing, plugin / script actions, filters on card art (the card art is the pack's job), uploading font files.

## Track 39: the site on a phone (2026-10-22)

Goal: on a phone (and in the home-screen app from Track 35) the site feels like an app, not a shrunken desktop page. Today `SiteNav` shows the page links only at `xl`; below that they sit behind a burger menu at the top, which is a long thumb reach, and nothing accounts for the iPhone notch or home indicator. Read `docs/public-site/basics.md` (the `SiteShell` / `SiteNav` part) first. One PR per item, each from `origin/main`. Rules for the whole track: desktop (`xl` and up) looks exactly as it does now; icons from `Icon.tsx`, no emoji; nothing in `public/twitch-panel/*` (panel freeze); check every change at 375 px wide and in the installed app (`display: standalone`) on the local seeded site.

### 39.2 "More" bottom sheet (Ready, S)
The More tab opens a sheet that slides up from the bottom (with a backdrop; Esc, a tap outside or a swipe down closes it; focus is trapped and returns to the tab). It holds: the account row (avatar, name, rank chip, or **Sign in with Twitch**), then Collectors, Season Stats, FAQ, What's new (`ChangelogLink` with its dot), the staff panel link for staff, Install app (`InstallButton`) and Sign out. Replaces the burger drawer and the phone account dropdown; reuse their existing items rather than copying them. Respects `prefers-reduced-motion` (no slide).

### 39.4 Dialogs and filters as bottom sheets (Ready, M)
Below `md`, the public site's dialogs (card detail, copy / edition pickers, trade composer steps, report and share dialogs) and the filter / sort panels on the Card Dex, binder and Collectors open as bottom sheets (full width, rounded top, a grab handle, swipe down to close, max 90% height with their own scroll) instead of centred boxes. One shared sheet component in `app/components/site/`, used by 39.2 too; desktop keeps today's dialogs. List every dialog it replaces in the PR.

### 39.5 Touch pass (Ready, S)
- Every tappable thing at least 44 × 44 px on phones (icon buttons, chips, pagination, the stars and variant toggles).
- Press feedback (`:active` scale or tint) where only `:hover` exists today, and no control that is only reachable on hover (hover-revealed buttons on card tiles get a visible or long-press route).
- Inputs at 16 px font or larger on phones so iOS doesn't zoom in on focus.

### 39.6 Phone-width sweep (Ready, M)
Run the public-site page sweep (`docs/review.md`) at 375 px and 414 px wide on the seeded local site, then fix what it finds: sideways page scroll, tables (leaderboard, stats, trade history) that should become stacked rows on phones, text cut off, sticky headers stacking with the tab bar. Split into one PR per page group if it grows. List the pages checked in the PR.

### 39.7 Swipe gestures (Needs a decision, M)
Candidates: swipe left / right between cards in the card detail dialog and between binder pages; pull to refresh in the installed app (which has no browser reload button). **User decides** which, if any; each must keep a button route for people who don't swipe and respect `prefers-reduced-motion`.

**Build order for the track:** 39.2 → 39.4 → 39.5 → 39.6 → 39.7.

**Not planned:** a native app, offline pages (see Track 35), a different layout for tablets beyond what falls out of the breakpoints.

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
