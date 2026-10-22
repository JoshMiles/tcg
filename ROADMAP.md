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
| 38.30 | Card back editor: the same workspace, plus shapes and images, (d) left | Ready | L |
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

### 38.30 Card back editor on the same workspace (Ready, L)
**Decided (user, 2026-10-21):** the card back editor gets the same redesign, so both editors feel like one app. Today it is a full-screen dialog (`CardBackEditor.tsx`, opened by **Edit design** in the pack workspace) with Layers on the left, the canvas in the middle (`card-back/Canvas.tsx`) with the three-size preview, and Properties on the right; undo / redo, but no menu bar, history list, zoom, rulers, status bar or tools.
- **Same shell (from the Overlay Editor):** menu bar (File: Save, Presets, Copy from another pack, Reset to classic, Export PNG; Edit: undo / redo, copy / paste style, Find a setting; View: zoom, fit, rulers, guides, snap, the three-size preview, background; Layer: add text / image / shape, duplicate, group, lock, align / distribute, arrange; Window; Help), tool strip (Move, Hand, Zoom, Text, Shape, Image), contextual options bar, the right panel stack (contextual Properties on top, Layers under it, History / Swatches / Navigator tabs) and the status bar (zoom, pointer X / Y in % of the card and pt, unsaved state). It stays a full-screen view opened from the pack, as now, and keeps its own save action.
- **Contextual Properties:** a selected element shows Layer (position, size, rotation, opacity), Character / Paragraph / Effects (38.12) for text, its kind's own fields (QR, logo, history lines); nothing selected shows the back itself (background, gradient, pattern, edge, alignment) where today's top-level settings live.
- **Shapes and images (with 38.7's model):** the back gets the same Shape tool (rectangle, ellipse, line, polygon, star; fill, gradient, stroke, effects) and free Image layers (Blob upload; the existing logo element stays). Add `shape` and `image` to `ELEMENT_KINDS` with optional fields so saved backs don't change, and draw both in the DOM back and in `lib/card-back-canvas.ts` (share images); the 38.12 parity rule applies. Share the shape and gradient types with the overlay in `lib/shapes.ts`.
- **Keep:** reduced-motion behaviour (the bare editor back keeps `data-flipped="true"`), the stacked layout in the narrow pack panel for the preview card and the **Edit design** button, `MAX_ELEMENTS` / `MAX_TEXT_BOXES` (raise them only with the canvas renderer checked), every saved back reading back unchanged (`scripts/check-card-back.mts`).
- **Order:** splits (a) shell, (b) contextual Properties and (c) tools, zoom, rulers, status bar are done. Left: (d) shapes and images, DOM and canvas. Update the card back editor part of `docs/serials.md` in each.

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

**Build order for the track:** 38.30 → 38.17 to 38.28 in any order.

**Not planned:** real-time co-editing, plugin / script actions, filters on card art (the card art is the pack's job), uploading font files.

## Track 39: the site on a phone (2026-10-22)

Goal: on a phone (and in the home-screen app from Track 35) the site feels like an app, not a shrunken desktop page. Today `SiteNav` shows the page links only at `xl`; below that they sit behind a burger menu at the top, which is a long thumb reach, and nothing accounts for the iPhone notch or home indicator. Read `docs/public-site/basics.md` (the `SiteShell` / `SiteNav` part) first. One PR per item, each from `origin/main`. Rules for the whole track: desktop (`xl` and up) looks exactly as it does now; icons from `Icon.tsx`, no emoji; nothing in `public/twitch-panel/*` (panel freeze); check every change at 375 px wide and in the installed app (`display: standalone`) on the local seeded site.

### 39.7 Swipe gestures (Needs a decision, M)
Candidates: swipe left / right between cards in the card detail dialog and between binder pages; pull to refresh in the installed app (which has no browser reload button). **User decides** which, if any; each must keep a button route for people who don't swipe and respect `prefers-reduced-motion`.

**Build order for the track:** 39.7.

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
