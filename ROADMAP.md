# The Cheesy TCG, roadmap

**Last updated 2026-10-20**

Open work only. Owned by the planning model (Opus, see "Model workflow" in `CLAUDE.md`). Execution picks up items marked Ready; Needs design or Needs a decision goes back to planning (or to the user) first. When an item ships, delete it here and make sure its area doc in `docs/` describes the result. Finished items and their original designs are archived in `docs/archive/roadmap-history.md`; read it only when you need the reasoning behind a done item.

**Status legend:** Ready (the design here is enough to build) · Needs design · Needs a decision (the user chooses) · Blocked (waiting on something outside the repo).

## Rules in force

- **Twitch panel freeze (from 2026-10-15).** The extension is under Twitch review. Do not touch `public/twitch-panel/*`, `scripts/lib/twitch-package.mjs`, the behaviour or response shape of `/api/twitch/*`, or the CORS rules in `middleware.ts` until the user lifts it. Panel-worthy ideas go under "Next extension version".
- One feature per PR, branched from up-to-date `origin/main`; every push gets a PR (see "Git and PRs" in `CLAUDE.md`).
- No em dashes, no emoji in the UI, FAQ / Privacy / Terms kept in step (`scripts/check-words.mts`), `npm run verify` before every PR.

## Open items

| # | Item | Status | Size |
|---|------|--------|------|
| Ext | Next extension version | Blocked (panel freeze) | L |
| 29.5 | Let Golden be pulled, including the Twitch panel | Blocked (panel freeze) | M |
| 30.4 | Use a trainer card from the Twitch panel | Blocked (panel freeze) | S |
| 32.1 | Buff credits: free pulls, dead extra-pulls buff, races | Ready | M |
| 32.2 | Variant glow and rock CSS regressions | Ready | S |
| 32.3 | FAQ editor hardening | Ready | S |
| 32.4 | Discord link: relink and one-account claim | Ready | S |
| 32.5 | New pack flow leftovers | Ready | S |
| 32.6 | Variant scripts and the Shiny label leftovers | Ready | S |
| 32.7 | GEMINI.md becomes a pointer to CLAUDE.md | Ready | XS |
| 32.8 | Tabbed staff What's new and issue form links | In progress | S |

27.2 is unused on purpose: the master set achievement is already shipped (see "Already on the site" under tracks 25 to 30). 29.2 is unused on purpose: the read-only audit and the dry-run script shipped inside 29.1. 29.3 is not in the table: stars keep setting the value, so there is no PR.


### Next extension version (Blocked until the freeze lifts)

**Security, panel collection (ship with the next panel version, not before the freeze lifts).** `GET /api/twitch/collection` takes `username` and returns that viewer's card numbers for every season they have cards in, including drafts, with no session, extension JWT or private-profile check. The released panel calls it that way (`public/twitch-panel/panel.js`, no `Authorization` header). When the freeze lifts: drop draft seasons; for a private profile return cards only when the caller is that viewer (a Twitch extension JWT checked with `verifyExtensionAuth`, or a website session); keep the JSON shape `{ username, collections: [{ seasonId, seasonName, active, ownedNumbers }] }`. Public profiles can keep answering without a token so the panel already under review still loads. Do not change this route, `public/twitch-panel/*`, the package builder or the extension CORS while the freeze is on.

Ship as one reviewed panel version: the pack card back on the panel's flip backs (20.3), choosing prints when trading (6.4: composer and accept picker, exact serial preview), favourite prints (9.1: hearts and disabled picks), "Reversed by staff" on reversed trades (9.2), staff and tester badges, achievements, Looking for / listing alerts, the binder, share images, the copies-first dialog (2.5), unique numbers on tiles (2.1), a link to `/trade/<id>` from the Trades tab, anything Twitch reviewers asked for. Bump `version` in `package.json`, rebuild the zip, refresh screenshots, update the change log in `twitch-extension/SUBMISSION.md`. When the freeze lifts, also take 29.5 and 30.4 from the blocked list below.

## Tracks 25 to 30: Discord list of 2026-10-19, plus two new card features

From Cheesygidds and Joshua in Discord (the two screenshots), checked against `main` on 2026-10-19. One PR per item, each branched from up-to-date `origin/main`. New UI uses the daisyUI 5 `cheesy` primitives (`btn`, `card`, `input`, `select`, `badge`, `fieldset`). No em dashes. Public copy uses `CHANNEL_NAME` / `CHANNEL_URL` from `lib/site.ts`.

**Glossary (decided 2026-10-19, built in 25.2).** A person's copy of a card is an **edition**, not a print ("your recent editions"). The game-wide id is **Edition #1023381** (`Copy.uid`). The line that today says "Edition #24 of 28" is the sequence, and it becomes **Print #24 of 28** (`Copy.n`). That sequence is what the points bonus uses. Code, KV and URLs keep saying copy, serial and uid. `scripts/check-words.mts` requires these words. The Twitch panel still says print for a copy.

**Already on the site (do not rebuild):**
- **Master set.** `evaluateSeason` in `lib/achievements.ts` already awards `master` ("Master set: {season}", own every card in every version). The FAQ already says so (`app/(site)/faq/sections/profile.tsx`, "What are achievements?"). The goal is omitted when every card has only Regular, because it would be the same as Completed. Season 1's pack has upgrades off, so the goal does not show there. Turning versions on is what makes it appear. No new kind.
- **How are points worked out?** and **Can I see the exact maths for a card?** are in `app/(site)/faq/sections/points.tsx`. The print-bonus sentence uses the live cutoff, and the formula calls have no space inside the brackets. Do not add a second copy of either question.
- **Pull history on the profile.** The Activity tab lists pulls (card, version, sequence, linked to the print or the card dex), upgrades (linked to the print they made) and accepted trades (linked when the event has a trade id). Admin grants and declined offers stay off it.
- **Public wordmark.** `SiteNav` links the logo and "The Cheesy TCG" to `/`. The admin sidebar brand and the phone top-bar title link to `/admin`. The mod bar links to `/mod`.

### Where each Discord line went

| Discord line | Item |
|---|---|
| Home layout: Card of the week, card name, print, edition, held by, See its journey | Done |
| Change the name of print to edition (swap the names round) | Done |
| Collectors page: Top collectors, collector name, 24/25 cards, Card dex | Done |
| Text should say Bottomgidds, not bottomygidds | Done |
| Font change on the card back editor | Done |
| Edit profile shows twice; remove the one by the name; split Edit profile and settings | Done |
| Share image: My best 1, top 3, top 6, top 9, custom; unselected goes grey, not yellow | Done |
| Share image straight to a Discord channel (channel not created yet) | Done |
| Profile collection: holo moves very fast on the top 3 cards (Mac only) | Done |
| Collection cards do not need text on hover or along the bottom | Done |
| Print/edition pill cannot be seen (see-through gold/yellow) | Done |
| Profile activity should show card pull history as well as trades, click for details | Done |
| FAQ How do I get cards: follow, subscribe, or gifting subs | Done |
| New FAQ: is there a limit to how many cards per stream (defaults and bonuses) | Done |
| Trading before upgrading; under upgrades, can I trade upgraded cards | Done |
| Chat commands under Getting started; move !pack there; link from How do I get cards | Done |
| FAQ Points and leaderboard: how are points worked out | Done |
| "Edition #1 is worth 3x ... until the 40th edition" | Done: print #1 through the live cutoff (40th when the cutoff is 40) |
| Master set achievement: every variant of every card | Already shipped (see above) |
| Achievement editor? | Done |
| FAQ: can I see the exact maths for a card | Done |
| Spacing looks weird on some of the brackets | Done |
| Cheesy TCG logo goes to the homepage, or the dashboard in admin | Done |
| Default limits for subscribers, mods, broadcaster, VIPs and regular | Done |
| !showoff pulls from the user's profile showcase | Done |
| Option to edit the showcase on a person's profile | Done |
| Generate a Mix It Up command from settings (commands and pulls) | Done |
| Align variant with rarity, plus a Golden variant (Joshua) | 29.1 (done), 29.3, 29.4, 29.5 |
| Trainer cards and a Buff Editor (Joshua) | 30.1 to 30.4 |

## Track 32: review of PRs #297 to #310 (2026-10-20)

Those PRs were merged without a review. Findings were checked against `main`. One PR per item, each from up-to-date `origin/main`. Each fix adds a regression case to the matching `scripts/check-*.mts`. 32.1 to 32.6 touch different files and can run in parallel, except that 32.2 and 32.6 both touch variant labels: run 32.6 after 32.2.

### 32.1 Buff credits (Ready, M, do first)
- **Free pulls forever.** `app/api/collection/route.ts` calls `consumePullOnSave(..., { seasonId: name })` with the collection name, but buffs store `season.id` (`lib/buffs.ts` `useTrainerCard`, `lib/achievements-store.ts`). `stepActiveBuff` then drops the buff before taking a credit, and `hasExtraPackCredit` passes no season, so it keeps returning true. Pass the active `season.id` on both sides. `scripts/check-buffs.mts` uses one id for both, so give it different season and collection ids.
- **Extra pulls per stream does nothing.** `totalExtraPullsFromBuffs` (`lib/buffs-core.ts`) is never called. Add it to `extra` in `reservePaidPull` (`lib/mixitup.ts`) and `doPullsLeft` (`lib/commands.ts`).
- **One credit, many pulls.** `reservePaidPull` checks the credit but reserves nothing, so pulls queued before the first save all skip the fee. Reserve the credit at reservation time and give it back in `releasePaidPull`.
- **Lost writes.** Buff lists (`user:<u>:buffs`, `buffs:community`) are read, changed and written with no lock. Wrap the writes in `withLock` on the buff key. `useTrainerCard` applies the buff before `saveCollection`, so save the collection first or undo the buff on error.
- **Achievement bonus.** `syncAchievements` marks the goal earned before applying the buff, and a failed apply is swallowed. Two page views can both apply it. Claim each goal with a set-if-absent, then apply, then log a skipped grant. Decide before shipping whether achievements earned before 27.5 should pay out on first sync (today they all do).
- **Smaller.** Save `streamKeys` updates even when no credit was used. Return a reason code from `useTrainerCard` instead of the string match in `lib/commands.ts`. A `grant-achievement` buff can never be applied (`invalid_type`): wire it or hide it in the Buff Editor.

### 32.2 Variant glow and rock CSS (Ready, S)
- `buildHoloSpecs` (`lib/holo-core.ts`) sets `on: true` when only glow or rock is on, so `holoClass()` adds the default shimmer to a variant whose shimmer is off. Add a separate shimmer flag, used by `holoClass`, while `holoVars` keeps the glow and rock variables.
- `app/globals.css` (#308) added `.vfx-reverse` to the `!important` glow rule, the rock animation and the `.ug-art` / `.tr-art` rules. That overrides the rarity box shadow on the copy page, Card Dex, `CardDetail` and `PrintOfWeek`. Take `.vfx-reverse` out, restore the old blue and amber glow fallbacks and the 1.6deg Full Art Holo rock, and only animate when `--rock-amt` is set.
- Add a check: shimmer off with glow on gives `holoClass() === ''`.

### 32.3 FAQ editor hardening (Ready, S)
- Section icons are cast, not checked (`lib/faq-core.ts` `cleanSectionInput`, `normalizeFaqStore`). An unknown icon crashes `/faq`. Check against the `ICONS` keys and fall back to `help`.
- `updateFaqQuestionAction` drops `order` and `createdAt`, so an edited question jumps to the top. Keep the existing values.
- Reject a question whose `sectionId` is not a section, and toggle or reorder calls for an unknown section.
- The link parser accepts `//host` as a site path. Use `\/(?!\/)`.

### 32.4 Discord link (Ready, S)
- `saveDiscordLink` (`lib/discord-user.ts`) leaves the old `discord:user:<id>` index when a collector links a different Discord account, so that account can never be linked again. Delete the old index.
- Claim the index with `set nx` before writing the link, so two collectors cannot link one Discord account. Add a 30 second cooldown on the test DM. Log only the status code of Discord errors.

### 32.5 New pack flow leftovers (Ready, S)
- The dashboard "New pack" shortcut (`app/admin/dashboard/widgets.tsx`) still links `/admin/packs/new`, which only redirects. Use `NewPackButton`.
- `SeasonFlow` "Create a pack" now leaves the wizard in the same tab and can drop unsaved season edits. Open the new pack in a new tab, or flush the autosave first.
- `createDraftPack` has no `revalidatePath`. `PackWorkspace` reloads the page after publish: use `router.refresh()`. Fix `docs/admin/packs-and-seasons.md` ("the wizard's").

### 32.6 Variant scripts and labels (Ready, S, after 32.2)
- `scripts/migrate-variant-rarity.mts` and `scripts/audit-variant-rarity.mts` cannot run. They import functions that are not exported, read `cardId` instead of `cardNumber`, compare string ids with numbers, and use a 100000 offset instead of `VARIANT_OFFSET`. Delete them unless someone needs the remap. If it is kept, rewrite it against the real APIs with a mock-KV check.
- Rename the leftover user-visible "Shiny" labels to Full Art Holo or FH: `app/admin/seasons/[id]/page.tsx`, `app/admin/dashboard/widgets-extra.tsx`, `lib/dashboard.ts`, `lib/activity-view.ts`, `app/admin/activity/SummaryStrip.tsx`, `app/admin/users/UsersList.tsx`, `app/admin/components/AddCardDialog.tsx`, and docs. The internal id stays `shiny`.
- Small: drop the unused `GuidesMenu` import in `app/admin/overlay/EditorTopBar.tsx`.

### 32.7 GEMINI.md (Ready, XS)
GEMINI.md is a hand-kept copy of CLAUDE.md and has already drifted. Replace it with a short pointer: follow CLAUDE.md, the only rules file.

### 32.8 Tabbed staff What's new and issue form links (In progress)
- `/admin/changelog` gets Admin, Mod and Players tabs. The PR `Audience:` line takes players, admin, mod, staff (admin and mod) or all. Each generated entry has an Edit link to its PR on GitHub, and an edit shows after the next deploy. `/mod/changelog` shows the mod list.
- "Report a problem" opens the bug report issue form (`?template=bug_report.yml`, page in the steps field). Idea links can also open the feature request form.

### PR descriptions to fix (needs Joshua's OK, they are public)
`scripts/build-changelog.mjs` publishes only the bullets under `## Changelog`. #301 has no section, and #302 and #306 have prose only, so the Golden labels, variant styles and Discord DM alerts are missing from What's new. #303 has no Audience or Tags lines. Edited bodies show after the next deploy.

## Standing decisions

- Paid-pull limits default to no limit and stay editable. Staff can add extra pulls for everyone for the current stream.
- Stars keep setting the card value.
- Trainer cards can be traded until used.
- The Twitch panel freeze is still on. The panel still says print for a copy.

**Twitch panel freeze:** nothing in a Ready item edits `public/twitch-panel/*`, `scripts/lib/twitch-package.mjs`, the behaviour or response shape of `/api/twitch/*`, or the CORS rules in `middleware.ts`. 29.5, 30.4, and the panel's copy of the edition/print words (25.2) are the exceptions and they are blocked.

### 29.3 Stars keep setting the value (decided, no PR)

Decided 2026-10-19. The stars on a card keep setting its value. The version multiplier stays as it is today (`baseScore × rarity from Card.stars × variantMultiplier × print bonus` in `lib/leaderboard.ts`). A Golden edition, once it exists, gets a version multiplier the same way a Full Art Holo does. It does not replace the stars.

The names in 29.1 (Regular/Common through Golden/Legendary) are labels on the versions. The star names (Common through Legendary) stay too. Do not change `copyPoints`. Do not open a PR for this.

### 29.5 Let Golden be pulled, including the Twitch panel (Blocked, panel freeze)

When the freeze lifts, in the same panel version as Ext:
- Turn `GOLDEN_PULLS` on. Packs opt in by setting a Golden weight (default stays 0, so nothing changes until a pack is edited).
- Teach `public/twitch-panel/panel.js` (and its CSS) the five-id list and index 4, or Golden entries render as a bad card number. Collection, season and upgrade responses may gain the new variant in existing arrays; do not change the JSON keys. `/api/twitch/upgrade` must understand a step up to Golden once the ladder includes it.
- Overlay already learned Golden in 29.1 and 29.4.
- Rebuild the extension zip (`scripts/lib/twitch-package.mjs` is in the freeze too). Bump `version`, screenshots, `twitch-extension/SUBMISSION.md`.

### 30.4 Use a trainer card from the Twitch panel (Blocked, panel freeze)

The panel can already show the card as a normal collection entry (Regular encoding). It has no Use button, and it must not grow one during the freeze. When the freeze lifts, add Use next to Upgrade on that card only, calling a new field on an existing authenticated route or a new `/api/twitch` route in that panel version (not before). Same two-tap, same consume rules as 30.2.


## Blocked by the Twitch freeze

Do not touch `public/twitch-panel/*`, `scripts/lib/twitch-package.mjs`, the behaviour or response shape of `/api/twitch/*`, or the CORS rules in `middleware.ts` until Joshua lifts the freeze.

| Item | What waits |
|---|---|
| Ext | The whole next panel version, including the collection privacy fix already written above |
| 29.5 | Decoding and drawing Golden. Until then `GOLDEN_PULLS` stays off, so no index-4 number is ever written |
| 30.4 | A Use button in the panel. Website use (30.2) and the chat command (30.3) do not wait |
| 25.2 panel strings | The website and the overlay changed in 25.2. The panel still says print for a copy until the freeze lifts |

Ready items above were checked against this list. Showoff, paid-pull limits, share images, the FAQ and the card back editor do not go through the frozen paths.

## Open questions for Joshua

None on tracks 25 to 30. The last three answers (2026-10-19): every role's pull limit starts at no limit and staff edit the five numbers in admin, plus a this-stream extra for everyone (28.1); stars keep setting the card's value and the score formula does not change (29.3); a trainer card can be traded until someone uses it (30.2).

## User steps still open

Outside the repo; tick off or delete when done (listed as of 2026-10-16).
- [ ] **Overlay key (13.2):** copy the browser-source address (ends `?key=...`) from Settings → OBS Overlay into every OBS browser source, and each scene's address from the Overlay Editor, then refresh the sources. Clear the pull queue first.
- [ ] **Mix It Up paid pulls (Track 12), when wanted:** a Mix It Up webhook command answering `{ "balance": n }` for `action: "balance"` and taking the currency for `action: "deduct"`; then fill in the Mix It Up admin page, press **Check balance** and **Send test message**, and switch it on.
- [ ] **Web Push keys:** set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` the legal contact) in Vercel Production, redeploy, then try a real iPhone (app installed), Android and a desktop browser.
- [ ] **GitHub webhook (3.5):** repo Settings → Webhooks, Payload URL `<discord webhook URL>/github`, events: pushes, pull requests, releases, deployment statuses.
- [ ] **Discord channels:** add the channels you want in Admin → Settings → Webhooks (Trade listings, Admin log, System, Recap, Feedback) and press Test on each.
- [ ] **Share-image channel (26.6):** create the Discord channel, paste its webhook under Admin → Settings → Webhooks, tick Shares, and press Test. The button on the share tab does nothing until this exists.
- [ ] **Card name (25.3):** in the pack workspace, rename the live card Bottomygidds to Bottomgidds. The seed fix does not rewrite production.
- [ ] **Print bonus cutoff (27.4):** after that PR is deployed, open Admin → Settings → Scoring and set the cutoff to 40 if the saved value is still 20, then save. The new default does not overwrite a saved value, and scores move when you save.
- [ ] **iPhone icon (1.1, 7.1):** remove the home-screen app, delete `cheesytcg.app` under Settings > Apps > Safari > Advanced > Website Data, add it again from Safari; confirm the cheese logo shows.
- [ ] **Discord DM alerts (4.4):** create a Discord application and bot, invite the bot to the Cheesygidds server, add the redirect `https://cheesytcg.app/auth/discord/callback` in the Discord developer portal, and set `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and `DISCORD_BOT_TOKEN` in Vercel. The option stays hidden until then.
- [ ] **Email (22.1):** if not done yet, set `RESEND_API_KEY`, `EMAIL_FROM` and `RESEND_WEBHOOK_SECRET` in Vercel (see `docs/hosting.md`) to switch email notifications on.
