# The Cheesy TCG, roadmap

**Last updated 2026-10-19**

Open work only. Owned by the planning model (Opus, see "Model workflow" in `CLAUDE.md`). Execution picks up items marked Ready; Needs design or Needs a decision goes back to planning (or to the user) first. When an item ships, delete it here and make sure its area doc in `docs/` describes the result. Finished items and their original designs are archived in `docs/archive/roadmap-history.md`; read it only when you need the reasoning behind a done item.

**Status legend:** Ready (the design here is enough to build) · Needs design · Needs a decision (the user chooses) · Blocked (waiting on something outside the repo).

## Rules in force

- **Twitch panel freeze (from 2026-10-15).** The extension is under Twitch review. Do not touch `public/twitch-panel/*`, `scripts/lib/twitch-package.mjs`, the behaviour or response shape of `/api/twitch/*`, or the CORS rules in `middleware.ts` until the user lifts it. Panel-worthy ideas go under "Next extension version".
- One feature per PR, branched from up-to-date `origin/main`; every push gets a PR (see "Git and PRs" in `CLAUDE.md`).
- No em dashes, no emoji in the UI, FAQ / Privacy / Terms kept in step (`scripts/check-words.mts`), `npm run verify` before every PR.

## Open items

| # | Item | Status | Size |
|---|------|--------|------|
| 31.1 | FAQ Editor on Admin dashboard (Issue #294) | Ready | M |
| Ext | Next extension version | Blocked (panel freeze) | L |
| 29.5 | Let Golden be pulled, including the Twitch panel | Blocked (panel freeze) | M |
| 30.4 | Use a trainer card from the Twitch panel | Blocked (panel freeze) | S |

27.2 is unused on purpose: the master set achievement is already shipped (see "Already on the site" under tracks 25 to 30). 29.2 is unused on purpose: the read-only audit and the dry-run script shipped inside 29.1. 29.3 is not in the table: stars keep setting the value, so there is no PR.

### 31.1 FAQ Editor on Admin dashboard (Ready, M)

Decided 2026-10-19 (GitHub Issue #294). Admins can edit the FAQ directly from the dashboard (`/admin/faq`), reorder section blocks, add new questions, edit answers, create custom sections, and toggle visibility.

- **Store & Core (`lib/faq-core.ts`, `lib/faq.ts`):** `FaqStoreData` backed by KV `site:faq`. Section blocks can be reordered, hidden, or created. Built-in sections (`start`, `commands`, `cards`, `trading`, `upgrades`, `profile`, `show`, `points`, `seasons`, `extension`, `privacy`, `help`) provide default ordering and built-in questions. Custom questions support formatted answers (paragraphs, bold, bullet points, links).
- **Admin UI (`app/admin/faq/page.tsx`, `FaqEditorClient.tsx`):** Nav entry in `lib/admin-nav.ts` under Community (`/admin/faq`, icon `help`, shortcut `q`). Reorder section blocks (move up/down), toggle section visibility, add/edit/delete custom questions, and reorder questions within sections. Armed deletion for custom questions and custom sections. Armed reset to defaults. All actions guarded by `requireAdmin()` and logged via `recordAudit`.
- **Public Site (`app/(site)/faq/page.tsx`, `parts.tsx`):** Reads `getFaqStore()`. Dynamic nav pills and section blocks render in configured order. Built-in sections render their base questions plus any custom questions assigned to that block. Custom sections render with their icon and questions.
- **Checks & Docs:** `scripts/check-faq.mts` (store normalization, CRUD operations, ordering, staff guard, mock KV). Update `docs/admin.md` and `docs/public-site.md`.


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

### Tracks 25 to 30: order

Parallel streams, so no two open PRs edit the same files:
- **widget.js:** 29.4 (29.1 is done).
- **Mix It Up:** 30.2 extends `effectiveLimit` after 30.1. Do not run 30.2 beside another edit of `lib/pull-limit-core.ts`.
- **Variants:** 29.4 (29.1 is done). There is no points PR: stars keep setting the value (see 29.3). 29.5 waits for the freeze.
- **Trainers and achievement bonuses:** 30.1, then 30.2, then 30.3, and 27.5 after 30.1 (it picks a buff from that catalogue). 30.4 waits for the freeze.

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
- [ ] **Email (22.1):** if not done yet, set `RESEND_API_KEY`, `EMAIL_FROM` and `RESEND_WEBHOOK_SECRET` in Vercel (see `docs/hosting.md`) to switch email notifications on.
