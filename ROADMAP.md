# The Cheesy TCG, roadmap

Open work only. Owned by the planning model (Opus, see "Model workflow" in `CLAUDE.md`). Execution picks up items marked **Ready**; **Needs design** or **Needs a decision** goes back to planning (or to the user) first. When an item ships, delete it here and make sure its area doc in `docs/` describes the result. Finished items and their original designs are archived in `docs/archive/roadmap-history.md`; read it only when you need the reasoning behind a done item. Last updated 2026-10-19 (tracks 25 to 30 planned from the Discord list and two new card features. 24 shipped. Panel-collection security note still blocked by the freeze).

**Status legend:** Ready (the design here is enough to build) · Needs design · Needs a decision (the user chooses) · Blocked (waiting on something outside the repo).

## Rules in force

- **Twitch panel freeze (from 2026-10-15).** The extension is under Twitch review. Do not touch `public/twitch-panel/*`, `scripts/lib/twitch-package.mjs`, the behaviour or response shape of `/api/twitch/*`, or the CORS rules in `middleware.ts` until the user lifts it. Panel-worthy ideas go under "Next extension version".
- One feature per PR, branched from up-to-date `origin/main`; every push gets a PR (see "Git and PRs" in `CLAUDE.md`).
- No em dashes, no emoji in the UI, FAQ / Privacy / Terms kept in step (`scripts/check-words.mts`), `npm run verify` before every PR.

## Open items

| # | Item | Status | Size |
|---|------|--------|------|
| 20.2f | One flow for new packs; the pack wizard goes | Ready | M |
| 23.2 | Overlay Editor: split the rest | Needs design | M |
| 4.4 | Link a Discord account for DMs | Needs a decision | L |
| Ext | Next extension version | Blocked (panel freeze) | L |
| 25.1 | Home: Card of the week | Ready | S |
| 25.2 | Swap the player-facing names print and edition | Needs a decision | L |
| 25.3 | Collectors page rows, and the Bottomgidds name | Ready | S |
| 26.1 | Profile: one Edit profile, and a separate Settings link | Ready | S |
| 26.2 | Collection tiles: no name overlay, readable edition pill | Ready | S |
| 26.3 | Collection holo sweeps too fast on Mac | Ready | S |
| 26.4 | Profile activity: pulls as well as trades, with a link | Ready | S |
| 26.5 | Share image: My best 1, Top 3, Top 6, Top 9, Custom | Ready | S |
| 26.6 | Post a share image straight to Discord | Ready | M |
| 26.7 | Editable profile showcase, and !showoff uses it | Ready | M |
| 26.8 | Wordmark links home, or to the dashboard in admin | Ready | S |
| 27.1 | FAQ pass: cards, commands, trading, points, brackets | Ready | M |
| 27.3 | Achievement editor | Needs a decision | M |
| 27.4 | Edition bonus cutoff: 20 today, 40 in the request | Needs a decision | S |
| 28.1 | Default pull limits per Twitch role | Needs a decision | M |
| 28.2 | Generate a Mix It Up command from the saved settings | Ready | M |
| 28.3 | Font control on the card back editor | Needs a decision | S |
| 29.1 | Variant ladder gains Golden; labels; read-only audit | Ready | M |
| 29.3 | Points follow the variant rarity | Needs a decision | M |
| 29.4 | Golden card look (site and overlay) | Needs a decision | M |
| 29.5 | Let Golden be pulled, including the Twitch panel | Blocked (panel freeze) | M |
| 30.1 | Trainer cards: buff model and Buff Editor | Needs a decision | L |
| 30.2 | Use a trainer card: consume, buff, audit | Ready (after 30.1) | M |
| 30.3 | Chat command to use a trainer card | Ready (after 30.2) | S |
| 30.4 | Use a trainer card from the Twitch panel | Blocked (panel freeze) | S |

27.2 is unused on purpose: the master set achievement is already shipped (see "Already on the site" under tracks 25 to 30). 29.2 is unused on purpose: the read-only audit and the dry-run script ship inside 29.1.

### 20.2f One flow for new packs; the wizard goes (Ready, M)

Last part of the pack workspace (20.2a to 20.2e are done; the workspace is described in `docs/admin/packs-and-seasons.md`).
- **New pack** (the library's button and the command palette) asks only for a name, creates the draft (`createDraftPack`) and opens the workspace on it.
- A draft shows a **Publish checklist** in the top bar (replacing the wizard's Review step, from `validatePack` and `packHealth`): has a name and cover, at least one card, every card has art, a name and odds above 0, stars set on imported cards, Full Art cards have full art where the versions need it, in at least one season (or "publish without a season" with the warning). **Publish** stays disabled until the blocking items pass; warnings can be accepted.
- `PackFlow` and the wizard routes are removed; `/admin/packs/new?draft=<id>` redirects to `/admin/packs/<id>`. The season wizard (`SeasonFlow`) is unchanged.
- Update `docs/admin/packs-and-seasons.md` ("Drafts & wizards"), `docs/admin/routes.md` (the pack routes), `docs/admin/ux-conventions.md` (widths: the pack workspace is the second full-width workspace after the Overlay Editor) and `CLAUDE.md`'s wizards convention (packs use the workspace; seasons keep the wizard).
- **Not changed:** card and pack data shapes, KV keys, the public site, the overlay, the Twitch panel.
- **Checks:** `npm run verify`, `scripts/check-pack-editor.mts` grown for the draft and publish path, and a hand pass against the mock KV at 1280px and 390px. Blob uploads can't be checked locally; say so in the PR.

### 23.2 Overlay Editor: split the rest (Needs design)

23.1 split the five largest files. `OverlayEditor.tsx` is still ~50 KB: the top bar shell, the preview stage (~21 props: refs, fit and frame size, guide flags, drag handlers), the preview toolbar and the properties panel header and body (`renderRow`, `renderSection`) stay inline because each would need more than ~15 props. Splitting them needs a state design first, for example a `useOverlayEditor` hook or a small context for the editor's state and actions. Planning pass needed; not urgent.

### 4.4 Link a Discord account for DMs (Needs a decision)

DMs need a **Discord bot**, not a webhook. The open question for the user: is a bot in the server acceptable (it shows in the member list, and its token is one more secret)? Revisit once push notifications (4.3) have been live for a while.

Sketch, if yes:
- User setup: a Discord application with a bot, invited to the Cheesygidds server (it can only DM people who share a server and allow DMs). Env: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`.
- Linking: Settings → Notifications → **Link Discord** runs Discord OAuth with `identify` only (code → token → read the id → revoke, never stored). Saved as `user:<u>:discord` `{ id, username, linkedAt }` plus `discord:user:<discordId>` → login (one Discord account per viewer). Unlink button; the export and Privacy Policy include it.
- Sending: `notify()` → for kinds ticked for Discord, "create DM channel" then "create message" with the bot token, in `after()`. On 50007 (DMs closed) record it and show "We couldn't DM you, check your privacy settings for the server" in Settings. One retry after `retry_after` on rate limits.

### Next extension version (Blocked until the freeze lifts)

**Security, panel collection (ship with the next panel version, not before the freeze lifts).** `GET /api/twitch/collection` takes `username` and returns that viewer's card numbers for every season they have cards in, including drafts, with no session, extension JWT or private-profile check. The released panel calls it that way (`public/twitch-panel/panel.js`, no `Authorization` header). When the freeze lifts: drop draft seasons; for a private profile return cards only when the caller is that viewer (a Twitch extension JWT checked with `verifyExtensionAuth`, or a website session); keep the JSON shape `{ username, collections: [{ seasonId, seasonName, active, ownedNumbers }] }`. Public profiles can keep answering without a token so the panel already under review still loads. Do not change this route, `public/twitch-panel/*`, the package builder or the extension CORS while the freeze is on.

Ship as one reviewed panel version: the pack card back on the panel's flip backs (20.3), choosing prints when trading (6.4: composer and accept picker, exact serial preview), favourite prints (9.1: hearts and disabled picks), "Reversed by staff" on reversed trades (9.2), staff and tester badges, achievements, Looking for / listing alerts, the binder, share images, the copies-first dialog (2.5), unique numbers on tiles (2.1), a link to `/trade/<id>` from the Trades tab, anything Twitch reviewers asked for. Bump `version` in `package.json`, rebuild the zip, refresh screenshots, update the change log in `twitch-extension/SUBMISSION.md`. When the freeze lifts, also take 29.5 and 30.4 from the blocked list below.

## Tracks 25 to 30: Discord list of 2026-10-19, plus two new card features

From Cheesygidds and Joshua in Discord (the two screenshots), checked against `main` on 2026-10-19. One PR per item, each branched from up-to-date `origin/main`. New UI uses the daisyUI 5 `cheesy` primitives (`btn`, `card`, `input`, `select`, `badge`, `fieldset`). No em dashes. Public copy uses `CHANNEL_NAME` / `CHANNEL_URL` from `lib/site.ts`.

**Glossary in force until 25.2 is answered.** A **print** is one copy you own. Its **print number** is the game-wide id (`Copy.uid`, "Print #1023381"). Its **edition number** is the per card and per version sequence (`Copy.n`, "Edition #7"), and that sequence is what the points bonus uses. Code, KV and URLs keep saying copy, serial and uid. `scripts/check-words.mts` enforces the player-facing words.

**Already on the site (do not rebuild):**
- **Master set.** `evaluateSeason` in `lib/achievements.ts` already awards `master` ("Master set: {season}", own every card in every version). The FAQ already says so (`app/(site)/faq/sections/profile.tsx`, "What are achievements?"). The goal is omitted when every card has only Regular, because it would be the same as Completed. Season 1's pack has upgrades off, so the goal does not show there. Turning versions on is what makes it appear. No new kind.
- **How are points worked out?** and **Can I see the exact maths for a card?** already exist in `app/(site)/faq/sections/points.tsx`. 27.1 tightens the wording and the bracket spacing. It does not add a second copy of either question.
- **Pull history on the profile.** The Activity tab already lists pulls, upgrades and accepted trades (`PUBLIC_ACTIVITY_TYPES` in `app/u/[username]/ProfileTabs.tsx`). 26.4 adds the click-through and makes a pull row read as a pull.
- **Public wordmark.** `SiteNav` already links the logo and "The Cheesy TCG" to `/`. 26.8 is the admin wordmark, which is not a link today.

### Where each Discord line went

| Discord line | Item |
|---|---|
| Home layout: Card of the week, card name, print, edition, held by, See its journey | 25.1 |
| Change the name of print to edition (swap the names round) | 25.2 |
| Collectors page: Top collectors, collector name, 24/25 cards, Card dex | 25.3 |
| Text should say Bottomgidds, not bottomygidds | 25.3 |
| Font change on the card back editor | 28.3 |
| Edit profile shows twice; remove the one by the name; split Edit profile and settings | 26.1 |
| Share image: My best 1, top 3, top 6, top 9, custom; unselected goes grey, not yellow | 26.5 |
| Share image straight to a Discord channel (channel not created yet) | 26.6 |
| Profile collection: holo moves very fast on the top 3 cards (Mac only) | 26.3 |
| Collection cards do not need text on hover or along the bottom | 26.2 |
| Print/edition pill cannot be seen (see-through gold/yellow) | 26.2 |
| Profile activity should show card pull history as well as trades, click for details | 26.4 |
| FAQ How do I get cards: follow, subscribe, or gifting subs | 27.1 |
| New FAQ: is there a limit to how many cards per stream (defaults and bonuses) | 27.1 now, 28.1 when roles exist |
| Trading before upgrading; under upgrades, can I trade upgraded cards | 27.1 |
| Chat commands under Getting started; move !pack there; link from How do I get cards | 27.1 |
| FAQ Points and leaderboard: how are points worked out | 27.1 (question already exists) |
| "Edition #1 is worth 3x and the bonus decreases until the 40th edition of that card is created" | 27.1 for the sentence, 27.4 for the number 40 |
| Master set achievement: every variant of every card | Already shipped (see above) |
| Achievement editor? | 27.3 |
| FAQ: can I see the exact maths for a card | 27.1 (question already exists) |
| Spacing looks weird on some of the brackets | 27.1 |
| Cheesy TCG logo goes to the homepage, or the dashboard in admin | 26.8 |
| Default limits for subscribers, mods, broadcaster, VIPs and regular | 28.1 |
| !showoff pulls from the user's profile showcase | 26.7 |
| Option to edit the showcase on a person's profile | 26.7 |
| Generate a Mix It Up command from settings (commands and pulls) | 28.2 |
| Align variant with rarity, plus a Golden variant (Joshua) | 29.1, 29.3, 29.4, 29.5 |
| Trainer cards and a Buff Editor (Joshua) | 30.1 to 30.4 |

### Tracks 25 to 30: order

Parallel streams, so no two open PRs edit the same files:
- **Home:** 25.1 (`PrintOfWeek.tsx`, `app/(site)/page.tsx`, the print-of-the-week FAQ line). 25.3 is separate files and can run beside it.
- **Profile header:** 26.1 (`ProfileHeader.tsx`, `ProfileBasicsEditor.tsx`). 26.8 is the admin shell only.
- **Collection grid:** 26.2, then 26.3 (both touch `CollectionGrid.tsx` and `app/globals.css`).
- **Activity:** 26.4 (`ProfileTabs.tsx`, `lib/activity.ts`, `lib/trade-notify.ts`).
- **Share:** 26.5, then 26.6 (both touch `ShareStudio.tsx`; 26.6 also touches Discord).
- **Showcase:** 26.7. Start it after 26.5 if both would edit the share candidate list; otherwise it can run beside 26.5. It does not edit `public/widget.js`.
- **FAQ:** 27.1. 27.4 is a settings change and waits for an answer. Do not start 27.1 and 25.2 together: both edit the FAQ glossary.
- **Mix It Up:** 28.2 can start now. 28.1 waits for the five numbers. 30.2 also writes `PullBuff` rows: do not run 28.1 and 30.2 at the same time (`lib/pull-limit-core.ts`).
- **Variants:** 29.1 (includes the audit and the dry-run script), then 29.4 after the look is accepted, then 29.3 after the score deltas are accepted. 29.5 waits for the freeze.
- **Trainers:** 30.1 after the buff list and the trade answer, then 30.2, then 30.3. 30.4 waits for the freeze.
- **Left until answered, not in a stream:** 25.2, 27.3, 27.4, 28.3.

**Twitch panel freeze:** nothing in a Ready item edits `public/twitch-panel/*`, `scripts/lib/twitch-package.mjs`, the behaviour or response shape of `/api/twitch/*`, or the CORS rules in `middleware.ts`. 29.5 and 30.4 are the exceptions and they are blocked. 25.2, if accepted, changes player-facing words in the panel too: those strings wait for the freeze (see the blocked section).

### 25.1 Home: Card of the week (Ready, S)

The home block is "Print of the week" (`app/components/site/PrintOfWeek.tsx`, data from `potw:current`, docs in `docs/serials.md` and `docs/public-site/home.md`). Keep the pick, the KV keys and the admin feature button. Change the player-facing layout only.

- Title: **Card of the week**.
- Lines, in this order: **card name** (version + name, as today), **Print #**`uid`, **edition line** (`editionLine`, already "Edition #n of N"), **Held by** `@name` (same masking as today: private collector, or a trade offer), **See its journey** to `/copy/{seasonId}/{copyId}`.
- Keep the short reason line under those, in smaller type. It is how the pick is explained.
- The FAQ question "How is the print of the week chosen?" becomes "How is the card of the week chosen?" and the answer still says a print is featured. Anchor id can stay so old links work; add `id="card-of-the-week"` as well if the old id moves.
- Internal names (`potw`, `PrintOfWeek`, admin "Feature as print of the week") stay. This item does not swap print and edition (that is 25.2).
- **Checks:** `npm run verify`. Hand pass of `/` with a featured print and with none (the block hides when the print is gone).

### 25.2 Swap the player-facing names print and edition (Needs a decision, L)

Joshua, on the home layout: change the name of print to edition (swap the names round).

**Do not build this until he confirms it.** Two readings, and they disagree with each other and with a later line in the same thread:

1. **Recommended.** Keep the glossary above. On the home card he was reacting to, list Edition (the #n that scores) and Print (Print #uid) in that order, which 25.1 already does. No global rename.
2. **Global swap.** Every player-facing "print" becomes "edition" and every "edition" becomes "print". Print #1023381 would become Edition #1023381, and Edition #7 would become Print #7. The points sentence Cheesy asked for later ("Edition #1 is worth 3x ... the 40th edition") would have to be rewritten to "Print #1", or the two requests contradict. This undoes ROADMAP 2.6. `scripts/check-words.mts` would flip in the same PR. Code fields `uid` and `n` do not rename. KV does not move.

If he picks 2, it is one PR: FAQ, `SerialChip`, `editionLine` / `printLine` in `lib/flip-back.ts`, card back labels, profile grid, copy pages, overlay `reveal.serialFormat` labels, admin Prints labels, `docs/serials.md`. The Twitch panel's own strings stay until the freeze lifts. Overlay `public/widget.js` is not frozen and would change in that PR.

### 25.3 Collectors page rows, and the Bottomgidds name (Ready, S)

`/collection` (`app/collection/page.tsx`) is the Collectors page (the nav already says Collectors). The list heading is already "Top collectors". Each row shows `{uniqueCards} cards` and the points.

- Row subtitle becomes `{uniqueCards}/{values.totalCards} cards` (24/25). `getSeasonLeaderboardCached` already returns `values.totalCards` (`SeasonValues` in `lib/leaderboard.ts`). The row type does not have its own total; use the season total.
- In the list header, next to "Full leaderboard", add **Card dex** linking to `/cards`.
- **Bottomgidds.** The seed card is `name: 'Bottomygidds'` while the file is `/assets/cards/Bottomgidds.webp` (`lib/seed.ts`, card 9). Rename the seed to `Bottomgidds`. That does not rename the live card: production names live in KV. Staff rename card 9 in the pack workspace (user step). No script writes production.
- **Checks:** `npm run verify`. Home and `/collection` at 1280px and 390px against the mock KV. Search tests for `Bottomygidds` and update the only hit.

### 26.1 Profile: one Edit profile, and a separate Settings link (Ready, S)

Owners currently get **Edit profile** under the username (`ProfileBasicsEditor` in `app/u/[username]/ProfileBasicsEditor.tsx`: bio, header colour, pronouns) and **Edit profile & settings** in the action row (`ProfileHeader.tsx`), which goes to `/settings`.

- Remove the button that sits by the name.
- Replace the action-row link with two: **Edit profile** (opens the same inline editor, moved to the action row) and **Settings** (`/settings`).
- Visitors see neither. Bio still renders for visitors.
- **Checks:** owner and visitor of `/u/tester` at 390px and 1280px. Save bio still round-trips (`saveProfileBasics`).

### 26.2 Collection tiles: no name overlay, readable edition pill (Ready, S)

`app/u/[username]/CollectionGrid.tsx`.

- Remove the hover gradient that prints the card name along the bottom, and the long `title` tooltip (`#N Name · stars · pulls · variants`). Keep an accessible name: `aria-label` or `alt` of the card name only.
- Keep the edition pill, the ×N badge and the RH/FA/SH mark. Joshua's next line is that the pill cannot be seen, so the pill stays and the name text goes.
- **The pill.** `SerialChip` (`app/components/SerialChip.tsx`) paints edition #1 as a yellow gradient, and any other bonus edition as daisyUI `badge-soft badge-warning` (translucent yellow). The grid also passes `bg-gray-950/85`, which does not cover a gradient `background-image`. On yellow card art the chip disappears. On collection tiles only, force a solid `bg-gray-950` plate, yellow border, yellow text. No gradient and no soft badge on the tile. Other surfaces keep today's `SerialChip`.
- **Checks:** a #1 print and a bonus print on a yellow card, in the grid and in the binder (the binder uses the same overlays: give it the same plate). Card dialog chips stay as they are.

### 26.3 Collection holo sweeps too fast on Mac (Ready, S)

After 26.2. There is no special case for the first three tiles. The fast sweep is on tiles that have a holo, which is the stronger versions (what reads as the top cards).

Collection tiles take both `holo-hover` (a 0.7s `::after` wipe in `app/globals.css`) and `holo-fx` (another `::after`, timed by `--holo-time` from the pack's overlay settings, default 10.5s, `lib/holo-core.ts`). One element has one `::after`, so the two rules fight. Safari on Mac is the report.

- A tile that has `holo-fx` does not also take `holo-hover`.
- On the site grid and binder, the sweep time is at least 8 seconds even if the overlay setting is lower. Overlay, ceremony and panel keep their own time. `prefers-reduced-motion` already disables the sweep.
- **Checks:** hover a Reverse, a Full Art and a Shiny in the grid. This environment cannot stand in for macOS Safari: say so in the PR, and note the CSS change that removes the 0.7s wipe from holo tiles.

### 26.4 Profile activity: pulls as well as trades, with a link (Ready, S)

`ActivityTab` in `app/u/[username]/ProfileTabs.tsx` already keeps pulls, upgrades and accepted trades (last 30, via `PUBLIC_ACTIVITY_TYPES` from `lib/profile-url.ts`). Rows are plain text.

- A pull row names the card, the version and the edition, and links to the print page when `uid` or `copyId` is present (`/c/<uid>` or `/copy/...`, the helpers from 2.1). With neither, link to `/cards?card=<n>`.
- An upgrade row links to the print it made, the same way.
- An accepted trade links to `/trade/<id>`. The trade activity detail has no id today (`lib/activity.ts`, written in `lib/trade-notify.ts`). Add optional `tradeId`. New events fill it from `trade.id`. Old events stay text.
- Do not add pulls that are admin grants, and do not show declined offers. Hidden collectors stay empty.
- **Checks:** extend the profile or activity check so a pull with a uid links and a trade without `tradeId` does not. Hand pass of the Activity tab: a pull, an upgrade, an accepted trade.

### 26.5 Share image: My best 1, Top 3, Top 6, Top 9, Custom (Ready, S)

`ShareStudio.tsx`. Theme chips already go grey when not selected (`chip()`). The card shortcuts do not: "Just my best" and "Top {defaultCount}" are always `text-yellow-400`.

- Replace those shortcuts with one single-select row: **My best 1**, **Top 3**, **Top 6**, **Top 9**, **Custom**.
- Selected chip: yellow (`bg-yellow-400 text-gray-950`). The others: grey (`bg-white/4 text-gray-300`), including hover. Never a yellow unselected chip.
- The four counts take the first N of `candidates` (already best-first). **Custom** leaves the per-card toggles active. Toggling a card switches the row to Custom. Default remains Top 6 (`defaultCount` is 6).
- **Checks:** hand pass of the profile Share tab. One preset selected, the other four grey.

### 26.6 Post a share image straight to Discord (Ready, M)

After 26.5. The channel does not exist yet. Build the pipe; it stays quiet until a webhook URL is saved.

- New Discord category `shares` in `lib/discord-config.ts` (`DISCORD_CATEGORIES`, presets, `sampleMessage` in `lib/discord-samples.ts`, the ticks in `DiscordConfig.tsx`, `scripts/check-discord.mts`, `docs/admin/discord.md`). Off for existing channels.
- `lib/discord.ts` can only post JSON embeds today (card-art thumbnails). Add a file post for this category only: multipart webhook, the PNG plus a one-line content string (collector name, site name, channel from `lib/site.ts`). Cap the file (well under Discord's webhook limit; share images are already small). No bot. 4.4 (DMs) stays a separate decision.
- Share tab, owner only: **Post to Discord**. Refuses in a sandbox. If no `shares` channel is enabled, the button tells them the streamer has not turned this on. One post per owner per minute. `recordAudit` is the wrong log (this is the viewer, not staff): count it on the existing Discord delivery log instead.
- **Checks:** `scripts/check-discord.mts` for the category and for "no channel means no request". Real delivery needs a webhook URL (user step); say so in the PR.
- **User step:** create the Discord channel, paste its webhook under Admin → Settings → Webhooks, tick Shares, press Test.

### 26.7 Editable profile showcase, and !showoff uses it (Ready, M)

Two different things today. The showcase widget is the three most valuable prints, computed (`topCopies` in `app/u/[username]/widgets.tsx`). A pinned print is `UserSettings.pinned`, chosen on the print page. `!showoff` with no arguments shows the most valuable owned card (`prepareShowOff` in `lib/showoff-prepare.ts`). It does not read the profile.

- `UserSettings.showcaseUids: number[]`, max 3, print uids the owner still holds. Empty means "compute the top 3", which is today's widget. Sanitizer drops uids they no longer own. Export includes it.
- On the owner's profile, the showcase widget gets **Edit showcase**: pick up to 3 of their prints (same candidate idea as the share image). Save through a server action, viewer from the session, `revalidatePath`. Not a settings-page-only control.
- `!showoff` with no card argument: the pinned print if they have one, otherwise the first showcase pick, otherwise today's most valuable card. Arguments (`!showoff <card>`) stay as they are. Cooldown, live gate and the overlay event stay. This does not edit `public/widget.js` or `/api/twitch/*`.
- **Checks:** `scripts/check-user-settings.mts` for the sanitizer. A showoff check (or `scripts/check-commands.mts`) for: pinned wins, else showcase, else best card; a dry run queues nothing.
- **Docs:** `docs/public-site/profiles.md`, `docs/overlay.md` (show off), `docs/admin/mixitup.md` only if the command text changes.

### 26.8 Wordmark links home, or to the dashboard in admin (Ready, S)

The logo is the top left, not the top right. Do not move it.

- Public `SiteNav`: already `href="/"`. Leave it.
- Admin sidebar brand (`app/admin/layout.tsx`, the `BrandMark` plus "The Cheesy TCG") is a plain div. Make it a link to `/admin` (the dashboard). Accessible name: "The Cheesy TCG, dashboard".
- Mod top bar already links to `/mod` (`app/mod/layout.tsx`). Leave it.
- **Checks:** click the admin wordmark, land on `/admin`. Public wordmark still lands on `/`.

### 27.1 FAQ pass (Ready, M)

Files: `app/(site)/faq/page.tsx` (the `SECTIONS` jump list and the body order, which already disagree: the body puts commands before show, the jump list puts show before commands), `sections/start.tsx`, `sections/commands.tsx`, `sections/upgrades.tsx`, `sections/points.tsx`. Keep `scripts/check-words.mts` green. Bump nothing legal (no Privacy or Terms change).

**Order**, jump list and body the same:

1. Getting started
2. Chat commands
3. Cards & versions
4. Trading
5. Upgrading
6. Your profile
7. Showing off
8. Points & leaderboard
9. Seasons
10. Twitch extension
11. Privacy & data
12. Something not working?

**How do I get cards** (`sections/start.tsx`): follow, subscribe, or gift subs. Remove the `!pack` bullet. In its place, a link to the commands section (`#commands`) for the chat commands. Do not invent how many packs a follow, a sub or a gifted sub gives: keep the line that the exact numbers change by season and stream.

**Commands.** The commands section moves under Getting started (the order above). It keeps the generated list from `getCommands()`. Add a fixed line for `!pack`: it asks the stream to open a pack, and it is set up in Mix It Up rather than in the command builder. `!pack` is not in `COMMAND_ACTIONS` today; do not pretend the builder owns it (28.2 can print a recipe for it later).

**Upgrades.** Add **Can I trade upgraded cards?** Yes. Any print of any version can be traded, including an upgraded one (`docs/trading.md`, FAQ trading section). A favourite, or a print already in an offer, cannot. Link to `#trading`. Keep the existing pointer that you can trade duplicates instead of upgrading them.

**Points sentence.** Replace the fade sentence with their shape, using the live settings (do not hardcode 40 or 3): "Edition #1 is worth {serialBonusMax}× and the bonus decreases until the {serialBonusCutoff}th edition of that card is created." When the cutoff is 0, keep today's "switched off" sentence. 27.4 is the only place that may change the cutoff number.

**Brackets.** The monospace maths block has a space after `round(` and cramped brackets. Tighten so a function call has no space inside the brackets (`round(10 × rarity × version × edition bonus)`) and binary operators keep a single space. Scan the FAQ sections for the same ` ( ` gap inside formulas. The commands line `(or !alias)` is fine.

**Limits, a true sentence for today.** New question under Getting started: **Is there a limit to how many cards I can get per stream?** Today: one default for everyone, set for paid pulls (0 means no limit), plus a personal limit staff can set, plus bonuses staff can grant (`PullBuff` in `lib/pull-limit-core.ts`). Do not describe per-role numbers until 28.1 ships; that PR rewrites this answer.

**Checks:** `scripts/check-words.mts` and `npm run verify`. Read the rendered FAQ at 390px and 1280px, including the maths block.

### 27.3 Achievement editor (Needs a decision, M)

Achievements are computed (`lib/achievements.ts`) and then stored so they are never revoked (`lib/achievements-store.ts`). There is no editor. The master set goal already exists (see above).

If Joshua wants an editor, the small version is Settings → Achievements (admins only, `requireAdmin`): each built-in kind has an on/off switch and an optional title. Stored at `achievements:settings`. `evaluateSeason` skips a switched-off kind. Already-earned rows stay. No custom goal builder, no icons upload, no per-season overrides in v1.

He needs to say whether that is worth it, or whether the computed list is enough. Do not build a CMS.

### 27.4 Edition bonus cutoff: 20 today, 40 in the request (Needs a decision, S)

`serialBonusCutoff` defaults to **20** (`DEFAULT_SCORING` in `lib/scoring-core.ts`). Edition #1 is worth `serialBonusMax` (default 3). The bonus is `1 + (max − 1) × (1 − (n − 1) / cutoff)` for editions 1 through the cutoff, then 1 (`serialMultiplier`). Production may already differ: Admin → Settings → Scoring is the live value, and it rescores every season immediately because scores are computed, not stored.

The number **40** in the request is `EVENT_CAP` in `lib/serials-core.ts` (how many journey events a copy keeps). It is not the points cutoff.

27.1 writes the sentence with the live cutoff. Changing the cutoff to 40 is a separate yes, because it changes everyone's score. If yes: set the default and, only with an explicit admin save (or a one-off he runs), the stored `scoring:settings`. Do not silently overwrite production KV from a laptop. The FAQ picks up the new number by itself.

### 28.1 Default pull limits per Twitch role (Needs a decision, M)

There are no per-role limits. `MixItUpSettings.limit` is one number for everyone (default 0 = no limit). A viewer can have their own base (`UserPullLimit.limit`) and temporary bonuses (`PullBuff`, admin-granted only). Gifted subs, bits and cheers do not grant pulls in code.

**Needs five integers from Joshua** (0 = no limit, same meaning as today): regular, subscriber, VIP, moderator, broadcaster. A starting point to accept or replace, not a guess to ship in silence: regular 1, subscriber 2, VIP 2, moderator 3, broadcaster 0. Also: does a gifted sub add a bonus, or is "gifting subs" only a way to earn a pack (27.1)?

Design, once the numbers are yes:
- `MixItUpSettings.roleLimits` on the Paid pulls tab (`app/admin/mixitup/MixItUpConfig.tsx`). The old `limit` stays as the fallback when a role is missing, so existing settings keep working.
- The paid-pull webhook may send `role`: `regular | subscriber | vip | moderator | broadcaster`. Missing or unknown counts as regular. Do not call Twitch to look the role up.
- `CHANNEL_LOGIN` is always the broadcaster.
- A personal base limit still replaces the role default. Active buffs still add (`effectiveLimit`). Base 0 still means no limit.
- Same PR updates the FAQ answer from 27.1.
- **Not touched:** `/api/twitch/*`, the panel, `middleware.ts`.
- **Checks:** `scripts/check-pull-limit.mts` for each role, a personal override, a buff on top, and a missing role.

### 28.2 Generate a Mix It Up command from the saved settings (Ready, M)

The Commands tab already shows a paste-ready URL and JSON body for the selected command (`SetupPanel` in `app/admin/mixitup/CommandsPanel.tsx`). Paid pulls do not. Mix It Up has no API we should call to create commands inside it. Generate text the owner pastes.

- **Commands:** for each enabled command, a **Copy setup** block: command name (with `!`), webhook URL (`/api/webhooks/command`), JSON body `{ secret, command, username: "$username", args: "$allargs" }` using the real incoming secret, and which response field to send to chat (`message`). This is the existing panel, extended from "the one command you are editing" to "every enabled command".
- **Paid pulls:** on the Paid pulls tab, a **Copy setup** block built from `MixItUpSettings`: the balance request and the deduct request the site already sends (`action`, `currency`, `cost`, `message`, the URL fields). Say which Mix It Up action should answer `{ "balance": n }` and which should take the currency. Do not invent Mix It Up click-paths beyond what `docs/admin/mixitup.md` already tells the owner.
- **Checks:** a pure helper (next to `lib/mixitup-core.ts` or `lib/commands-core.ts`) covered by the existing Mix It Up check: the body contains the saved currency and the command name, and a secret is not printed as empty when one is set. Hand pass of both tabs.
- **Docs:** `docs/admin/mixitup.md`.

### 28.3 Font control on the card back editor (Needs a decision, S)

`CardBackEditor` fonts are the 15 ids in `BACK_FONTS` (`lib/card-back.ts`): display, body, mono, plus the self-hosted files (Fredoka, Nunito, Bebas, Oswald, Orbitron, Playfair, Cinzel, Bangers, Press Start 2P, Space Mono, Zilla Slab, Pacifico). The Font `<select>` only renders when an element is placed freely (`app/admin/components/card-back/Properties.tsx`). Stacked elements only get a size.

He needs to say which he means:
1. **Recommended if he just could not find it.** Show the font select on every text element, stacked or free. One PR, `Properties.tsx` only.
2. A specific face for a specific line (the big print number, the edition line). He names the face.
3. The preview does not match the saved font. That is a bug to reproduce first, not a new font.

Do not add a font upload or a Google Fonts fetch.

### 29.1 Variant ladder gains Golden; labels; read-only audit (Ready, M)

Joshua: align the variant with the rarity, and add Golden = Legendary.

**Mapping.** Keep the stored ids so existing copy ids (`<card>.<index>.<n>`) and collection numbers (`cardNumber + 1_000_000 × index`, `lib/variants.ts`) stay valid. Append Golden at index 4. Change labels only.

| Index | Id (unchanged) | Label now | Label | Rarity name |
|---|---|---|---|---|
| 0 | `regular` | Regular | Regular | Common |
| 1 | `reverse` | Reverse Holo | Reverse Holo | Uncommon |
| 2 | `full` | Full Art | Full Art | Rare |
| 3 | `shiny` | Shiny Full Art | Full Art Holo | Epic |
| 4 | `golden` | (new) | Golden | Legendary |

Short labels: RH, FA, FH, GD. `Card.stars` stays in KV. This PR does **not** change points (29.3) and does **not** roll Golden (29.5).

**Data.** `Variant` gains `'golden'`. `VARIANTS`, labels, `emptyCounts`, `DEFAULT_VARIANT_WEIGHTS` (`golden: 0`), `DEFAULT_UPGRADE_COSTS` (a Golden step, default the same 3 as the previous step, used only when upgrades are on). `parseCopyId` in `lib/serials-core.ts` allows index 0-4 (`[0-4]` instead of `[0-3]`). `decodeEntry` keeps using `VARIANTS.length`, so an index-4 number decodes as Golden on the site and overlay. `public/widget.js` mirrors the list (the overlay is not frozen). **Do not edit `public/twitch-panel/panel.js`.** Its list is still the four old ids, and its decoder clamps to that list, so an index-4 entry would show up as a nonsense card number. That is why Golden cannot be pulled yet.

**Pulls.** `rollDraw` (`lib/draw.ts`) never returns `golden` while 29.5 is blocked. Weight 0 is not enough on its own if a pack later sets a weight: also refuse Golden in `rollVariant` until a constant `GOLDEN_PULLS` is turned on in 29.5. Existing packs do not change.

**Admin.** Pack workspace variant chips, the weights row and the upgrade cost row grow a Golden column. The public site shows the new labels wherever `VARIANT_LABELS` is used (dex, profile, FAQ, overlay). Achievement titles that say "Shiny Full Art" follow the label; the stored kind `all-shiny` / `first-shiny` does not rename. `docs/variants-and-scoring.md` describes the ladder and states that points still use `Card.stars` until 29.3, and that Golden is not pulled until 29.5.

**Audit (read-only).** `scripts/audit-variant-rarity.mts`, same shape as `scripts/audit-trade-ledger.mts`: require `KV_REST_API_URL` and `KV_REST_API_READ_ONLY_TOKEN`, set the URL before the dynamic `import()`, load via `lib/db`, print a report, exit 0, first line "No keys were written." Report: cards by star count, holdings by variant index, copy ids `parseCopyId` would reject, any collection entry with index >= 4. Expected on today's data: zero index-4 entries, zero bad copy ids. Never writes.

**Dry-run migration.** `scripts/migrate-variant-rarity.mts`, same opt-in shape as `scripts/repair-trade-ledger.mts`: default dry-run, writes only with `--apply` and `TCG_REPAIR_CONFIRM=yes`, and only against the KV the env points at. The plan for this ladder is **empty** (ids did not move). The script prints "0 writes" and refuses `--apply` while the plan is empty, so it cannot be pointed at production by mistake. A later rewrite (only if 29.3 needs one) extends this script; it still defaults to dry-run.

**Checks:** `scripts/check-upgrades.mts` for index 4 encode/decode, `parseCopyId`, and "rollDraw never returns golden". `npm run verify`.

### 29.3 Points follow the variant rarity (Needs a decision, M)

After 29.1, and after Joshua has read an audit that includes score deltas.

Today a print is worth `baseScore × rarity(from Card.stars and pull rate) × variantMultiplier × edition bonus` (`lib/leaderboard.ts`, `lib/scoring-core.ts`). Stars and the variant both matter, so a 5-star Regular and a Golden would both be "Legendary" if we only relabel.

**Proposed rule, not shipped until he accepts the deltas.** The print's rarity name comes from its variant (the table in 29.1). One multiplier per variant replaces `rarity × variantMultiplier`, so the two do not stack. Edition bonus stays on `Copy.n`. `Card.stars` remains stored and stops affecting points. Collection bonuses stay on "one Regular of every card".

The audit from 29.1 grows a read-only before/after: each collector's score today vs the proposed rule, top movers, no writes. He looks at that, then this PR changes `copyPoints` / `computeSeasonValues`. Scores move on the next page load (they are not stored per season). FAQ maths (27.1's block) updates in this PR. No production script.

**Open:** the five multipliers (or "derive them from the variant weights, as today's variant multiplier already is"). Do not pick them in the PR that only adds the type.

### 29.4 Golden card look (Needs a decision, M)

After 29.1. Proposed look, so he can change it before the PR: Golden uses the same holo path as the others (`variant.golden.holo*` in `lib/overlay-props.ts`, `buildHoloSpecs`, `.holo-fx`). Default palette amber and cream (`#ffb703`, `#ffe14d`, `#fff6c2`), sweep 14s, loop on, blend the same as Shiny. `.vfx-golden` is the Shiny glow recoloured amber (no new animation system). Sparkles reuse the Full Art / Shiny particles. The card edge uses the Legendary amber already in `lib/rarity.ts` (`#f59e0b`). Reduced motion disables the sweep and the rock, as it does for Shiny.

Site, card dialog, binder, upgrade ceremony and overlay (`public/widget.js`, `public/widget.css`). Not the Twitch panel (frozen): no Golden pulls exist yet, so the panel never has to draw one.

**Open:** accept this look, or name a different one. Do not invent a second effect system.

### 29.5 Let Golden be pulled, including the Twitch panel (Blocked, panel freeze)

When the freeze lifts, in the same panel version as Ext:
- Turn `GOLDEN_PULLS` on. Packs opt in by setting a Golden weight (default stays 0, so nothing changes until a pack is edited).
- Teach `public/twitch-panel/panel.js` (and its CSS) the five-id list and index 4, or Golden entries render as a bad card number. Collection, season and upgrade responses may gain the new variant in existing arrays; do not change the JSON keys. `/api/twitch/upgrade` must understand a step up to Golden once the ladder includes it.
- Overlay already learned Golden in 29.1 and 29.4.
- Rebuild the extension zip (`scripts/lib/twitch-package.mjs` is in the freeze too). Bump `version`, screenshots, `twitch-extension/SUBMISSION.md`.

### 30.1 Trainer cards: buff model and Buff Editor (Needs a decision, L)

A new card kind that grants a one-time boost when the holder uses it. Staff-gated with the existing roles: admins edit (`requireAdmin`), mods do not get the page. No new role.

**Open, answer before building:**
- Buff list for v1. **Proposed: one type, `extra-pulls`.** It writes the `PullBuff` row the pull-limit code already expects (`source` was left as `'card:<id>'` for this, `lib/pull-limit-core.ts`). Later types have a place in the enum and are not built: `odds-boost` (next pulls weigh higher rarities), `points-mult` (score multiplier, dangerous for the leaderboard).
- Can a trainer card be traded before it is used? **Proposed: yes**, same rules as any other print (favourites and escrow still block). Using it consumes it, so the new holder is the one who can use it. The alternative is soulbound (not tradable, not giftable).
- Magnitude and duration caps. **Proposed:** magnitude 1 to 10 extra pulls per stream; duration either 1 to 168 hours or 1 to 4 streams.

**Model (pure, `lib/buffs-core.ts`):**

- `TrainerBuffDef`: `id`, `name`, `type` (`extra-pulls` only in v1), `magnitude`, `duration: { unit: 'hours' | 'streams'; n: number }`, `stack: 'refresh' | 'reject'`.
- KV `trainer:buffs` (the definitions). A card gains `kind?: 'collector' | 'trainer'` (absent means collector) and `buffId?: string`. Stored on the card in the pack, through the normal card save. No collection-number change: a trainer is a Regular entry (`encodeEntry` index 0), so the frozen panel shows it as an ordinary card and does not need a new key.
- **Stacking.** `refresh`: using the same buff while it is active moves the expiry out and does not add the amount again. `reject`: the use is refused while that buff is active. Two different buffs both apply, up to the existing `MAX_BUFFS` (20). Amounts add inside `effectiveLimit`, which already sums active buffs. A base limit of 0 (no limit) stays no limit.
- **Expiry.** Hours: `PullBuff.until`. Streams: store `streamsLeft` on the buff and drop it when the stream key (`streamKey()` in `lib/mixitup-core.ts`) has changed that many times. Checked when the limit is read, not by a cron.
- **Obtained** by a normal pull (the card's probability in its pack) or an admin grant. No variant roll, upgrades forced off, no edition-bonus special case (it is a normal print until it is used). Not crafted.
- **Editor.** `/admin/buffs`, nav entry in `lib/admin-nav.ts` (Game group), `docs/admin/routes.md`. List, create, edit, delete. Delete is refused while a card still points at the buff. Pack workspace card panel: Kind, and a Buff select when Kind is Trainer. `ArmedButton` on delete. Audited (`recordAudit`).
- **Docs:** `docs/admin.md` index line, a short section in `docs/variants-and-scoring.md` or a few paragraphs in `docs/admin/packs-and-seasons.md` for the card kind. FAQ sentence waits for 30.2 so it does not describe a button that does not exist.

### 30.2 Use a trainer card: consume, buff, audit (Ready after 30.1, M)

Once 30.1's answers are in:
- Owner, on the website card dialog: **Use** (two-tap, same arming as Upgrade). Hidden for visitors, for collector cards, and while the copy is in an offer or favourited.
- Server action, session viewer, not a client-supplied user. Confirms they hold one Regular copy, `card.kind === 'trainer'`, the buff exists, stack rule allows it.
- Writes one `PullBuff` (`source: 'card:<number>'`, amount, until or streamsLeft, note = buff name) on `user:<u>:pulllimit`.
- Consumes one copy: remove one collection entry (newest first, same choice as an upgrade spend) and retire that ledger copy. The card is gone. The buff can outlive the card (hours or streams).
- `recordAudit(username, 'Trainer card used', '<card name>, <buff name>, until …')`. New activity type `buff` on the site log only. Do not add it to any `/api/twitch/*` response.
- If tradeability was answered "no", `lib/trades.ts` rejects a trainer entry on both sides. If "yes", no trade change.
- **Checks:** `scripts/check-buffs.mts`: refresh does not double the amount, reject blocks, expiry drops the buff, a second copy is required for a second use, a favourite cannot be used, sandbox does not matter (this is not the overlay queue).
- **Docs:** FAQ "What is a trainer card?" under Cards & versions.

### 30.3 Chat command to use a trainer card (Ready after 30.2, S)

New `COMMAND_ACTIONS` id `use-trainer`. `!use` plus a card name or number. Same server function as the button. Dry run does not consume and does not write a buff. Reply variables: `{cardName}`, `{buff}`, `{until}`, `{left}` (pulls left this stream). Errors: not owned, not a trainer, already active (when stack is reject), cooldown. Seed nothing until the owner enables it (do not surprise chat). 28.2's copy-setup block picks it up with the other commands. Not a panel change.

### 30.4 Use a trainer card from the Twitch panel (Blocked, panel freeze)

The panel can already show the card as a normal collection entry (Regular encoding). It has no Use button, and it must not grow one during the freeze. When the freeze lifts, add Use next to Upgrade on that card only, calling a new field on an existing authenticated route or a new `/api/twitch` route in that panel version (not before). Same two-tap, same consume rules as 30.2.

## Blocked by the Twitch freeze

Do not touch `public/twitch-panel/*`, `scripts/lib/twitch-package.mjs`, the behaviour or response shape of `/api/twitch/*`, or the CORS rules in `middleware.ts` until Joshua lifts the freeze.

| Item | What waits |
|---|---|
| Ext | The whole next panel version, including the collection privacy fix already written above |
| 29.5 | Decoding and drawing Golden. Until then `GOLDEN_PULLS` stays off, so no index-4 number is ever written |
| 30.4 | A Use button in the panel. Website use (30.2) and the chat command (30.3) do not wait |
| 25.2 panel strings | Only if the global print/edition swap is accepted. The website and the overlay can change; the panel's words cannot |

Ready items above were checked against this list. Showoff, paid-pull limits, share images, the FAQ and the card back editor do not go through the frozen paths.

## Open questions for Joshua

1. **25.2.** Keep print = the copy and edition = the sequence (recommended), or swap the two words everywhere?
2. **27.3.** Is a small on/off and rename list for the built-in achievements enough, or is the computed list fine as it is?
3. **27.4.** Leave the edition bonus cutoff at 20 (or whatever Settings → Scoring already stores), or set it to 40, knowing every score moves?
4. **28.1.** The five limits: regular, subscriber, VIP, moderator, broadcaster. Starting point: 1, 2, 2, 3, 0. Does a gifted sub add pulls, or only earn a pack?
5. **28.3.** Font select on every card-back text element (recommended), a named face, or a preview bug to reproduce?
6. **29.3.** Accept "one multiplier per variant, stars stop scoring" after seeing the audit's score deltas? What are the five multipliers?
7. **29.4.** Accept the amber holo for Golden (same shimmer system, 14s, Legendary edge), or describe a different look?
8. **30.1.** v1 buff type `extra-pulls` only? Trainer cards tradable until used (recommended), or soulbound? Caps: +1 to +10 pulls, 1 to 168 hours or 1 to 4 streams?

## User steps still open

Outside the repo; tick off or delete when done (listed as of 2026-10-16).
- [ ] **Overlay key (13.2):** copy the browser-source address (ends `?key=...`) from Settings → OBS Overlay into every OBS browser source, and each scene's address from the Overlay Editor, then refresh the sources. Clear the pull queue first.
- [ ] **Mix It Up paid pulls (Track 12), when wanted:** a Mix It Up webhook command answering `{ "balance": n }` for `action: "balance"` and taking the currency for `action: "deduct"`; then fill in the Mix It Up admin page, press **Check balance** and **Send test message**, and switch it on.
- [ ] **Web Push keys:** set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` the legal contact) in Vercel Production, redeploy, then try a real iPhone (app installed), Android and a desktop browser.
- [ ] **GitHub webhook (3.5):** repo Settings → Webhooks, Payload URL `<discord webhook URL>/github`, events: pushes, pull requests, releases, deployment statuses.
- [ ] **Discord channels:** add the channels you want in Admin → Settings → Webhooks (Trade listings, Admin log, System, Recap, Feedback) and press Test on each.
- [ ] **Share-image channel (26.6):** create the Discord channel, paste its webhook under Admin → Settings → Webhooks, tick Shares, and press Test. The button on the share tab does nothing until this exists.
- [ ] **Card name (25.3):** in the pack workspace, rename the live card Bottomygidds to Bottomgidds. The seed fix does not rewrite production.
- [ ] **iPhone icon (1.1, 7.1):** remove the home-screen app, delete `cheesytcg.app` under Settings > Apps > Safari > Advanced > Website Data, add it again from Safari; confirm the cheese logo shows.
- [ ] **Email (22.1):** if not done yet, set `RESEND_API_KEY`, `EMAIL_FROM` and `RESEND_WEBHOOK_SECRET` in Vercel (see `docs/hosting.md`) to switch email notifications on.
