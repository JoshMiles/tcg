# Reference: key files and API routes

> Read this to find which file does what, or which API routes exist.

## Key files

| File | Purpose |
|------|---------|
| `lib/types.ts` | All TypeScript types (Season, Pack, Card, PullRecord, UserProfile) |
| `lib/db.ts` | **The only module that talks to Vercel KV.** Exports `kv` (same API as `@vercel/kv`, but keys are namespaced when the request is in a sandbox) and `prodKv` (raw, for the sandbox manager only). `scripts/check-kv-imports.mts` fails if anything else imports `@vercel/kv`. Never import it directly |
| `lib/kv.ts` | All KV reads/writes (incl. `setActiveSeason`, `ensureUserProfile`, `removeUserFromCollection`, `seedSeason1`). Single source of truth for data access |
| `lib/sandbox.ts`, `lib/sandbox-tools.ts`, `app/admin/sandbox/` | Sandboxes (see "Sandbox"): create / reset / delete, test-user tools, admin pages and actions |
| `lib/rarity.ts` | Rarity tiers (label, Tailwind classes, hex) + `rarityStats()`. Don't redefine rarity tables in pages |
| `lib/collection.ts` | `countPulls()`, builds the pull-count Map from a collection array (decodes variant entries) |
| `lib/variants.ts`, `lib/upgrade.ts`, `lib/leaderboard.ts` | Variant encoding/roll helpers, the upgrade transaction, card values + leaderboard (see Variants, upgrades & leaderboard) |
| `lib/twitch-helix.ts` | Helix app-token cache + `resolveTwitchLogin()` (shared by login + resolve-username routes) |
| `lib/admin-token.ts` | Edge-safe emergency admin cookie (signed with `ADMIN_COOKIE_SECRET`, expiry and generation checked; fails closed when the key is unset). `ADMIN_SECRET` is not the key |
| `lib/seed.ts` | Static seed data for Season 1 / Cheesy Starter Pack (25 cards with soundUrl set) |
| `lib/webhooks.ts` | Webhook settings helpers (incomingSecret, etc.) |
| `app/admin/actions/*.ts` | Server actions (mutations) by domain: `seasons`, `packs`, `cards`, `users` (also the dashboard quick actions), `settings` (webhooks, scoring, Discord, overlay, assets); non-exported form parsers and shared types live in `form-helpers.ts`. No data fetching here |
| `app/admin/layout.tsx` | Admin layout: fills the slots of `AdminShell` (brand, `AdminNav`, overlay status, footer actions) |
| `app/admin/components/AdminShell.tsx` | Client frame that owns the sidebar state: off-canvas **drawer + top bar below `lg`**, **collapsible icon rail on `lg+`** (remembered in `localStorage` `tcg_admin_sidebar`). Parts that must vanish when collapsed carry the `aside-label` class, centred items `aside-item`, rows that stack into a column on the rail `aside-stack`, cards `aside-card`, and group dividers `aside-rule` (CSS in `globals.css`). Add them to any new sidebar content. The nav is grouped (Overview / Game / Community / System in `AdminNav`); the bottom is a status card (`OverlayStatus` compact), Copy URL / Preview buttons, and an account row with log out + build badge; the collapse handle is a round button on the sidebar's edge |
| `app/admin/components/AdminNav.tsx` | Client component, a daisyUI `menu`. Uses `usePathname()` for the active item (`aria-current`) |
| `app/admin/components/Dialog.tsx` | Native `<dialog class="modal">` (`showModal`, so Esc and the focus trap are the browser's). Backdrop and the close button call `onClose` |
| `app/admin/packs/[packId]/workspace/PackWorkspace.tsx` | Single-screen pack workspace (Cards / Odds / Pack views, autosave on drafts, Publish checklist) |
| `app/admin/seasons/new/SeasonFlow.tsx` | Full-page season wizard (Details -> Packs -> Review); autosaves a draft |
| `app/admin/components/{Stepper,Toggle}.tsx`, `use-autosave.ts`, `upload-client.ts` | Wizard and workspace building blocks: step bar + save indicator, switch, debounced serialised autosave hook, browser upload helpers (GIFs -> Blob -> optimize) |
| `app/admin/draft-actions.ts` | Server actions for drafts and the season wizard (create draft pack/season, save season draft, publish, discard). Return data instead of redirecting |
| `lib/draft-validation.ts` | `validatePack` / `validateSeason`. The same checks run live in the workspace/wizard and again on publish |
| `app/admin/components/AddCardDialog.tsx` | Dialog for adding a single card to a pack |
| `app/admin/components/NewPackButton.tsx` | Client button + dialog that asks for a pack name, creates a draft pack, and opens `/admin/packs/[packId]` |
| `app/admin/components/NewSeasonButton.tsx` | Link to the season wizard (`/admin/seasons/new`) |
| `app/admin/components/AddCardButton.tsx` | Client button that owns AddCardDialog open/close state |
| `lib/twitch-jwt.ts` | Manual JWT verification via Node `crypto` (no external deps) + `getBearerToken()` |
| `lib/overlay-props.ts` | Registry of every adjustable overlay property (defaults, limits, validation, import/export). See "Overlay properties" |
| `app/admin/overlay/OverlayEditor.tsx`, `app/admin/overlay/page.tsx` | The **Overlay Editor** (sidebar → `/admin/overlay`): one workspace for the overlay's layout and look, registry-driven properties, live preview, drag-to-position, per-pack overrides, presets, import/export. Split into `OverlayEditorContext.tsx`, `EditorTopBar.tsx`, `PreviewStage.tsx`, `PreviewToolbar.tsx`, `PropertiesDock.tsx`, and supporting files (`editor-types.ts`, `editor-controls.tsx`, `EditorMenus.tsx`, `LayoutPanel.tsx`, `VariantPicker.tsx`, `CategoryRail.tsx`) |
| `bridge/` | TCG Bridge, the Windows desktop app (Electron + TypeScript) on the stream PC: its own `package.json`, outside the Next build and the root typecheck (`scripts/check-bridge-app.mts` runs its checks). See docs/admin/mixitup.md, "TCG Bridge app" |
| `public/widget.js` | OBS overlay widget. Vanilla JS, no build step |
| `public/overlay.html` | OBS browser source HTML |
| `public/widget.css` | Overlay styles |
| `public/twitch-panel/panel.html` | Twitch Extension Panel HTML (loads Extension Helper + panel.js) |
| `public/twitch-panel/panel.js` | Extension panel logic: Twitch auth flow, pack tabs, collection display |
| `public/twitch-panel/panel.css` | Extension panel styles (Twitch dark theme) |
| `public/twitch-panel/mobile.html`, `video_component.html`, `views.css` | The Extension's Mobile and Video - Component views: same markup + `panel.js`/`panel.css` as the panel, with a `view-mobile` / `view-video` body class and layout overrides in `views.css`. Keep the three HTML files' markup in sync |
| `scripts/mock-kv.cjs`, `scripts/seed-dev.mts` | Dev-only fake KV server + Season 1 seeder (see docs/local-dev.md); `scripts/optimize-cards.mjs` converts card GIFs |
| `middleware.ts` | First auth gate for `/admin/*` and `/mod/*` (reads the signed staff cookie; the real check is `lib/staff-guard.ts`, see "Staff"). The public site (`/u/*`, `/collection`) is open |

## API routes

### OBS / collection
- `GET /api/seasons/active`, active season + packs + cards (used by widget)
- `POST /api/collection`, save card pull to legacy collection (widget writes here). With `data` instead of `pull` (admin only) it replaces a whole collection; the body goes through `parseCollectionData` (`lib/variants.ts`): Twitch usernames to lists of valid entries, else 400
- `GET /api/collection?name={collectionName}`, read collection (widget reads here; overlay key or a staff session, not a public dump)

### Twitch Extension
- `GET /api/twitch/season`, active season + packs + cards (public, used by panel)
- `GET /api/twitch/collection?username=foo`, user's owned card numbers across all published seasons (a private or admin-hidden profile answers `collections: []` unless the caller is that viewer), as `{ collections: [{ seasonId, seasonName, active, ownedNumbers }] }`
- `GET /api/twitch/user?opaqueId=xxx`, look up username by Twitch opaque ID
- `POST /api/twitch/login`, **primary login endpoint**: verifies Extension JWT, gets the viewer's numeric ID via `getTwitchUserId()` (`user_id` after an identity grant, or `channel_id` when the signed `role` is `broadcaster`), resolves via Helix API, saves opaque→username mapping, creates user profile if needed, returns `{ username }`
- `POST /api/twitch/unlink`, JWT-validated, deletes opaque ID → username mapping (logout)
- `GET /api/twitch/me[?fresh=1]`, JWT-validated (opaque ID → linked username): the viewer's rank, score breakdown (`cardPoints`, `serialPoints`, completion / set bonuses), who is next up, every card's base values + unrounded `raw` + pull rate + copies out there, the serials they hold (`entry → number[]`), the serial-bonus rule, and how many trade offers are waiting. Shared 20 s leaderboard unless `fresh=1` (used right after an upgrade). Also sends `editions` (entry -> the viewer's editions `{ n, uid?, at, date, origin, made?, est? }`, lowest first), `favourites` (serial numbers of held editions marked favourite), `favouritesMax` and `badge` (`streamer | admin | mod | null`) New in 34.7: `wanted` (card numbers on the Looking for list), `wantedMax`, and `achievements` (`{ earned, total, latest: [{ id, name, detail, at }] }` from `syncAchievements` via `panelAchievements` in `lib/panel-achievements.ts`; `null` if it could not be worked out).
- `POST /api/twitch/upgrade`, JWT-validated; body `{ seasonId, cardNumber, from }`; spends the pack's upgrade cost in `from` copies for one of the next variant
- `POST /api/twitch/trainer`, JWT-validated (`extensionViewer()`); body `{ cardNumber, seasonId? }`; uses a trainer card through `useTrainerCard` (spends 1 Regular edition, starts the buff); returns `{ ok, message }` or `{ ok: false, error }`
- `POST /api/twitch/favourite`, JWT-validated (`extensionViewer()`); body `{ uid, on }`; favourites an edition (or takes the mark off) through `setFavourite` in `lib/favourites.ts`, the same function as the website's heart; a favourite can't be traded or spent in an upgrade. Only the viewer's own editions: returns `{ ok: true, favourite }` or `{ ok: false, error }` (400)
- `POST /api/twitch/want`, JWT-validated (`extensionViewer()`); body `{ cardNumber, on }`; puts a card on the viewer's Looking for list (or takes it off) through `setWanted` in `lib/wanted.ts`, the same function as the website's Look for button (list limit `WANTED_MAX`): returns `{ ok: true, wanted }` (the whole list) or `{ ok: false, error }` (400)
- `GET /api/twitch/leaderboard?seasonId=&username=`, public per-season ranking, the viewer's own rank, and per-card point values, plus `badges` (login -> staff badge)
- `GET /api/twitch/resolve-username?userId={numericId}`, resolves Twitch numeric user ID → login name via Helix API (requires `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET`)

### Overlay
- `POST /api/overlay/heartbeat`. The OBS overlay (`public/widget.js`) pings this every 10s with `{ id, streaming, recording, obs, dev }`; strictly validated, unauthenticated like the rest of the overlay's endpoints
- `GET /api/admin/overlay-status`, admin-only; `{ connected, clients, streaming, recording, lastSeen, queued }`

### Webhooks
- `POST /api/bridge/pair | poll | result | hello | ledger`, TCG Bridge (the stream PC app; Bearer token except `pair`): see docs/admin/mixitup.md, "TCG Bridge (site side)".
- `POST /api/webhooks/grant-card`, MixItUp integration: body `{ secret, username, cardNumber }` → appends card to user's active season collection. Every incoming webhook that takes a `username` (`parseIncomingWebhook`) answers 400 unless it is a Twitch login (3 to 25 letters, digits, underscores; a leading `@` is dropped); grant-card answers 404 when the card number is not in a published pack of the active season
