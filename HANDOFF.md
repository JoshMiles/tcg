# HANDOFF

## Goal
Ship ROADMAP 40.2e: cache the public site's shell with Next 16 Cache Components (partial prerendering), then close the item (delete it from ROADMAP.md, docs say what the code does). Branch `cache-public-shell`, one PR. Josh pushes / opens PRs only when asked.

## Done
- Step 1: flags on, every `dynamic` export removed, `connection()` where prerender read the clock, kv proxy reads the request before throwing without KV env.
- Step 2: `SiteShell` is the prerendered frame; `SiteHeader`, `SandboxPill` and `Gate` stream behind Suspense; `OpenPageShell` for privacy / terms / not-found; `MotionPref`, `LiveSeed`. `instant = false` gone from public routes except /trade, privacy, terms.
- Docs (CLAUDE.md, hosting, sandbox, packs-and-seasons, public-site basics / closed-beta / home), ROADMAP (40.2e closed, 40.2f added), learning saved.
- Build without env, verify 84/84, trail check: all pass. Committed locally on `cache-public-shell`.

## Left
1. Push and open the PR when Josh asks (PR body: soft 404s, the Gate stale-cookie window, the banner shift, not checked in real OBS / Twitch panel).
2. After it ships: delete this file; 40.2f from about 2026-11-09.

## Key files
- `next.config.ts`, `app/components/site/SiteShell.tsx`, `OpenPageShell.tsx`, `MotionPref.tsx`, `Live.tsx`, `lib/db.ts`, `lib/session.ts`, `lib/staff-guard.ts`.

## Open questions
- Fluid compute on? (Vercel project setting; Josh to check.)

## Decisions
- 2026-10-26: Cache Components shell for everyone, not a signed-out cache (gate sends signed-out visitors to /closed).
- 2026-10-26: Josh asked to build it now rather than wait for the 2026-11-06 field read; panel freeze lifted.
- 2026-10-26: steps 1 and 2 ship as one PR (step 1 alone has no user value).
- 2026-10-26: accept the Gate window (a viewer whose access cookie still passes middleware can get a page's data before the redirect); it is within the "lose access within the hour" the admin is told.
- 2026-10-26: step 3 (`use cache: remote`) moved to ROADMAP 40.2f, only if LCP still waits on data after re-measuring.
