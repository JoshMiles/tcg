# TCG Admin — CLAUDE.md

## What this project is
A Twitch stream overlay + admin panel for a trading card game. Viewers pull cards live on stream via OBS browser source. An admin panel manages seasons, packs, and cards. A public collection viewer lets viewers see their cards.

## Tech stack
- **Next.js 15** App Router — server components, server actions, dynamic routes
- **Vercel KV** (Redis) — all data persistence
- **Vercel Blob** — image uploads
- **Tailwind CSS** — styling (dark theme: gray-950 bg, gray-900 cards, yellow-500 accent)
- **TypeScript** — strict, no `any` unless unavoidable
- Client components only when truly required. Current uses: AdminNav (`usePathname`), modal/dialog trigger buttons, dialog components themselves

## Data architecture

Three-tier hierarchy: **Seasons → Packs → Cards**

- **Seasons** (`season:{id}` in KV, index at `seasons:list`): metadata + `packIds: string[]`. One season active at a time.
- **Packs** (`pack:{id}`, index at `packs:list`): globally managed, not owned by any season. Cards stored at `pack:{id}:cards`. Packs can be assigned to multiple seasons.
- **Cards** (`pack:{id}:cards`): array of Card objects stored per-pack.
- **Legacy collection** (`tcg_{collectionName}`): `{ username: number[] }` — card numbers owned. This is what the OBS widget writes to via `/api/collection`. Powers the mini-list in the overlay and the admin dashboard stats. **This is the source of truth for user data** — `addUserPull`/`getUserPulls` exist but are never called by anything.
- **User profiles** (`user:{username}:profile`): display name, Twitch username mapping, notes.
- **Twitch opaque mapping** (`twitch_opaque:{opaqueId}`): maps Twitch Extension opaque user ID → lowercase username string.

KV normalizers (`normalizeSeason`, `normalizePack` in `lib/kv.ts`) handle legacy data shapes on read — never need manual KV migrations.

## Key files

| File | Purpose |
|------|---------|
| `lib/types.ts` | All TypeScript types (Season, Pack, Card, PullRecord, UserProfile) |
| `lib/kv.ts` | All KV reads/writes. Single source of truth for data access |
| `lib/seed.ts` | Static seed data for Season 1 / Cheesy Starter Pack |
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
| `lib/twitch-jwt.ts` | Manual JWT verification via Node `crypto` (no external deps) |
| `public/widget.js` | OBS overlay widget. Vanilla JS, no build step |
| `public/overlay.html` | OBS browser source HTML |
| `public/widget.css` | Overlay styles |
| `public/twitch-panel/panel.html` | Twitch Extension Panel HTML (loads Extension Helper + panel.js) |
| `public/twitch-panel/panel.js` | Extension panel logic: auth flow, pack tabs, collection display |
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
- `/admin/users` — all collectors across all seasons, Twitch profile editing
- `/admin/settings` — misc settings

## Public routes
- `/collection` — landing page (username search)
- `/collection/[username]` — viewer's card collection (no auth)

## OBS widget data flow
1. Widget calls `GET /api/seasons/active` on load → returns `{ season, packs: [{ pack, cards }] }`
2. Widget picks pack by weight, then card by probability
3. Widget calls `POST /api/collection` to save card number to legacy collection
4. Widget reads `GET /api/collection?name={collectionName}` to show mini-list

The widget reads per-pack visual settings (accentColor, tearBorderColor, holoMinStars, cardTime, cooldownTime, soundVolume, coverImageUrl) directly from the pack object.

## Conventions
- `force-dynamic` on every admin page (KV reads must be fresh)
- `revalidatePath` after every mutation in server actions
- Server actions use `.bind(null, fixedArg)` to pre-fill arguments before passing to `<form action={}>`
- Image uploads go through `ImageUploadField` component → Vercel Blob
- Auth: `ADMIN_SECRET` env var checked against `admin-auth` cookie in middleware
- **Modal pattern**: pages stay as server components; a thin client wrapper component (e.g. `NewPackButton`) owns only the open/close boolean and renders the dialog. The dialog itself uses `<form action={serverAction}>` — redirects still work correctly.
- **NEVER add `onClick` or other event handlers to JSX in server components** — Next.js will throw at runtime even if the element is inside a client component's children prop. This applies to `<a>`, `<button>`, or any element rendered directly in a server component file.
- Users page reads from `getAllCollectionUsers()` in `lib/kv.ts` which aggregates across all seasons' legacy collections. Do not use `listAllUsers()` — that reads from `users:all` KV set which nothing writes to.

## Twitch Extension Panel

Files live in `public/twitch-panel/` — served as static files from Vercel.

**Extension dashboard setup (dev.twitch.tv):**
1. Create extension → type: Panel
2. Panel HTML file URL: `https://tcg-khaki.vercel.app/twitch-panel/panel.html`
3. Allowlisted domains (for fetch): `https://tcg-khaki.vercel.app`
4. Copy the Extension Secret (base64 encoded) → set as `TWITCH_EXTENSION_SECRET` env var in Vercel

**Auth flow:**
- Extension Helper provides `auth.userId` (opaque user ID, consistent per viewer per channel)
- Panel GETs `/api/twitch/user?opaqueId=...` to check for a saved username mapping
- If not found, viewer enters their Twitch chat username manually
- Panel POSTs to `/api/twitch/link` (JWT in Authorization header) → saves `twitch_opaque:{opaqueId}` → username in KV
- Subsequent visits auto-login via the stored mapping

**API routes (all under `/api/twitch/`):**
- `GET /season` — active season + packs + cards (public)
- `GET /collection?username=foo` — user's owned card numbers across all seasons
- `GET /user?opaqueId=xxx` — look up username by Twitch opaque ID
- `POST /link` — JWT-validated, links opaque ID to username; dev-mode allows without secret

**Key KV keys:**
- `twitch_opaque:{opaqueId}` → username string

## No node_modules locally
The project builds on Vercel. `npm run dev` / `npm run build` won't work in WSL without running `npm install` first. Verify correctness by reading code carefully rather than running tsc.
