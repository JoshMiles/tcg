# Twitch extension submission pack

Everything needed to submit **The Cheesy TCG** panel extension for review: the image assets in this folder, the text for every
form field, and a pre-flight checklist. Copy the text blocks as they are.

## 1. Image assets (in this folder)

| File | Size | Where it is used |
|------|------|------------------|
| `icon-100.png` | 100 x 100, opaque | Extension icon (Discover page and the extension's detail page) |
| `discovery-300x200.png` | 300 x 200, opaque | Discovery image (Featured section of the Discovery page) |
| `screenshots/01-collection.png` | 1024 x 768 | Screenshot: the collection grid |
| `screenshots/02-card-detail.png` | 1024 x 768 | Screenshot: a card's odds, editions and worth |
| `screenshots/03-stats.png` | 1024 x 768 | Screenshot: points, rank and what to upgrade |
| `screenshots/04-leaderboard.png` | 1024 x 768 | Screenshot: the season leaderboard |
| `screenshots/05-trades.png` | 1024 x 768 | Screenshot: trading with other viewers |

Upload the icon and discovery image, then all five screenshots in that order. Each screenshot keeps blank margins at the left and right
edges so the carousel arrows don't cover anything.

**About the sizes.** Twitch's own documentation does not list them. These come from a third-party submission guide (Muxy: icon
100 x 100, discovery image 300 x 200 and not transparent, screenshots 1024 x 768, at least three assets). The Developer Console shows
the current requirements when you upload, so check them there and tell me if anything has changed.

The icon is the mascot with a cheese-wedge badge, the same artwork as the website's home-screen icon. No Twitch logo, Glitch or Twitch
emotes are used anywhere in the assets (Twitch's branding rules).

## 2. The version assets zip (Asset Hosting)

Twitch hosts the extension's front end itself: you upload a zip under the extension version's **Asset Hosting**, and the files are then served from Twitch's domain (`https://<client id>.ext-twitch.tv`) under a strict Content Security Policy. Build the zip with:

```bash
node scripts/build-twitch-package.mjs        # twitch-extension/dist/cheesy-tcg-panel-v<version>.zip
```

It is generated (and gitignored), so rebuild it whenever the panel changes. The current build, version 0.0.2, is `cheesy-tcg-panel-v0.0.2.zip`: 8 files, 46.6 KB zipped (about 170 KB unzipped). What goes in it (all at the root of the zip):

| File | What it is |
|------|------------|
| `panel.html`, `mobile.html`, `video_component.html` | The three views |
| `config.js` | Holds the site address (`https://cheesytcg.app`): the API and the card art live there |
| `panel.js`, `trades.js` | The panel's code |
| `panel.css`, `views.css` | Styles |

How it differs from what the site serves at `/twitch-panel/`:

- No site analytics script and no fake Twitch helper (Twitch only allows its own helper script and the files in the zip).
- No inline scripts or inline event handlers (Twitch's CSP blocks them), everything referenced by a relative path.
- `config.js` points at the site, so every API call and card image goes to `https://cheesytcg.app` (cross-origin). The site answers those calls with CORS headers, but only for Twitch's extension domain (`middleware.ts`), so **this change must be deployed to production before the hosted version can load any data**.
- The Terms and Privacy links are absolute.

The build refuses to produce a zip that breaks these rules, and `npx tsx scripts/check-twitch-package.mts` covers them (it also proves the zip reads back correctly and that the CORS answers are right).

**Using it:** upload the zip in the Developer Console (extension version, Asset Hosting), set the viewer paths to the file names `panel.html`, `mobile.html` and `video_component.html` (just the names, not URLs), and move the version to **Hosted Test** to try it on your channel. Make sure the allowlists in section 3 are filled in, because they only take effect on Twitch's servers and the hosted version cannot reach the API without them. Twitch caches hosted files, so after uploading a new zip give it a minute and hard-refresh.

## 3. Form fields

**Version:** `0.0.2` (the previous submission was 0.0.1, never approved). The version number is `PANEL_VERSION` in `public/twitch-panel/panel.js`, shown in the panel's footer as `v0.0.2` and used to name the zip. It is separate from the website's version.

**Official extension name** (40 characters max, can't contain "extension" or "twitch")

```
The Cheesy TCG
```

**Short description / summary** (140 characters max)

```
Collect trading cards pulled live on stream. Browse your collection, upgrade duplicates, trade with viewers and climb the leaderboard.
```

**Extension details** (1,024 characters max)

```
The Cheesy TCG is a collectible card game played live on Cheesygidds' channel. Packs are opened on stream and every card you pull goes into your collection.

Use this panel to:
- See every card you own, its version (Reverse Holo, Full Art, Full Art Holo, Golden) and each numbered edition, with favourites
- Open any card for its pull odds, how many exist and what it is worth
- Check your points, rank, achievements and what you can upgrade next
- Upgrade duplicates into rarer versions and use trainer cards
- Trade editions with other viewers
- Follow the season leaderboard

Log in once with Twitch to link your account. The panel asks you to share your Twitch identity and only uses your Twitch username. Your collection also appears on the website, cheesytcg.app, where it works like a binder you can customise and share. Links to the website are marked with an arrow.

A fan-made game for this channel, not affiliated with Twitch. Cards are virtual, for fun, and have no cash value.
```

**Category:** pick the closest general category in the console (Games, or Entertainment / Fun if offered). No specific game category.

**Support email:** the address in `LEGAL_CONTACT_EMAIL` (it is also shown on the Privacy Policy). Fill it in before submitting.

**Privacy policy URL:** `https://cheesytcg.app/privacy`
**EULA / terms URL:** `https://cheesytcg.app/terms`

**Views (viewer paths)**

| View | Hosted version (the zip) | Testing Base URI (served by the site) |
|------|--------------------------|---------------------------------------|
| Panel | `panel.html` | `https://cheesytcg.app/twitch-panel/panel.html` |
| Mobile | `mobile.html` | `https://cheesytcg.app/twitch-panel/mobile.html` |
| Video - Component | `video_component.html` | `https://cheesytcg.app/twitch-panel/video_component.html` |

Turn on the Mobile and Video - Component views on the Capabilities page before entering their paths.

**Capabilities:** enable **Request identity link** (the panel calls `requestIdShare`). Leave **Has Chat** off. The extension does not use Bits.

**Allowlists** (generic shared-host domains are not accepted, so use the specific store URL)

| Field | Value |
|-------|-------|
| Allowlist for URL Fetching Domains | `https://cheesytcg.app` |
| Allowlist for Image Domains | `https://cheesytcg.app` and your Vercel Blob store URL, `https://<store id>.public.blob.vercel-storage.com` (Vercel, Storage, your Blob store; the id is in `BLOB_STORE_ID`). Card art uploaded in the admin is served from there. |
| Allowlist for Media Domains | `https://cheesytcg.app` (the panel plays no audio, but the field is required) |
| Allowlist for Panel URLs | `https://cheesytcg.app/` (the panel opens the viewer's profile, binder, edition and trade pages, the FAQ, Terms and Privacy on the site; without this Twitch may block those links) |

**Review channel:** `https://www.twitch.tv/cheesygidds`. This is a panel-only extension, so the channel doesn't need to be live during review.

**Change log (this version)**

```
Version 0.0.2, since 0.0.1:
- Editions: your collection lists every numbered edition of a card first, with its version, serial number, points and a link to its page. Mark favourites.
- Golden: the new top version, pulled from packs and reached by upgrading from Full Art Holo.
- Trainer cards: use one from the panel with two taps.
- Trades: choose which editions to give or accept, see when staff reversed a trade, and open any offer on the website.
- Stats: achievements, and links to your binder and share page. Cards have a Looking for toggle.
- Streamer, admin and mod badges next to names on the leaderboard and in trades.
- Links that open the website now show an arrow. A token refresh no longer sends you back to Collection.
```

**Source code / walkthrough guide**

```
The panel is plain HTML, CSS and JavaScript with no build step or minification (public/twitch-panel/: panel.html, mobile.html,
video_component.html, panel.js, trades.js, panel.css, views.css, config.js). The repository is public: https://github.com/JoshMiles/tcg.
The hosted zip is made by "node scripts/build-twitch-package.mjs", which only copies those files, drops the site's analytics script and
the local test helper, and sets the site address in config.js. The panel talks only to https://cheesytcg.app/api/twitch/*. Season,
leaderboard and public collection reads need no token; everything that acts for a viewer (login, stats, upgrades, trainer cards,
favourites, Looking for, trades) carries the Extension JWT in the Authorization header, and the server verifies it with the extension
secret and takes the viewer from the token, never from the request body.

Trade notes: trading needs a linked Twitch account (the identity share), so every offer and note is tied to a named viewer. A note is
optional, plain text only (shown as text, never as markup or a link) and cut to 140 characters. There is no word filter. It is shown
only to the person an offer is sent to, or on the public board for a listing. The streamer, admins and moderators can see every offer
in the mod panel (Trades), cancel any open offer (the offered cards go straight back), reverse a completed trade, and bar a viewer from
trading (they can then neither make nor receive offers). Viewers report a note or an offer to the streamer or moderators in the channel
or through the contact address on the Terms page, and staff act on it from the mod panel.
```

**Testing instructions**

```
1. Install the extension on a test channel and open its panel (or open the Mobile view).
2. Press "Login with Twitch" and accept the "share your identity" prompt. The panel shows your collection.
3. Collection tab: browse the card grid, filter by Have / Missing, and click a card for its details (odds, editions out there, what it is worth). "Your editions" comes first: tap an edition for its details and the Favourite heart. "Look for" marks a card you want.
4. Stats tab: your points, rank, achievements and which cards you can upgrade. Open a card from "Ready to upgrade" to upgrade it. A trainer card shows "Use trainer card" in its details.
5. Trades tab: browse the open board and press "+ New offer" to make one (on a card you hold spares of, "Choose editions" picks which ones go in it). Links marked with an arrow open the website in a new tab.
6. Board tab: the season leaderboard, with streamer, admin and mod badges.
A fresh account has no cards because cards are pulled live on stream. A test account with cards is set up for review (see below), so every screen has content.
```

## 4. Before you submit

- [ ] Production is deployed with the current `main` (the panel files are served from `https://cheesytcg.app`; Twitch caches the old JS for a short while after a deploy).
- [ ] `TWITCH_EXTENSION_SECRET` is set in Vercel (Production), is the extension's base64 secret and was copied after the last rotation.
- [ ] `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL` and `LEGAL_GOVERNING_LAW` are set in Vercel so the Privacy Policy and Terms name a real operator and a way to get in touch (Settings, Environment shows what is set). Redeploy after changing them.
- [ ] Give the review account some cards so every screen has content (several editions of some cards, one trainer card, a Golden if you can): Admin, Users, the reviewer's Twitch name, Grant. If you don't know the reviewer's name, put a test Twitch account's login in the testing instructions and grant that account cards instead.
- [ ] The CORS change (`middleware.ts`) is deployed to production, then build the zip, upload it under Asset Hosting and try the version in **Hosted Test** on your channel (log in, open a card, check the images load).
- [ ] In Hosted Test, check the small person icon beside your name in the footer draws. It is a CSS mask built from a `data:` SVG, which Twitch's Content Security Policy may block; if it is missing, tell me before submitting. (The Golden sheen is masked by the card's own image, so it is not affected.)
- [ ] Set **Allowlist for Panel URLs** to `https://cheesytcg.app/` (section 3) and click a profile, binder and edition link in Hosted Test to prove they open.
- [ ] Upload the icon, the discovery image and the five screenshots from this folder, and paste the text above.
- [ ] Check the Capabilities page: panel view on, Mobile and Video - Component enabled if you filled their paths, Request identity link on.
- [ ] Open the three viewer paths in a normal browser tab. They should load (blank or a login prompt outside Twitch is fine; an error page is not).
- [ ] The Terms and Privacy Policy mention the extension (they do, see `app/terms` and `app/privacy`).

## 5. Making the assets again

The icon and discovery image are generated:

```bash
node scripts/make-twitch-assets.mjs     # twitch-extension/icon-100.png and discovery-300x200.png
node scripts/make-pwa-icons.mjs         # the website's home-screen icons (same artwork)
```

The screenshots are real captures of the panel, framed on a branded 1024 x 768 backdrop. To redo them after the panel changes:

1. Run the app against the mock database (see docs/local-dev.md) and seed a sandbox with a rich viewer, a crowd and some board listings: `npx tsx scripts/seed-twitch-screenshots.mts` (prints the sandbox id).
2. Start the dev server (`npx next dev -p 3111`; add `--webpack` from a git worktree, where Turbopack cannot follow the `node_modules` junction). Sign in as admin (`POST /api/auth/login`) and set the signed `tcg_sandbox` cookie for the sandbox from step 1 (`signSandboxId` in `lib/sandbox-token.ts`, with `SESSION_SECRET` set), which is what "enter the sandbox" does in the browser.
3. Capture with headless Chrome driven over the DevTools Protocol, so each shot is one lossless 1024 x 768 image (no browser pane, no stitching): `chrome.exe --headless=new --remote-debugging-port=9333 --hide-scrollbars`, then over its WebSocket set the two cookies (`Network.setCookie`), `Emulation.setDeviceMetricsOverride` to 1024 x 768 at scale 1, and load a stage page: the branded backdrop (dark gradient, rainbow top bar, mascot, headline and one line of copy at the left) with the panel in an iframe at 318 x 500, scaled 1.35x, at left 520 / top 47, from `/twitch-panel/panel.html?mock=1&as=cheesyfan&share=1`. Serve the stage from another localhost port (same site, so the cookies are sent).
4. Per shot, drive the panel by running JavaScript in the iframe's execution context: Collection (mark one edition a favourite first, through the card details), Onesiegidds' card details, the Stats tab, the Board tab, the Trades tab. Show the production version label (`v0.0.2`; the dev server would add its environment name). Before capturing, wait for the real content (no "Loading..."), `finish()` every finite animation and `pause()` the infinite ones (`document.getAnimations()`), then `Page.captureScreenshot`. Read each image: real content, no error text, the off-site arrow showing on links.
5. `npx tsx scripts/check-twitch-assets.mts` checks the sizes. Stop the dev server and the mock KV, and delete `.env.local`, before committing.
