# HANDOFF

## Goal
Tracks 57 then 58 (Josh, 2026-10-28: keep going after 56): one fresh agent per item, Opus reviews, reads all comments, merges on green, next. 57.12 and 57.13 need an Opus design pass first; Track 58 needs Josh to connect a Twitch account (any account, 58.1) before 58.2 is tried for real.

## Done
- Track 45 (#480 to #483), 34.8 (#484, panel 0.0.2 submitted, under Twitch review).
- Track 46: #485 to #490, and #499 (46.6, archives Track 46).
- Track 47 merged: 47.1 #493, 47.2 #492, 47.3 #495, 47.5 #496 (headers + report-only CSP), 47.6 #491, 47.7 #497, 47.8 PR 1 #494, 47.9 #498 (rate limiter). #499 (46.6) merged too. main passes verify 100/100 after both.
- Track 47 ROADMAP cleanup committed locally on `roadmap-47-cleanup` (a5b91340): done items archived, 47.4 in Track 53, 47.8 rewritten to PR 2 to 4, new 47.10 (security L-2) and 47.11 (trial readouts).

## Left
- Track 55 done (#579 to #614), archived. Follow-up: event command downloads (55.5 x 55.4g) not yet planned as an item.
- Josh to test in real Mix It Up: one event of each kind from the Events tab (single gift, mass gift, bits, raid, redeem); a `!pack <name>`;.
- Old worktrees from the Track 55 run under .claude/worktrees/agent-* (one holds the open 55.5 branch): clean once #603 merges.
- Waiting: 43.3 and Track 53 (panel review), 47.11 (Josh, from 2026-11-02), 40.2f (field data, about 2026-11-09), 35.1 (Josh), 50.3 trial readout (from 2026-11-24).
- Flaky checks: check-achievements and check-recent-arrivals; verify sometimes fails one check on a first run and passes on a rerun.
- Cleanup for Josh: stray remote branch 51-6-staff-reports-to-admins; stray node process on port 4111; stale worktrees under .claude/worktrees/.
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
- 2026-10-27: Josh picked the nine follow-ups, now Track 54: fix the admin names; bring back the look-back; tighten the rail footer; QR from the current site; Rising this week instead of Top collectors; staff reports in full to the admin log channel; empty tier warns only with weight; stray 500s through serverError(); a denied note for mods.
- 2026-10-27: 54.5 uses a daily score snapshot from the backup cron (Josh). 54.7 became a grey note, since rarity tiers have no weight (Josh). Track 54 done (#561 to #570).
- 2026-10-27: 50.3 swap finder design (Josh): their side spares first then any copy (marked 'only copy'); your side spares only; 'wants' = Looking for list plus saved alerts (the existing want index). 4-week trial measured by `via: 'swap'` on trades (Opus).
- 2026-10-27: 50.3 swap finder shipped (#574); 4-week trial, readout from 2026-11-24 (Opus).
- 2026-10-27: Josh picked all eight 55.4 settings; Opus wrote the designs (price order fixed at reserve, free packs count toward the limit, event packs never do, 10 packs per event cap, broadcaster exempt from cooldown) in ROADMAP 55.4. Track 55 done items archived (#604).
- 2026-10-27: Josh: proceed with the 55.4 build; Opus merges each PR on green CI with comments read (docs/git-and-prs.md), one agent at a time.
- 2026-10-27: 55.4 built (#605 to #612). Opus fixes on review: the in-flight total never counts below this pull's price (#606); the queue cap form regex lost its backslash (#609). Briefs now say to edit code with the Edit tool, not shell.
- 2026-10-28: Josh: a plain `!pack` rolls a random pack from the season (same weights) before the reservation and charges that pack's price (#614).
- 2026-10-28: Josh: event reward packs keep going through while pulls are paused or the viewer is blocked, like Stream Deck free packs (for now).
- 2026-10-28: Josh: merge 55.5 (#603) without the test import. Every PR touching bridge/ bumps the bridge minor; releases publish on merge; the About tab shows the commit; the dashboard shows the latest bridge; README rewrite (Track 56).
- 2026-10-28: Josh: Track 58 through TCG Bridge (EventSub in the app), no custom rewards (awards on existing ones, mods refund by hand), Twitch wins over Mix It Up events; 58.6 chat commands replace the Mix It Up ones, replies as the channel account with an optional bot account.
- 2026-10-28: Josh: 58.1 accepts any Twitch account as the channel, for testing; a test account shows a warning and never switches Mix It Up off. 56.1 merged (#619); first automatic release bridge-v0.12.0 published by the workflow.
- 2026-10-28: Track 56 done (#619, #622, #623, #624) and archived. Josh: keep going through Tracks 57 and 58.
