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

It is generated (and gitignored), so rebuild it whenever the panel changes. What goes in it (all at the root of the zip, 8 files, about 40 KB):

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
- See every card you own, with its version (Reverse Holo, Full Art, Full Art Holo) and how many editions you have
- Open any card for its pull odds, how many exist and what it is worth
- Check your points, your rank and what you can upgrade next
- Upgrade duplicates into rarer versions
- Trade editions with other viewers
- Follow the season leaderboard

Log in once with Twitch to link your account. The panel asks you to share your Twitch identity and only uses your Twitch username. Your collection also appears on the website, cheesytcg.app, where it works like a binder you can customise and share.

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

**Review channel:** `https://www.twitch.tv/cheesygidds`. This is a panel-only extension, so the channel doesn't need to be live during review.

**Change log (this version)**

```
Initial release: collection view with card details, stats and upgrades, trading, and the season leaderboard.
```

**Source code / walkthrough guide**

```
The panel is plain HTML, CSS and JavaScript with no build step or minification (public/twitch-panel/panel.html, panel.js, trades.js,
panel.css), served from https://cheesytcg.app/twitch-panel/. It talks only to https://cheesytcg.app/api/twitch/*. Every request carries
the Extension JWT in the Authorization header and the server verifies it with the extension secret.
```

**Testing instructions**

```
1. Install the extension on a test channel and open its panel (or open the Mobile view).
2. Press "Login with Twitch" and accept the "share your identity" prompt. The panel shows your collection.
3. Collection tab: browse the card grid, filter by Have / Missing, and click a card for its details (odds, editions out there, what it is worth).
4. Stats tab: your points, rank and which cards you can upgrade. Open a card from "Ready to upgrade" to upgrade it.
5. Trades tab: browse the open board and press "+ New offer" to make one.
6. Board tab: the season leaderboard.
A fresh account has no cards because cards are pulled live on stream. A test account with cards is set up for review (see below), so every screen has content.
```

## 4. Before you submit

- [ ] Production is deployed with the current `main` (the panel files are served from `https://cheesytcg.app`; Twitch caches the old JS for a short while after a deploy).
- [ ] `TWITCH_EXTENSION_SECRET` is set in Vercel (Production), is the extension's base64 secret and was copied after the last rotation.
- [ ] `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL` and `LEGAL_GOVERNING_LAW` are set in Vercel so the Privacy Policy and Terms name a real operator and a way to get in touch (Settings, Environment shows what is set). Redeploy after changing them.
- [ ] Give the review account some cards so every screen has content: Admin, Users, the reviewer's Twitch name, Grant. If you don't know the reviewer's name, put a test Twitch account's login in the testing instructions and grant that account cards instead.
- [ ] The CORS change (`middleware.ts`) is deployed to production, then build the zip, upload it under Asset Hosting and try the version in **Hosted Test** on your channel (log in, open a card, check the images load).
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
2. Log in to the admin, enter that sandbox (which sets the signed `tcg_sandbox` cookie), and open the panel with the fake Twitch helper (`/twitch-panel/panel.html?mock=1&as=cheesyfan&share=1`) at 318 x 500, scaled 1.35x on a 1024 x 768 stage.
3. The browser pane can only capture 800 x 600, so capture the stage as four lossless tiles (page scrolled to 0,0 / 224,0 / 0,168 / 224,168) with animations frozen, then join them: `node scripts/stitch-screenshot-tiles.cjs <out.png> <a> <b> <c> <d>`. The stitcher takes each pixel from exactly one tile, so animated card art never shows a seam.
