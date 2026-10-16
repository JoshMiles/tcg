# Page-by-page review tooling

> Read this when you run a review batch (ROADMAP.md, Phase 2) or need realistic local data, a sweep of the pages, or the mod access test.

## One-time setup

- Playwright (not a project dependency, it is large): `npm i --no-save playwright && npx playwright install chromium`, or point `PLAYWRIGHT_MODULE` at an existing install's `index.mjs`. In the Claude cloud environment it is already there.
- `.env.local` (gitignored, delete it afterwards), the same as the "Testing locally" setup plus website login:

  ```
  KV_REST_API_URL=http://localhost:4111
  KV_REST_API_TOKEN=dev
  KV_URL=redis://dev
  ADMIN_SECRET=testsecret-0123456789
  ADMIN_PASSWORD=pw
  SESSION_SECRET=any-random-string-of-48-characters-or-so-0123456789
  TWITCH_CLIENT_ID=x
  TWITCH_CLIENT_SECRET=x
  TWITCH_ID_URL=http://localhost:4222
  TWITCH_API_URL=http://localhost:4222
  SITE_URL=http://localhost:3111
  ```

## Every session

1. `node scripts/mock-kv.cjs` (port 4111) and `node scripts/mock-twitch.cjs` (port 4222), then `npx next dev -p 3111`.
2. `npx tsx scripts/seed-review.mts` (or `npm run review:seed`). Refuses any KV that is not localhost, and **wipes the mock KV first**, so it is repeatable. About 20 seconds.
3. Sweep the batch's pages (below), do the hand pass, write `docs/review/<batch>.md`.
4. Stop the servers, delete `.env.local`.

On Windows Git Bash, prefix commands that take paths starting with `/` with `MSYS_NO_PATHCONV=1`, or Git Bash rewrites `/admin` into a Windows path.

## What the seed contains (`scripts/seed-review.mts`)

- **Seasons:** Cheesy Starter Deck (`season1`, ended: wrap-up snapshot, awards, trading frozen) and Aged Cheddar (`season2`, active, collection `AgedCheddar`).
- **Packs:** Cheese Wheel Pack (`pack-wheel`: variants and upgrades on, 20 cards with full art), Work In Progress Pack (`pack-draft`, a draft in Season 2), Retired Promo Pack (`pack-old`, archived).
- **Viewers:** 300 per season from the sandbox crowd generator, plus `alice` (every card, spares, Reverse / Full Art / Shiny copies, bio, tags), `hoarder` (3,000 copies), the scenario viewers (`upgrade_ready`, `upgrade_one_short`, `one_card_short`, `completionist`, `trader_a`, `trader_b`, `shiny_hunter`), `hidden_hank` (hidden from public boards), `private_pat` (private profile), `blocked_bob` (no trading), `a_very_long_username_25c`.
- **Serials:** every existing copy numbered, with unique copy numbers (copy ids like `1.0.1`).
- **Trades:** an open listing (`trader_a`), an open direct offer (`alice` to `trader_b`) and a finished swap.
- **Achievements** synced for `alice`, `completionist`, `shiny_hunter`, `one_card_short`.
- **Staff:** `review_admin` (admin) and `review_mod` (mod) on the staff list.
- **Activity:** 300 pull events and two staff events.

Logins: admin = the emergency password (`ADMIN_PASSWORD`); mod / admin / viewers = the fake Twitch (`curl "http://localhost:4222/__as?login=review_mod"`, then open `/auth/twitch?returnTo=/mod`).

## The sweeps

All flag horizontal overflow (also content pushed past the right edge while the page does not scroll, e.g. a grid column stretched by a wide child; `clipped` in `scripts/lib/sweep.mjs`), a missing or duplicate `h1`, images without `alt`, unnamed buttons and links, and console errors, and print one line per page. Pass paths to sweep only a batch's pages. `SWEEP_BASE` changes the server address.

| Command | Covers |
|---------|--------|
| `node scripts/sweep-public.mjs [--as=login] [paths]` (`npm run review:public`) | the public site at 390, 768 and 1280 px, signed in (as `tester`, or the fake-Twitch viewer given by `--as`, e.g. an owner viewing their own profile) and out |
| `node scripts/sweep-admin.mjs [paths] [--width=390]` (`npm run review:admin`) | every `/admin/*` page as an admin and every `/mod/*` page as a mod, at 390, 768 and 1280 px; also checks a mod visiting `/admin` is sent to `/mod` |
| `node scripts/sweep-mod-access.mjs` (`npm run review:mod`) | the runtime half of the mod access test: as a stranger, a mod and an admin, every `/admin` page and `/api/admin` route; exits 1 if anything is reachable that should not be |

The static half of the access test is `scripts/check-staff-guards.mts` (part of `npm run check`): it fails when an admin server action, viewer action or admin API route has no caller check, or when the set a mod may use changes.

## What a sweep cannot check

Real OBS, the Twitch panel inside Twitch, Discord delivery and Blob uploads. Each batch lists anything it could not verify so it can be checked on production. Dev-server first visits compile each page, so a full admin sweep takes a few minutes.

## Found while building the tooling (first run, desktop)

Left for the matching batches, not fixed here:

- A4 People: `/admin/users/alice?tab=grant` logs React "two children with the same key" warnings.
- A5 Trades and serials: `/admin/serials` logs the same duplicate-key warning (ten times).
- A6 Stream: `/admin/overlay` (and `?scope=<pack>`) has one control with no accessible name.
