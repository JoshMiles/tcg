# Local development

> Read this when you run the app locally: the mock KV, seeding, logging in, the overlay test panel, website login against the fake Twitch, or the public-site sweep.

## Run the app against a fake database

Never develop against production KV.

1. `node scripts/mock-kv.cjs`, in-memory Upstash REST fake on `:4111`. Data is lost when it stops. `GET /__stats` returns the commands it has served per command name (`?reset` zeroes the counts afterwards), for counting KV reads.
2. Create `.env.local` (gitignored; **delete it when you're done**):
   ```
   KV_REST_API_URL=http://localhost:4111
   KV_REST_API_TOKEN=dev
   KV_URL=redis://dev
   ADMIN_COOKIE_SECRET=testsecret-0123456789
   ADMIN_PASSWORD=pw
   ```
3. `npx tsx scripts/seed-dev.mts`, seeds Season 1 (refuses any non-localhost KV URL).
4. `npm run dev` (or start it through the Claude app's `preview_start` with a `.claude/launch.json` entry running `npx next dev -p 3111`).
5. Log in: `POST /api/auth/login` with `{"password":"pw"}` sets the `admin-auth` cookie (setting `document.cookie` by hand doesn't work: it's httpOnly), then open `/admin`.

Port 4111 (mock KV) and 3111 (dev server) are the conventional test ports; check nothing stale is listening before starting.

## Overlay and its test panel

Open `/overlay.html` (add `?dev` for the test panel; `?preview` is the admin editor's isolated mode). A browser signed in as staff needs no key; anything else (OBS, a clean test browser) needs `?key=<overlay key>` from Settings → OBS Overlay (`getOverlayKey()` locally), or the queue, notify, heartbeat and collection read answer 401. That includes an overlay in a sandbox: use the overlay link on the sandbox's page (`?sandbox=<signed token>&key=<the sandbox's key>`), and `SESSION_SECRET` must be set to enter a sandbox at all.

**Test panel (`?dev`)**: Pack / Card / Variant pickers (blank = random, exactly as a real draw), a count + **Draw**, **All 4 variants** (one card shown Regular → Full Art Holo; random card if none picked), Show Collection, Clear queue, and switches: **Don't save (dry run, on by default)**, Mute, Quick timing (≤1.5s on screen). Keys: **D** draw · **A** all variants · **C** collection · **R/F/S** Reverse / Full Art / Full Art Holo. A pinned variant is shown even where the pack has upgrades off. Reset buttons live in a collapsed Danger zone. Draw options are passed as `queueDraw(username, { packId, cardNumber, variant, dry })`; the panel code lives in `public/widget-dev.js`, which `overlay.html` loads only under `?dev` (OBS never downloads it); the `DEV` object in `widget.js` only changes behaviour when set from the panel.

## Website login against the fake Twitch

Also run `node scripts/mock-twitch.cjs` (fake Twitch on `:4222`) and add to `.env.local`:

```
SESSION_SECRET=any-16+-char-string
TWITCH_CLIENT_ID=x
TWITCH_CLIENT_SECRET=x
TWITCH_ID_URL=http://localhost:4222
TWITCH_API_URL=http://localhost:4222
SITE_URL=http://localhost:3111
```

"Log in with Twitch" then approves instantly as `tester`. `curl "http://localhost:4222/__as?login=other"` changes who the next login becomes, and `/__revoked` shows revoked tokens. `curl "http://localhost:4222/__live?on=1"` (or `0`) makes the fake channel live/offline for the live indicator (the result is cached in KV for ~45s, so delete the `twitch:live` key to see a change immediately). The URL overrides are ignored in production builds.

## Public-site sweep

With the dev server, mock KV (seeded, with some pulls, a listing and `backfillSerials` run) and the fake Twitch running, `node scripts/sweep-public.mjs` loads every public page at 390px and 1280px, signed in and out, and flags horizontal overflow, a missing or duplicate `h1`, images without `alt`, unnamed buttons / links and console errors. It found the stats table overflowing on phones (grid children need `min-w-0` when they hold a scrolling table). Run it after a public-site change. More review tooling is in docs/review.md.

## Measuring page speed

Build and serve production on the seeded mock KV (`npm run build`, then `node node_modules/next/dist/bin/next start --port 3111`; `npx next start -p` fails in Git Bash), turn off ad blockers (AdGuard injects a big script into every page), then run `npx -y lighthouse@12.8.2 http://localhost:3111/<page> --only-categories=performance --throttling-method=devtools --output=json --output-path=<file> --chrome-flags="--headless=new"`. Always pass `--throttling-method=devtools` locally: the default simulated mode overstates LCP when the server answers instantly. Runs vary by a few hundred ms, so compare two per page. `npm run analyze` builds with webpack (`next build --webpack`, the analyzer is a webpack plugin) and writes the JS treemap to `.next/analyze/client.html`; `next build` itself no longer prints bundle sizes. Field numbers (real visitors) come from Speed Insights, through the Vercel MCP.

## The Claude app's browser pane

The built-in browser pane is often **hidden**: `requestAnimationFrame` is paused, CSS background images aren't fetched and animations don't advance, so frame rate and smoothness can't be measured there. Instead scrub animations (`document.getAnimations()` → `pause()`/`currentTime`) and measure bounding boxes, or inspect computed styles. Restore the pane afterwards (`resize_window` preset `desktop`).
