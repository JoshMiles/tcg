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
| 36.1 | Overlay Editor: select and drag in one mode | Ready | M |
| 36.2 | Overlay Editor: element layers (per-element placement) | Ready | L |
| 36.3 | Overlay Editor: Layers panel | Ready (after 36.2) | M |
| 36.4 | Overlay Editor: on-canvas handles and smaller polish | Ready (after 36.2) | M |
| 36.5 | Overlay Editor: a font on every text layer | Ready | M |
| 34 | Next extension version (34.1 to 34.8) | Blocked (panel freeze) | L |

Tracks 25 to 33 are done and archived in `docs/archive/roadmap-history.md`, including the edition / print glossary (25.2) and the 29.3 decision.

## Track 35: home-screen app (2026-10-20)

Production checked on 2026-10-20: `/apple-touch-icon.png` serves the opaque 180 px cheese mascot (200, `image/png`), the head has one plain `apple-touch-icon` link, the manifest icons serve, and the middleware matcher skips dotted paths, so the closed gate never touches icons. The "C" is iOS's letter fallback, meaning the phone didn't take the icon when the app was added, or kept an old failure. The server side is already right, so 35.1 starts on the device. Read `docs/public-site.md` (install topic) first. One PR per item.

### 35.1 iPhone icon still a "C" (Ready, S)
1. **Diagnose on the phone first (user, with a Mac):** iPhone Settings > Apps > Safari > Advanced > Web Inspector on, plug into the Mac, Safari > Develop > the iPhone. Open `cheesytcg.app`, open the Network tab, then Share > Add to Home Screen. Note whether `/apple-touch-icon.png` is requested and what comes back. Also note the iOS version, and whether "Open as Web App" was on.
2. **Give the icon a new URL.** Copy the PNG to `public/apple-touch-icon-v3.png` and point `metadata.icons.apple` (`app/layout.tsx`) at it. iOS caches per URL and clearing Website Data doesn't always clear it, but a new filename forces a fresh fetch. Keep the root `apple-touch-icon.png` and `-precomposed.png` (iOS probes those by name). Don't use a `?v=` query (see the layout comment).
3. **Cover iOS 26 using the manifest.** Add a 180 px `purpose: 'any'` entry (the same PNG) to `app/manifest.ts`, so a web app added from the manifest gets the mascot too.
4. Delete `app/apple-icon.png`. `metadata.icons` switches it off (the head has no link to it), so it is a dead third copy. Update the layout comment that names it.
5. Verify: `npm run verify`, then check the head and each URL on the preview deploy. The user then removes the app, clears Website Data and adds it again (see the user step below). Close this item once the mascot shows.

### 35.2 Launch screen on iPhone (Ready, S)
- iOS shows a white flash on launch with no `apple-touch-startup-image`. Add startup images for the common iPhone sizes: the mascot centred on `#0a0f1e`, made once with a script into `public/splash/` and listed in `metadata.appleWebApp.startupImage` with media queries. No runtime generation.
- Leave `statusBarStyle: 'black'` as it is. `black-translucent` would need safe-area padding on every page.

### 35.3 Richer Android install (Ready, S)
- Add 2 or 3 `screenshots` (phone size, `form_factor: 'narrow'`) to the manifest so Chrome shows the bigger install sheet. Take them from the seeded local site (`docs/local-dev.md`), never production data with real usernames.

Not planned: offline caching of pages or data. `public/sw.js` deliberately caches only the offline page so nobody sees stale cards or scores.

## Track 36: Overlay Editor layers (2026-10-20)

Goal: every visible part of the overlay is a layer you can click, drag and size on the canvas, like a design tool, without switching to a separate Layout mode. Today only two things move (`layout.pack` and `layout.collection`, each a `Placement`), the Layout category puts a drag surface over the iframe that blocks click-to-select, and everything inside a view (label, bar, "got:" line, strip, serial pill, moment banner, collection heading) sits where the CSS puts it. Read `docs/overlay.md` (layout, properties, editor) first. One PR per item; 36.1 can ship alone.

### 36.1 Select and drag in one mode (Ready, M)
- Drop the full-canvas drag surface (`PreviewStage.tsx`, `onPointerDown` in `OverlayEditorContext.tsx`). Instead the widget (preview only) handles pointer events on `[data-edit]` elements: pointerdown selects (the existing `select` message), a drag past 3 px sends `{ type: 'drag', target, dx, dy }` in design pixels (the iframe already knows its fit). The editor maps the target to its view (`card`/`label`/... → `pack`, `collection`/`heading` → `collection`) and moves that view's `Placement` with the existing snap and undo coalescing.
- Selection is shown in the iframe: a solid outline and a small name tag on the selected element (hover keeps the dashed one). The editor sends `{ type: 'selected', target }` so the outline follows selections made from the panel too.
- Arrow keys nudge the selected thing whenever the canvas has focus (not only in Layout); Esc clears selection. The Layout category stays for stage size, presets and numeric X/Y/size, but no longer changes how the canvas behaves.
- Keep the rule: preview mode never touches the queue, heartbeat or collections.
- Verify: drag the pack and the collection in the editor against the mock KV, undo/redo a drag, `npm run verify`.

### 36.2 Element layers (Ready, L)
- **Data:** add `elements?: Partial<Record<ElementId, Placement>>` to each view's placement in `OverlayLayout` (`lib/overlay-layout.ts`). `ElementId` is a fixed list matching the `data-edit` tags: pack view `card`, `label`, `bar`, `got`, `strip`, `serial`, `banner`; collection view `heading`, `grid`. Offsets are relative to the element's normal spot (its CSS position), so empty = today's look and nothing migrates. `sanitizeLayout()` drops unknown ids and clamps (offset within the stage, scale 0.25 to 3). Scenes get it for free because they carry a whole layout.
- **Widget:** `applyLayout()` writes `--el-<id>-x/-y/-s` on the theater wrapper; each element reads them through the standalone `translate` and `scale` properties (same trick as `.is-pack`), so they stack with the reveal keyframes' `transform`. Elements inside `.main-card` (label, serial, banner) move relative to the card, so they still ride its entrance animation. Check every reveal style and the show-off still look right with moved elements.
- **Editor:** dragging an element (36.1) moves that element's placement; dragging with Shift (or selecting the view in the Layers panel) moves the whole view. Per-element reset and "reset all elements".
- **Decided (user, 2026-10-20):** element positions are global plus per scene only, never per pack (the Layers panel and handles are hidden in pack scope, like Layout). The show-off reuses the pack opening's element positions.
- Add a `scripts/check-overlay.mts` case: an old layout reads back with no elements, unknown ids are dropped, values clamp.

### 36.3 Layers panel (Ready after 36.2, M)
- A Layers list in the properties dock (`PropertiesDock.tsx`), above the category content: the two views as groups with their elements under them. Click selects (same path as a canvas click, opens that element's settings section), hover highlights it in the preview, an eye toggle hides it (`reveal.showLabel` etc. where a switch already exists, so hiding is a real setting, not a separate flag), a dot marks moved elements, and a reset icon per row.
- No reordering or z-index in this item: the stacking is fixed by the animation. Revisit only if someone asks.

### 36.4 On-canvas handles and polish (Ready after 36.2, M)
- Corner handles on the selected element or view resize it (its `scale`, aspect kept); a small readout shows X, Y and size while dragging.
- Snap to the stage centre and edges and to other elements' edges, with the guide line drawn while snapping (Alt = free, as now).
- Right-click on a layer: Reset position, Center, Copy position to other scenes.
- Show a short first-use hint on the canvas ("Click anything to edit it, drag to move it"), dismissed for good once closed (localStorage).
- Update `docs/overlay.md` (layout and editor sections) to describe layers.

### 36.5 A font on every text layer (Ready, M)
Independent of 36.1 to 36.4. Like a design tool's character panel: select any text and pick its font.
- **One catalogue:** reuse `BACK_FONTS` / `FONT_OPTIONS` (`lib/card-back.ts`, `lib/overlay-props.ts`) and the widget's `FONT_CATALOG` + `applyTextFont()`. No new fonts, no weight or size controls in this item.
- **Overlay font:** a new global property `text.font` (default `display`, so today's look), in the Text or General group. It is the font every text layer uses unless the layer picks its own.
- **Per layer:** every visible text element gets a `<group>.font` select (card label, "got:" line, bar text, serial pill, moment banners, show-off label, collection heading and counters, and any other text the widget draws; list them from `widget.js`). Options are `Overlay font` (value `inherit`, the new default) followed by `FONT_OPTIONS`. The three existing keys (`reveal.labelFont`, `show.labelFont`, `<moment>.font`) switch their default to `inherit` too; saved values stay as they are, so nothing migrates. Same scope rules as the group each key sits in (pack override where the group already allows it).
- **Widget:** `applyTextFont(el, id)` resolves `inherit` to `text.font` before applying; call it for every text layer where the layout is applied and on preview updates.
- Verify: change the overlay font and one layer's font in the editor against the mock KV and see both update live; old saved props read back unchanged; `npm run verify`; update `docs/overlay.md` (properties).

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
