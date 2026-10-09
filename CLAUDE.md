# TCG Admin — CLAUDE.md

## What this project is
A Twitch stream overlay + admin panel for a trading card game. Viewers pull cards live on stream via OBS browser source. An admin panel manages seasons, packs, and cards. A public collection viewer lets viewers see their cards. A Twitch Extension Panel lets viewers see their collection inside Twitch.

## Tech stack
- **Next.js 15** App Router — server components, server actions, dynamic routes
- **Vercel KV** (Redis) — all data persistence
- **Vercel Blob** — image uploads
- **Vercel Analytics + Speed Insights** — `<Analytics />` + `<SpeedInsights />` in root layout; raw script tag in static panel HTML
- **Tailwind CSS** — styling (dark theme: gray-950 bg, gray-900 cards, yellow-500 accent)
- **TypeScript** — strict, no `any` unless unavoidable
- Client components only when truly required. Current uses: AdminNav (`usePathname`), modal/dialog trigger buttons, dialog components themselves

## Data architecture

Three-tier hierarchy: **Seasons → Packs → Cards**

- **Seasons** (`season:{id}` in KV, index at `seasons:list`): metadata + `packIds: string[]`. One season active at a time.
- **Packs** (`pack:{id}`, index at `packs:list`): globally managed, not owned by any season. Cards stored at `pack:{id}:cards`. Packs can be assigned to multiple seasons.
- **Cards** (`pack:{id}:cards`): array of Card objects stored per-pack. Each card has a `soundUrl` field pointing to `/assets/sounds/{n}.mp3` for the 25 Season 1 cards.
- **Legacy collection** (`tcg_{collectionName}`): `{ username: number[] }` — card numbers owned, **with duplicates**. Duplicates represent multiple pulls of the same card (pull count). This is what the OBS widget writes to via `/api/collection`. Powers the mini-list in the overlay and the admin dashboard stats. **This is the source of truth for user data** — `addUserPull`/`getUserPulls` exist but are never called by anything.
- **User profiles** (`user:{username}:profile`): display name, Twitch username mapping, notes.
- **Twitch opaque mapping** (`twitch_opaque:{opaqueId}`): maps Twitch Extension opaque user ID → lowercase username string.

### Pull count / duplicate cards
The collection array stores duplicates intentionally. To get unique card count: `new Set(array).size`. To get pull count per card: build a `Map<number, count>` by iterating the array. Everywhere that shows cards (collection page, Twitch panel, widget mini-list) uses this countMap and displays a `×N` badge when count > 1.

KV normalizers (`normalizeSeason`, `normalizePack` in `lib/kv.ts`) handle legacy data shapes on read — never need manual KV migrations.

## Key files

| File | Purpose |
|------|---------|
| `lib/types.ts` | All TypeScript types (Season, Pack, Card, PullRecord, UserProfile) |
| `lib/kv.ts` | All KV reads/writes (incl. `setActiveSeason`, `ensureUserProfile`, `removeUserFromCollection`, `seedSeason1`). Single source of truth for data access |
| `lib/rarity.ts` | Rarity tiers (label, Tailwind classes, hex) + `rarityStats()`. Don't redefine rarity tables in pages |
| `lib/collection.ts` | `countPulls()` — builds the pull-count Map from a collection array |
| `lib/twitch-helix.ts` | Helix app-token cache + `resolveTwitchLogin()` (shared by login + resolve-username routes) |
| `lib/admin-token.ts` | Edge-safe admin cookie check (used by middleware); fails closed when `ADMIN_SECRET` unset |
| `lib/legacy-data.ts` | Season 1 legacy collection data for the one-time import route |
| `lib/seed.ts` | Static seed data for Season 1 / Cheesy Starter Pack (25 cards with soundUrl set) |
| `lib/webhooks.ts` | Webhook settings helpers (incomingSecret, etc.) |
| `app/admin/actions.ts` | All server actions (mutations). No data fetching here |
| `app/admin/layout.tsx` | Admin shell with sidebar (AdminNav client component) |
| `app/admin/components/AdminNav.tsx` | Client component — uses `usePathname()` for active nav state |
| `app/admin/components/Dialog.tsx` | Base modal with blur backdrop, ESC-to-close |
| `app/admin/components/PackWizard.tsx` | 3-step wizard for pack creation (Details → Visual → Timing) |
| `app/admin/components/SeasonDialog.tsx` | Dialog for season creation |
| `app/admin/components/AddCardDialog.tsx` | Dialog for adding a card to a pack |
| `app/admin/components/NewPackButton.tsx` | Client button that owns PackWizard open/close state |
| `app/admin/components/NewSeasonButton.tsx` | Client button that owns SeasonDialog open/close state |
| `app/admin/components/AddCardButton.tsx` | Client button that owns AddCardDialog open/close state |
| `lib/twitch-jwt.ts` | Manual JWT verification via Node `crypto` (no external deps) + `getBearerToken()` |
| `public/widget.js` | OBS overlay widget. Vanilla JS, no build step |
| `public/overlay.html` | OBS browser source HTML |
| `public/widget.css` | Overlay styles |
| `public/twitch-panel/panel.html` | Twitch Extension Panel HTML (loads Extension Helper + panel.js) |
| `public/twitch-panel/panel.js` | Extension panel logic: Twitch auth flow, pack tabs, collection display |
| `public/twitch-panel/panel.css` | Extension panel styles (Twitch dark theme) |
| `middleware.ts` | Auth gate — only covers `/admin/*`. `/collection/*` is public |

## Admin routes
- `/admin` — dashboard (stats, top collectors, card ownership table)
- `/admin/seasons` — season list + create
- `/admin/seasons/[id]` — season settings + pack assignment
- `/admin/packs` — global pack library
- `/admin/packs/new` — create pack
- `/admin/packs/[packId]` — pack settings + cards table + add card
- `/admin/packs/[packId]/cards/[cardId]` — edit individual card
- `/admin/users` — all collectors across all seasons, with link to each user's detail page
- `/admin/users/[username]` — user detail: per-season card grid, grant/remove cards, danger zone (reset/delete)
- `/admin/activity` — live activity feed
- `/admin/assets` — media library: every card image, pack cover and sound with size/health flags, plus a cleanup tab for unreferenced Blob files
- `/admin/webhooks` — incoming/outgoing webhook config
- `/admin/settings` — misc settings, build info

## Public routes
- `/collection` — landing page (username search)
- `/collection/[username]` — viewer's card collection (no auth). Shows owned cards with ×N badge for duplicates and total pull count when it exceeds unique count.

## API routes

### OBS / collection
- `GET /api/seasons/active` — active season + packs + cards (used by widget)
- `POST /api/collection` — save card pull to legacy collection (widget writes here)
- `GET /api/collection?name={collectionName}` — read collection (widget reads here)

### Twitch Extension
- `GET /api/twitch/season` — active season + packs + cards (public, used by panel)
- `GET /api/twitch/collection?username=foo` — user's owned card numbers across all seasons, as `{ collections: [{ seasonId, seasonName, active, ownedNumbers }] }`
- `GET /api/twitch/user?opaqueId=xxx` — look up username by Twitch opaque ID
- `POST /api/twitch/login` — **primary login endpoint**: verifies Extension JWT, gets the viewer's numeric ID via `getTwitchUserId()` (`user_id` after an identity grant, or `channel_id` when the signed `role` is `broadcaster`), resolves via Helix API, saves opaque→username mapping, creates user profile if needed, returns `{ username }`
- `POST /api/twitch/link` — JWT-validated, links opaque ID to username; also creates user profile if not present
- `POST /api/twitch/unlink` — JWT-validated, deletes opaque ID → username mapping (logout)
- `GET /api/twitch/resolve-username?userId={numericId}` — resolves Twitch numeric user ID → login name via Helix API (requires `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET`)

### Admin (one-time / utility)
- `GET /api/admin/import-legacy?secret={ADMIN_SECRET}` — seeds `tcg_CheesyStarterDeck` with Season 1 legacy player data. Add `&dry=1` to preview, `&overwrite=1` to replace existing user data. Also creates user profiles for imported users.

### Overlay
- `POST /api/overlay/heartbeat` — the OBS overlay (`public/widget.js`) pings this every 10s with `{ id, streaming, recording, obs, dev }`; strictly validated, unauthenticated like the rest of the overlay's endpoints
- `GET /api/admin/overlay-status` — admin-only; `{ connected, clients, streaming, recording, lastSeen, queued }`

### Webhooks
- `POST /api/webhooks/grant-card` — MixItUp integration: body `{ secret, username, cardNumber }` → appends card to user's active season collection

## OBS widget data flow
1. Widget calls `GET /api/seasons/active` on load → returns `{ season, packs: [{ pack, cards }] }`
2. Widget picks pack by weight, then card by probability
3. Widget calls `POST /api/collection` to save card number to legacy collection (duplicates allowed — pull count)
4. Widget reads `GET /api/collection?name={collectionName}` to show mini-list with ×N badge for duplicates

The widget reads per-pack visual settings (accentColor, tearBorderColor, holoMinStars, cardTime, cooldownTime, soundVolume, coverImageUrl) directly from the pack object. Card sounds come from `card.soundUrl` (e.g. `/assets/sounds/1.mp3`).

## Conventions
- `force-dynamic` on every admin page (KV reads must be fresh)
- `revalidatePath` after every mutation in server actions
- Server actions use `.bind(null, fixedArg)` to pre-fill arguments before passing to `<form action={}>`
- Image uploads go through `ImageUploadField` component → Vercel Blob
- Auth: `ADMIN_SECRET` env var checked against `admin-auth` cookie in middleware
- **Modal pattern**: pages stay as server components; a thin client wrapper component (e.g. `NewPackButton`) owns only the open/close boolean and renders the dialog. The dialog itself uses `<form action={serverAction}>` — redirects still work correctly.
- **NEVER add `onClick` or other event handlers to JSX in server components** — Next.js will throw at runtime even if the element is inside a client component's children prop. This applies to `<a>`, `<button>`, or any element rendered directly in a server component file.
- Users page reads from `getAllCollectionUsers()` in `lib/kv.ts` which aggregates across all seasons' legacy collections. `listAllUsers()` and the per-user pull-record helpers were removed — nothing wrote to them.

## Twitch Extension Panel

Files live in `public/twitch-panel/` — served as static files from Vercel.

**Extension dashboard setup (dev.twitch.tv):**
1. Create extension → type: Panel
2. Panel HTML file URL: `https://tcg-khaki.vercel.app/twitch-panel/panel.html`
3. Allowlisted domains (for fetch): `https://tcg-khaki.vercel.app`
4. Copy the Extension Secret (base64 encoded) → set as `TWITCH_EXTENSION_SECRET` env var in Vercel

**Critical: `auth.userId` is always an opaque ID — it never becomes a numeric ID on the client**, even after `requestIdShare()`. The real Twitch numeric user ID only appears in the JWT payload's `user_id` field (server-side). All login resolution goes through `POST /api/twitch/login` which reads it from there.

**Twitch auth flow (current implementation):**
1. Panel loads → `onAuthorized` fires → `init()` called
2. If `identityRequestPending` flag is set (user just responded to Twitch identity popup) → call `loginFromJwt()` → on success: login; on fail: show the failure reason on the login screen
3. Load season data; if none → show no-season state
4. If `isExplicitlyLoggedOut()` (localStorage flag) → show login screen
5. Try `tryAutoLogin()` — `GET /api/twitch/user?opaqueId=...`; if mapping exists, silent login
6. Try `loginFromJwt()` — `POST /api/twitch/login` with current JWT; if JWT already contains `user_id` from a prior identity grant (or the viewer is the channel owner), silent login without any user interaction. A 403 ("identity not shared yet") shows a plain login screen; any other failure shows its reason on the login screen
7. Otherwise → show login screen with teaser grid and "Login with Twitch" button
8. Login button pressed → **if the JWT role is `broadcaster`, call `loginFromJwt()` directly** (Twitch's `requestIdShare()` is a documented no-op on your own channel, so waiting for it hangs forever); otherwise call `requestIdShare()`, show a status hint, set `identityRequestPending = true`, 20s timeout fallback
9. Twitch re-fires `onAuthorized` after user responds → `init()` re-enters with `identityRequestPending = true` → `loginFromJwt()` resolves via `/api/twitch/login`
10. Logout: set localStorage flag + `POST /api/twitch/unlink` → show login screen

**Login screen design:**
- Shows top 10 rarest cards as a 5-column teaser grid (top 3 revealed with image + gold border, rest as `?`)
- Season name, card count, purple "Login with Twitch" button
- No manual username form — Twitch identity only

**Card details:**
- Clicking (or Enter/Space on) a grid card opens an overlay (`#card-detail`, `openDetail()` in `panel.js`): large animated card, name, rarity, `#N · pack · position`, and how many the viewer has (`cardStatus()` — pulls this season, plus per-season counts for past seasons). Undiscovered cards open as a locked "???" view. Prev/next (and ←/→) browse the current pack, Esc/backdrop/× close it, and focus returns to the card. `showState()` closes it so it never survives a logout. The grid badges and the overlay both read `cardStatus()` — keep it that way so they can't disagree.

**Collection link:**
- The username in the collection-view footer is an `<a target="_blank">` to the viewer's public page, `/collection/<username>` on the same origin as the API calls (set in `login()`). Twitch's extension sandbox allows popups, so it opens in a new tab. If Twitch blocks it, check the extension's URL/link allowlists in the developer console.

**Logout persistence:**
- `localStorage` key `tcg_panel_loggedout = '1'` survives panel refresh
- Checked at the start of `init()` before any auto-login attempt
- Cleared when `login()` succeeds

**API credentials — two separate things:**
- `TWITCH_EXTENSION_SECRET` — base64-encoded Extension Secret (dev.twitch.tv → Extension → Settings). Used by `lib/twitch-jwt.ts` to verify JWTs from the Extension Helper.
- `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` — OAuth app credentials (dev.twitch.tv → Applications → your app). Used by `/api/twitch/resolve-username` for the `client_credentials` token flow and Helix API calls. These are NOT the same as the Extension Secret.

**Key KV keys:**
- `twitch_opaque:{opaqueId}` → username string

## Admin user detail page (`/admin/users/[username]`)
- Fetches profile + all seasons + collections in parallel
- Shows per-season card grid: owned cards with image + rarity border, unowned as `?`
- ×N badge on cards pulled more than once
- Hover × button on owned cards to remove one instance (calls `removeUserCard` server action)
- Grant card select form per season
- Danger zone: Reset All Seasons (wipes all collection entries) + Delete User (wipes collections + profile, redirects to `/admin/users`)
- 404 if no cards and no profile found

## Environment variables
| Variable | Purpose |
|----------|---------|
| `ADMIN_SECRET` | Admin panel auth cookie value (admin is locked out if unset) |
| `ADMIN_PASSWORD` | Password checked by `/api/auth/login` |
| `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN` | Vercel KV credentials |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob credentials |
| `TWITCH_EXTENSION_SECRET` | Base64 Extension Secret for JWT verification |
| `TWITCH_CLIENT_ID` | Twitch OAuth app Client ID (for Helix API) |
| `TWITCH_CLIENT_SECRET` | Twitch OAuth app Client Secret (for Helix API) |

## Card art
Card images are animated WebP in `public/assets/cards/` (600px wide, ~1–4MB each) with a static first-frame thumbnail of each in `public/assets/cards/thumb/` (~15KB). The original 800px GIFs were 20MB+ each and were removed. `getPackCards` rewrites legacy stored URLs (`/assets/GIF/X.gif` → `/assets/cards/X.webp`) on read, so old KV data keeps working.

- **Grids use `CardTile`** (`app/components/CardTile.tsx`, client component): shows the thumbnail and loads the animated file only while hovered. Used on `/collection/[username]` and the admin user detail page. `cardThumbUrl()` in `lib/card-art.ts` maps an image URL to its thumbnail (returns the URL unchanged when none exists, e.g. external images).
- **The Twitch panel** (vanilla JS) does the same: `/api/twitch/season` returns a `thumbUrl` per card (from `cardThumbUrl()`), and `addCardImage()` in `panel.js` shows that static thumbnail, mounting the animated `imageUrl` as an overlay only while the card is hovered (skipped for `prefers-reduced-motion`). Never put full animated images directly in the panel grid — 25 of them at once makes the iframe crawl.
- **Processing** lives in `lib/card-image.ts` (sharp), shared by the CLI and uploads. To convert GIFs locally: `node scripts/optimize-cards.mjs <inDir> <outDir>` (Node ≥ 22.18). With no GIFs present it just regenerates thumbnails.
- **Admin GIF uploads** (`ImageUploadField`): the browser uploads the raw GIF straight to Blob via `/api/upload/token` (Vercel functions cap request bodies at 4.5MB), then `/api/upload/optimize` fetches it, stores `cards/<uuid>.webp` + `cards/<uuid>.thumb.webp`, and deletes the original. The `<uuid>.thumb.webp` naming is what lets `cardThumbUrl()` derive the thumbnail from the stored URL — keep `optimizedCardPaths()` and `cardThumbUrl()` in sync. Non-GIF uploads still go through `/api/upload` unchanged. Needs `BLOB_READ_WRITE_TOKEN`; the optimize route sets `maxDuration = 60`.

## User avatars
Admin pages (dashboard Top Collectors, users list, user detail) show each user's Twitch profile picture. `getAvatars(usernames)` in `lib/avatars.ts` batches Helix `users?login=…` lookups (`fetchTwitchAvatars` in `lib/twitch-helix.ts`, up to 100 per request) and caches results in the KV hash `twitch:avatars` (login → `{ url, at }`; 7 days for found, 1 day for "no avatar"). It never throws — without `TWITCH_CLIENT_ID`/`TWITCH_CLIENT_SECRET`, or if Twitch is down, users just get the initial-letter fallback, and a failed lookup is not cached. Logins that can't be Twitch names (e.g. `mrbeast#`) are skipped. Use `sizeTwitchAvatar(url, px)` to request the right size and the `Avatar` client component (`app/components/Avatar.tsx`) to render it; it falls back to the initial if the image fails to load.

## Live activity (`/admin/activity`)
An event log of everything that happens: widget pulls (new vs duplicate, copies, unique owned), card grants/removals (admin + webhook), resets/deletes, incoming webhook triggers, and "collection shown" notices. `recordActivity()` in `lib/activity.ts` appends to the KV list `activity:log` (newest first, capped at 500) and bumps the counter `activity:seq`; it never throws and must be `await`ed in serverless routes. Call it from any new code path that changes a collection.

The page is a server-rendered snapshot plus a client component (`ActivityFeed`) that polls `GET /api/admin/activity?after=<seq>` every 3s while the tab is visible (pausable). With nothing new that is one KV GET; new events come back with avatars. Polling rather than SSE because serverless functions can't hold long connections cheaply. `pull` events come from the unauthenticated `/api/collection` POST (the widget's payload), so treat their contents as untrusted display text.

## Build version
Every build is stamped so you can tell which deployment you are looking at. `next.config.ts` bakes `BUILD_VERSION` (from `package.json`), `BUILD_COMMIT`/`BRANCH`/`ENV`/`REPO` (from Vercel's `VERCEL_GIT_*` and `VERCEL_ENV`, falling back to `git` locally) and `BUILD_TIME` into the bundle; `lib/version.ts` (`getBuildInfo()`) reads them. It shows as `v1.1.0 · 75fdb70` in the admin sidebar (`BuildBadge`, links to the commit on GitHub, with a `DEV`/`PREVIEW` pill outside production), in a **Build** section on `/admin/settings`, and in the top-right corner of the Twitch panel (fetched from the public `GET /api/version`). The semver is manual — bump `version` in `package.json` for releases; the commit changes automatically every build.

## Admin UX conventions
- **Destructive actions use `ConfirmButton`** (`app/admin/components/ConfirmButton.tsx`): wrap the submit button of a `<form action={serverAction}>` and it opens a confirmation dialog first, then calls `form.requestSubmit()`. Never ship a bare delete/reset button. For a button outside its form, pass `formId`.
- **Tiny card icons use `cardThumbUrl()`**, never the animated `imageUrl` (a 28px icon should not download 2MB).
- **Assets page** (`lib/assets.ts` + `app/admin/assets/`): groups by purpose (card art / pack covers / sounds / unused), not file type. Flags `legacy-gif`, `missing`, `no-thumbnail`, `heavy`. Sizes come from the Blob `list()` for Blob files and same-origin HEAD requests for bundled `/assets/…` files. "Unused" = Blob files no card/pack references (a card's companion thumbnail counts as referenced; files under 10 minutes old are hidden in case they're mid-optimize). `deleteUnusedBlobs()` re-verifies on the server — it only deletes files that are in our store and unreferenced — so a stale page or crafted form can't delete live art.
- The users list has a client-side search (`UserSearch`, press `/`); rows opt in with a `data-search` attribute.

## Overlay status & quick actions
- **Connection indicator**: each overlay page load picks a random id and sends a heartbeat every 10s (`lib/overlay.ts`, KV hash `overlay:clients`); a client counts as connected for 25s after its last heartbeat. `OverlayStatusProvider` (in the admin layout) polls `/api/admin/overlay-status` once every 5s and `OverlayStatus` (sidebar + dashboard header) and `QuickActions` read it. Open the overlay in a normal browser tab and it shows as "browser tab".
- **Live detection**: if OBS grants the browser source *Page permissions → "Read access to OBS status information"*, the widget calls `window.obsstudio.getStatus()` and reports `streaming`/`recording` (and re-reports on the `obsStreamingStarted/Stopped` events). Without that permission those stay `null` and the UI says only "connected". It cannot know the stream is live any other way.
- **Quick actions** (dashboard): `quickAction` in `actions.ts` dispatches on the submit button's `intent` (gift packs, show collection, grant card); `clearQueueAction` empties the overlay queue. Gift/show enqueue the same events the webhooks do (`enqueueEvent`) and are refused with a "queue anyway" option when no overlay is connected, so packs can't pile up unseen. They return an `ActionResult` shown inline via `useActionState`. Keep form fields controlled — React resets uncontrolled fields after a form action. `/admin?gift=<username>` prefills the viewer (the users list 🎁 link uses it).
- **Users list**: rows are one stretched link to `/admin/users/[username]` (profile editing lives there), sortable via `?sort=cards|pulls|active|name`; "last active" comes from the latest 500 activity events.

## Only-when-live switches
Settings → OBS Overlay has two checkboxes (KV `overlay:settings`, `lib/overlay-settings.ts`): ignore incoming **pack** triggers and/or **collection** triggers unless the stream is live. `liveGate(kind)` is called by `/api/webhooks/pull` and `/api/webhooks/collection` before enqueueing; blocked triggers are dropped (not queued) and answered `{ ok: true, ignored: true, reason }`. "Not live" = no overlay connected, or a connected overlay reports `streaming === false`. If OBS hasn't granted the browser source status permission, `streaming` is `null` and triggers are allowed (we can't tell). Dashboard quick actions deliberately bypass the gate. It fails open on any error.

## Discord activity feed
Settings live in KV `discord:settings` (edited on `/admin/webhooks`). `recordActivity()` forwards every event via `after()` to `notifyDiscord()` in `lib/discord.ts`, which applies the category toggles + pull filters (min rarity, new-only), builds an embed (rarity colour, static card thumbnail, link to the viewer's collection) and POSTs it. Only real discord.com webhook URLs are accepted (the server POSTs to the stored URL); `allowed_mentions` is empty and names are Markdown-escaped because event text comes from unauthenticated endpoints. Browser-safe types live in `lib/discord-config.ts` — client components must import from there, not `lib/discord.ts`. The form's Test / Send-last-activity buttons use the URL currently typed, so it can be verified before saving.

## Local dev
`npm install` then `npx tsc --noEmit` / `npm run build` work locally. `node_modules/` is gitignored.

## Overlay performance
The OBS overlay must stay smooth, so keep these rules when editing `public/widget.js` / `widget.css`:
- **The collection grid uses thumbnails, never the animated WebPs.** `/api/seasons/active` adds `thumbUrl` to every card (`cardThumbUrl()`); the widget maps it to `card.thumb` and `buildMiniList` uses it. `preloadThumbs()` decodes them all on load, and `drawCard` calls `warmImage(card.image)` as soon as a card is picked so the reveal doesn't hitch on decode.
- **Animate only `transform`/`opacity`.** The holographic shimmer slides a pre-painted `::before` layer with `translate3d` instead of animating `background-position` (which repaints every frame). No `filter: blur` on animated layers.
- **Keep images small.** `public/assets/pack-cover.png` is drawn ~287px wide but used 3× per pack theater, so it is stored at 640px wide (~0.4MB). Don't replace it with a full-resolution original.
- `/assets/cards/*` and `/assets/sounds/*` are served with a day of `Cache-Control` (see `next.config.ts`) so OBS refreshes don't re-download the art.
