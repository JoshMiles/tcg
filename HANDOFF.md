# HANDOFF

## Goal
Audit follow-up (Tracks 43, 47 to 52) is done except the items in ROADMAP.md that wait on the panel review, Josh or design. This file goes once the follow-ups below are handed over.

## Done
- Track 45 (#480 to #483), 34.8 (#484, panel 0.0.2 submitted, under Twitch review).
- Track 46: #485 to #490, and #499 (46.6, archives Track 46).
- Track 47 merged: 47.1 #493, 47.2 #492, 47.3 #495, 47.5 #496 (headers + report-only CSP), 47.6 #491, 47.7 #497, 47.8 PR 1 #494, 47.9 #498 (rate limiter). #499 (46.6) merged too. main passes verify 100/100 after both.
- Track 47 ROADMAP cleanup committed locally on `roadmap-47-cleanup` (a5b91340): done items archived, 47.4 in Track 53, 47.8 rewritten to PR 2 to 4, new 47.10 (security L-2) and 47.11 (trial readouts).

## Left
- Open PRs on auto-merge: #557 (47.10), #558 (49.6 site), and this ROADMAP cleanup.
- Waiting: 43.3 and Track 53 (panel review), 47.11 (Josh, from 2026-11-02), 40.2f (field data, about 2026-11-09), 35.1 (Josh), 50.3 (design).
- Follow-ups for Josh to decide: the admin viewer page names trade cards first-season-wins (49.2); 52.5 dropped the season look-back; collapsed admin rail footer still about 247px (52.13); QR codes point at cheesytcg.app on local builds; Top collectors widget repeats the Leaderboard (52.3); Discord feedback posts still name the reported staff member (51.6); is the empty rarity tier pre-flight rule wanted (51.12); the error spike counts only serverError() (51.13); a mod opening an admin page is redirected to /mod silently (49.6).
- Flaky checks: check-achievements and check-recent-arrivals.
- Cleanup: stray remote branch 51-6-staff-reports-to-admins (delete was refused as destructive; Josh can delete it); stray node process on port 4111; stale worktrees under .claude/worktrees/.
- Josh to do: Vercel Firewall log-only trial rules (docs/hosting.md), read the CSP report logs after a week.

## Key files
- lib/staff-token.ts, app/auth/staff/route.ts, app/api/auth/logout/route.ts (47.3); lib/rate-limit.ts (47.9); lib/security-headers.ts (47.5); lib/user-admin.ts (46.6)

## Open questions
- (none)

## Decisions
- 2026-10-26: v0.0.2 = Track 34 in full (Josh). 34.7 may move to a later version after its planning pass.
- 2026-10-26: the extension gets its own version number (0.0.2) for the zip name; package.json (site version 1.1.0) stays as it is (Josh). Done in 34.8.
- 2026-10-26: for Track 34, push and open a draft PR as soon as each item passes Opus review; no need to wait for "push" (Josh).
- 2026-10-26: Opus merges each Track 34 PR once CI is green (all three comment lists read and answered first), then starts the next item (Josh).
- 2026-10-26: 34.7 ships cut down in 0.0.2: achievements summary on Stats, want toggle in card details, binder and share images as link-outs (Josh).
- 2026-10-26: Golden upgrades open on every upgrade-enabled pack straight away (weight 0 only stops pulls); Master set and All Golden now include Golden for new earners; stored achievements are kept (Josh).
- 2026-10-26: Track 44 added: audits of public site, admin, mod panel, Twitch panel, plus a security review; unfixed critical/high security findings go in gitignored SECRETS.md, never public (Josh asked; layout Opus).
- 2026-10-26: Track 44 audits also propose changes, feature improvements, experimental features and UI/UX improvements (Josh).
- 2026-10-26: 34.6b (pack card back in the panel) left out of 0.0.2; picked up in the next panel version (Josh).
- 2026-10-26: /api/twitch/me runs syncAchievements on each call (panel loads /me on load, after actions, on re-show at most every 45s; sync writes are once-only), no separate lazy route (Opus).
- 2026-10-26: the full Track 44 audit (including 44.4) runs in a fresh session after /clear; the first 44.4 agent was stopped (Josh).
- 2026-10-26: 44.6 picks: fix tracks access hardening, data correctness, KV efficiency, mod UX and cleanup; order 45 (held security + asset deletion), 34.8, then 46, 47, 48; 49 to 51 fit between. Extra features and trials picked in three rounds, now Tracks 50 and 51 (Josh).
- 2026-10-26: Track 52 (UI and UX from the page walk, 52.1 to 52.16) added, all picked by Josh; 50.4 dropped as already shipped (Opus).
- 2026-10-26: Track 45 PRs: open each straight away (not draft), merge each once green after reading all three comment lists; Opus handles it autonomously (Josh).
- 2026-10-26: Panel 0.0.2: a light freeze starts when Josh submits it (panel files frozen; /api/twitch may add keys, never drop or rename) until Twitch answers (Josh).
- 2026-10-26: 47.8: when a new Twitch account signs in with a login an old profile holds, move the old profile aside (not refuse) (Josh).
- 2026-10-26: 47.8 details (Josh): old owner returning under a new login is ASKED before their moved-aside collection is restored; a same-ID rename moves the profile to the new login automatically (no redirect table); ship PR 2 and 3 straight after PR 1 (no month trial); close the bot-pull gap with a nightly Twitch (Helix) check, not a bot change.
- 2026-10-26: Josh submitted panel 0.0.2; it is under Twitch review. Light freeze in force: public/twitch-panel/* and middleware.ts CORS untouched, /api/twitch/* additive only. 43.3 and Track 53 wait.
- 2026-10-26: 47.9 queue poll: the overlay's own 2-second poll is not rate-counted (only callers failing the overlay key), to avoid a KV command per poll per browser source (Opus).
- 2026-10-26: 47.9 adds a 429 past 300 calls a minute per address on /api/twitch/*; accepted under the light freeze because no JSON key changes and a panel never gets near it (Opus).
- 2026-10-26: #500 merged (Track 47 cleanup).
- 2026-10-26: pushing, opening PRs and merging are handled without asking Josh (Josh).
- 2026-10-26: 47.8 PR 2 scope (Opus): journal in hash `acct:moves` (from -> journal) so Data health can list unfinished moves without a scan; moved-aside key is added to the admin hidden list until PR 3's `~` handling; `access:testers` record for the old login is dropped, not moved; no new-account creation or session check in PR 2 (PR 3).
- 2026-10-26: 47.8 PR 3 design (Opus): `moveAccount` gets a `mode` ('aside' | 'rename') kept in the journal; rename/reclaim may replace a blank target (profile, no cards), carries the tester record, restores the hidden flags saved in `acct:aside`, strips the ' (former)' display suffix. Aside mode appends ' (former)' to displayName and makes the account private instead of a render-time `~` helper. If the new login already has cards, nothing moves automatically; /account tells the player to ask staff to merge. getSession returns null when the profile's Twitch ID differs from the cookie's (one cached read per request). Panel login binds before saving the opaque link.
- 2026-10-26: 47.8 PR 4 runs as a Vercel cron route (existing app/api/cron/* pattern, lib/cron-auth.ts) (Josh).
- 2026-10-26: 47.8 PR 4 design (Opus): nightly `/api/cron/accounts` (04:30 UTC, production only) looks up every stored Twitch ID on Helix (`users?id=`, 100 per call); an ID whose current login differs is a rename: move the profile to the new login (rename mode) when it is blank, else list it on Data health for a staff Merge. Capped moves per run; the rest wait a night. This also frees a reused login, so later bot pulls land on a fresh profile.
- 2026-10-26: 48.6 (CDN-cached leaderboard trial) folds into 40.2f (Opus): there is no public leaderboard JSON to put s-maxage on (the page is server-rendered), and 40.2f step 2 already plans cross-request caching of the board with `use cache: remote`; ROADMAP says fold if covered.
- 2026-10-26: 48.7 (Josh): build now; one hash per season `coll:<c>` (field = login), migrated automatically on first use under the collection lock with an atomic RENAME; old blob kept 30 days as `tcg_<c>:old` with a Data health delete button and a rollback script. Same per-season lock (Opus). Two PRs: A storage + writers, B single-viewer readers.
- 2026-10-26: Josh: keep going through the ROADMAP to the end without him (he is reading); check PRs and merge them. Opus runs up to three lanes of worktree agents (core 48.7, mod panel Track 49, site UI Track 52), then Tracks 50 and 51; panel items wait for Track 53. Agents do not commit HANDOFF.md or ROADMAP.md; Opus does ROADMAP cleanup per track.
- 2026-10-26: Track 47 cleanup keeps two loose ends as ROADMAP items rather than dropping them: 47.10 (security L-2, needs a decision) and 47.11 (CSP and firewall trial readouts, blocked on Josh from 2026-11-02) (Opus).
- 2026-10-27: after the laptop crash, only one local run (agent servers or verify) at a time; Tracks 48 to 52 continue one agent at a time (Josh: "carry on, one at a time").
- 2026-10-27: 51.9 backup dry run is a `--dry-run` flag on `scripts/restore-backup.mts`, not an admin button: a preview decrypts a whole backup and reads the live keys, too heavy for a request (Opus).
- 2026-10-27: 51.14 restore drill is read-only: decrypt the newest backup and compare it with live data via previewRestore, never write it into a sandbox namespace (a monthly full copy into production storage, and a partial write would leave junk) (Opus).
- 2026-10-27: 47.10 (Opus): saves need https; stored http webhooks keep sending with a Settings warning (no silent break on deploy); at send, resolve DNS and refuse if any address is private or the lookup fails; no redirects followed. DNS rebinding between lookup and fetch is a known, documented limit.
