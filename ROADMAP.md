# The Cheesy TCG, roadmap

Open work only. Owned by the planning model (Opus, see "Model workflow" in `CLAUDE.md`). Execution picks up items marked **Ready**; **Needs design** or **Needs a decision** goes back to planning (or to the user) first. When an item ships, delete it here and make sure its area doc in `docs/` describes the result. Finished items and their original designs are archived in `docs/archive/roadmap-history.md`; read it only when you need the reasoning behind a done item. Last updated 2026-10-19 (27.4 shipped: the print-bonus cutoff default is 40. A saved value is left alone. 26.8 shipped: the admin wordmark opens the dashboard. 26.5 shipped: share images pick My best 1, Top 3, Top 6, Top 9 or Custom. 26.4 shipped: activity rows link to the print or the trade. 26.3 shipped: holo tiles drop the 0.7s wipe and sweep for at least 8 seconds. 26.2 shipped: collection tiles drop the name overlay and use a solid edition chip. 26.1 shipped: one Edit profile in the action row, plus Settings. 25.3 shipped: collectors rows show unique/total and link to the card dex. Limits default to no limit and are editable, plus a this-stream buff for everyone. Stars keep setting the card value. Trainer cards can be traded until used. 24 shipped. Panel freeze still on).

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
| 25.2 | A copy is an edition; "24 of 28" is a print | Ready | L |
| 26.6 | Post a share image straight to Discord | Ready | M |
| 26.7 | Editable profile showcase, and !showoff uses it | Ready | M |
| 27.1 | FAQ pass: cards, commands, trading, points, brackets | Ready | M |
| 27.3 | Achievement list: on/off, rename, edit the text | Ready | M |
| 27.5 | An achievement can grant a bonus | Ready (after 30.1) | M |
| 28.1 | Pull limits per role, editable, plus a this-stream buff | Ready | M |
| 28.2 | Generate a Mix It Up command from the saved settings | Ready | M |
| 28.3 | Font control on every card-back text element | Ready | S |
| 28.4 | Font control in the Overlay Editor | Ready | M |
| 29.1 | Variant ladder gains Golden; labels; read-only audit | Ready | M |
| 29.4 | Variant styles, per pack, including Golden | Ready (after 29.1) | M |
| 29.5 | Let Golden be pulled, including the Twitch panel | Blocked (panel freeze) | M |
| 30.1 | Trainer cards: buff model and Buff Editor | Ready | L |
| 30.2 | Use a trainer card: consume, buff, audit | Ready (after 30.1) | M |
| 30.3 | Chat command to use a trainer card | Ready (after 30.2) | S |
| 30.4 | Use a trainer card from the Twitch panel | Blocked (panel freeze) | S |

27.2 is unused on purpose: the master set achievement is already shipped (see "Already on the site" under tracks 25 to 30). 29.2 is unused on purpose: the read-only audit and the dry-run script ship inside 29.1. 29.3 is not in the table: stars keep setting the value, so there is no PR.

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

**Glossary (decided 2026-10-19, built in 25.2).** A person's copy of a card is an **edition**, not a print ("your recent editions"). The game-wide id is **Edition #1023381** (`Copy.uid`). The line that today says "Edition #24 of 28" is the sequence, and it becomes **Print #24 of 28** (`Copy.n`). That sequence is what the points bonus uses. Code, KV and URLs keep saying copy, serial and uid. Until 25.2 ships, the site still uses the old words, and `scripts/check-words.mts` still requires them.

**Already on the site (do not rebuild):**
- **Master set.** `evaluateSeason` in `lib/achievements.ts` already awards `master` ("Master set: {season}", own every card in every version). The FAQ already says so (`app/(site)/faq/sections/profile.tsx`, "What are achievements?"). The goal is omitted when every card has only Regular, because it would be the same as Completed. Season 1's pack has upgrades off, so the goal does not show there. Turning versions on is what makes it appear. No new kind.
- **How are points worked out?** and **Can I see the exact maths for a card?** already exist in `app/(site)/faq/sections/points.tsx`. 27.1 tightens the wording and the bracket spacing. It does not add a second copy of either question.
- **Pull history on the profile.** The Activity tab lists pulls (card, version, sequence, linked to the print or the card dex), upgrades (linked to the print they made) and accepted trades (linked when the event has a trade id). Admin grants and declined offers stay off it.
- **Public wordmark.** `SiteNav` links the logo and "The Cheesy TCG" to `/`. The admin sidebar brand and the phone top-bar title link to `/admin`. The mod bar links to `/mod`.

### Where each Discord line went

| Discord line | Item |
|---|---|
| Home layout: Card of the week, card name, print, edition, held by, See its journey | 25.1 |
| Change the name of print to edition (swap the names round) | 25.2 |
| Collectors page: Top collectors, collector name, 24/25 cards, Card dex | Done |
| Text should say Bottomgidds, not bottomygidds | Done |
| Font change on the card back editor | 28.3 |
| Edit profile shows twice; remove the one by the name; split Edit profile and settings | Done |
| Share image: My best 1, top 3, top 6, top 9, custom; unselected goes grey, not yellow | Done |
| Share image straight to a Discord channel (channel not created yet) | 26.6 |
| Profile collection: holo moves very fast on the top 3 cards (Mac only) | Done |
| Collection cards do not need text on hover or along the bottom | Done |
| Print/edition pill cannot be seen (see-through gold/yellow) | Done |
| Profile activity should show card pull history as well as trades, click for details | Done |
| FAQ How do I get cards: follow, subscribe, or gifting subs | 27.1 |
| New FAQ: is there a limit to how many cards per stream (defaults and bonuses) | 27.1 now, 28.1 when roles exist |
| Trading before upgrading; under upgrades, can I trade upgraded cards | 27.1 |
| Chat commands under Getting started; move !pack there; link from How do I get cards | 27.1 |
| FAQ Points and leaderboard: how are points worked out | 27.1 (question already exists) |
| "Edition #1 is worth 3x ... until the 40th edition" | Superseded: 27.1 says print #1 ... the 40th print, from the live cutoff. The default cutoff is 40 |
| Master set achievement: every variant of every card | Already shipped (see above) |
| Achievement editor? | 27.3 |
| FAQ: can I see the exact maths for a card | 27.1 (question already exists) |
| Spacing looks weird on some of the brackets | 27.1 |
| Cheesy TCG logo goes to the homepage, or the dashboard in admin | Done |
| Default limits for subscribers, mods, broadcaster, VIPs and regular | 28.1 |
| !showoff pulls from the user's profile showcase | 26.7 |
| Option to edit the showcase on a person's profile | 26.7 |
| Generate a Mix It Up command from settings (commands and pulls) | 28.2 |
| Align variant with rarity, plus a Golden variant (Joshua) | 29.1, 29.3, 29.4, 29.5 |
| Trainer cards and a Buff Editor (Joshua) | 30.1 to 30.4 |

### Tracks 25 to 30: order

Parallel streams, so no two open PRs edit the same files:
- **Glossary first:** 25.2 (`scripts/check-words.mts`, FAQ, profile, overlay `public/widget.js` labels). 25.1 and 27.1 come after it so they are not rewritten.
- **Share:** 26.6 (`ShareStudio.tsx` and Discord).
- **Showcase:** 26.7. It does not edit `public/widget.js`.
- **FAQ:** 27.1 after 25.2 (same words). 27.3 is the achievement list and does not touch the FAQ.
- **Fonts:** 28.3 is the card back editor only. 28.4 is the Overlay Editor and `public/widget.js`. Do not run 28.4 beside 25.2, 29.1 or 29.4: those also edit `public/widget.js`. Order for that file: 25.2, then 28.4, then 29.1, then 29.4.
- **Mix It Up:** 28.2 can start now. 28.1 is Ready and edits `lib/pull-limit-core.ts`: do not run it beside 30.2.
- **Variants:** 29.1 (includes the audit and the dry-run script), then 29.4. There is no points PR: stars keep setting the value (see 29.3). 29.5 waits for the freeze.
- **Trainers and achievement bonuses:** 30.1, then 30.2, then 30.3, and 27.5 after 30.1 (it picks a buff from that catalogue). 30.4 waits for the freeze.
- **Nothing on tracks 25 to 30 is waiting for an answer.** Trainer cards are tradable until used (30.2).

**Twitch panel freeze:** nothing in a Ready item edits `public/twitch-panel/*`, `scripts/lib/twitch-package.mjs`, the behaviour or response shape of `/api/twitch/*`, or the CORS rules in `middleware.ts`. 29.5, 30.4, and the panel's copy of the edition/print words (25.2) are the exceptions and they are blocked.

### 25.1 Home: Card of the week (Ready, S)

After 25.2, so the labels below are the new ones. The home block is "Print of the week" (`app/components/site/PrintOfWeek.tsx`, data from `potw:current`, docs in `docs/serials.md` and `docs/public-site/home.md`). Keep the pick, the KV keys and the admin feature button. Change the player-facing layout only.

- Title: **Card of the week**.
- Lines, in this order: **card name** (version + name, as today), **Edition #**`uid` (the copy), **Print #n of N** (the sequence, from `editionLine`), **Held by** `@name` (same masking as today: private collector, or a trade offer), **See its journey** to `/copy/{seasonId}/{copyId}`.
- Keep the short reason line under those, in smaller type. It is how the pick is explained.
- The FAQ question "How is the print of the week chosen?" becomes "How is the card of the week chosen?" and the answer says an edition is featured. Anchor id can stay so old links work; add `id="card-of-the-week"` as well if the old id moves.
- Internal names (`potw`, `PrintOfWeek`, admin "Feature as print of the week") stay.
- **Checks:** `npm run verify`. Hand pass of `/` with a featured edition and with none (the block hides when the edition was spent).

### 25.2 A copy is an edition; "24 of 28" is a print (Ready, L)

Decided 2026-10-19. Do not keep the old glossary.

- A person's copy is an **edition**. Lists say "recent editions", and the unique id is **Edition #1023381** (`Copy.uid`, was "Print #1023381").
- The card page line that says "Edition #24 of 28" says **Print #24 of 28**. That is `Copy.n` and how many have been made. The points bonus uses this number, so player-facing text calls it the **print bonus** (the code name `serialMultiplier` stays).
- The older Discord sentence "Edition #1 is worth 3x ... the 40th edition" is superseded by this swap. 27.1 writes it as print #1 through the 40th print.
- Code, KV keys, URLs (`/copy`, `/c/<uid>`) and the copy id `<card>.<index>.<n>` do not rename. Card-back template tokens `{printNumber}` and `{edition}` do not rename, or saved designs break. What they render swaps: `{printNumber}` is Edition #uid, `{edition}` is Print #n of N. Staff-facing element labels swap to match. A custom line someone typed is not rewritten.
- Stored overlay value `reveal.serialFormat` (`edition` / `print` / `both`) stays. The menu labels swap so "edition" means Edition #uid and "print" means Print #n.
- `scripts/check-words.mts` flips in this PR: player-facing text must not call a copy a print, and must not call the n-of-N line an edition.
- Surfaces: FAQ, `SerialChip`, `editionLine` in `lib/flip-back.ts` (the function keeps its name; the string changes), profile, the leaderboard "Prints" count (it becomes "Editions"), activity, share images, overlay labels in `public/widget.js`, admin labels, `docs/serials.md`.
- **Not in this PR:** `public/twitch-panel/*`. The panel keeps saying print for a copy until the freeze lifts. Say that in the PR.
- **Checks:** `scripts/check-words.mts`, `npm run verify`, and a pass of a copy page, a profile and the FAQ. The panel is not loaded.

### 26.6 Post a share image straight to Discord (Ready, M)

The channel does not exist yet. Build the pipe; it stays quiet until a webhook URL is saved.

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

**Upgrades.** Add **Can I trade upgraded cards?** Yes. Any edition of any version can be traded, including an upgraded one (`docs/trading.md`, FAQ trading section). A favourite, or an edition already in an offer, cannot. Link to `#trading`. Keep the existing pointer that you can trade duplicates instead of upgrading them. This item comes after 25.2, so it uses edition and print as 25.2 defines them.

**Points sentence.** The bonus is on the print sequence (25.2). Replace the fade sentence with: "Print #1 is worth {serialBonusMax}× and the bonus decreases until the {serialBonusCutoff}th print of that card is created." Use the live settings. Do not hardcode 40 or 3. When the cutoff is 0, keep today's "switched off" sentence. The default cutoff is 40. A saved value is left alone, so this sentence says 40th only after that save, or on an install that has never saved scoring.

**Brackets.** The monospace maths block has a space after `round(` and cramped brackets. Tighten so a function call has no space inside the brackets (`round(10 × rarity × version × print bonus)`) and binary operators keep a single space. Scan the FAQ sections for the same ` ( ` gap inside formulas. The commands line `(or !alias)` is fine.

**Limits, a true sentence for today.** New question under Getting started: **Is there a limit to how many cards I can get per stream?** Today: one default for everyone, set for paid pulls (0 means no limit), plus a personal limit staff can set, plus bonuses staff can grant (`PullBuff` in `lib/pull-limit-core.ts`). Do not describe per-role numbers until 28.1 ships; that PR rewrites this answer.

**Checks:** `scripts/check-words.mts` and `npm run verify`. Read the rendered FAQ at 390px and 1280px, including the maths block.

### 27.3 Achievement list: on/off, rename, edit the text (Ready, M)

Decided 2026-10-19: a small editor for the built-in list, not a way to invent new goal rules. The master set goal already exists (see above). Granting a bonus is 27.5, after the buff catalogue exists.

- Settings → Achievements, admins only (`requireAdmin`). Mods do not get the page.
- One row per built-in kind from `evaluateSeason` (`lib/achievements.ts`): completed set, each star tier, each version, master set, and the edition-number goals. Fields: **on/off** (default on), **title**, **detail**. Empty title or detail means "use the built-in words".
- Stored at `achievements:settings`. `evaluateSeason` skips a switched-off kind. Achievements already stored on a user stay (they are never revoked). No icon upload, no per-season overrides, no custom rules ("own 10 shinies") in this item.
- **Checks:** a small `scripts/check-achievements.mts` case, or the existing one: a switched-off kind is absent from a fresh evaluation, and a stored earned row is left in place. Hand pass of the settings page at 1280px and 390px.
- **Docs:** `docs/public-site/dex-leaderboard-stats.md` (achievements).

### 27.5 An achievement can grant a bonus (Ready after 30.1, M)

Decided with 27.3. The list editor ships first. This item adds the bonus, and it uses the buff catalogue from 30.1 so there is one bonus system.

- On each achievement row, an optional bonus: none, or one buff definition (extra pulls, extra pack, or a personal buff with a duration). Not a community buff: an achievement is earned by one person.
- When `syncAchievements` newly earns it, apply that buff to the user with `source: 'achievement:<id>'`. The badge stays forever. The bonus expires by the buff's own rule (time, streams, season, or the next N pulls). Earning it again does not happen (stored achievements are not re-awarded), so the bonus is not applied twice.
- Switching the achievement off later does not strip a bonus already granted.
- **Checks:** extend `scripts/check-achievements.mts`: a new earn writes one buff; a second sync does not write another; a disabled kind grants nothing new.
- **Docs:** the achievements section from 27.3.

### 28.1 Pull limits per role, editable, plus a this-stream buff (Ready, M)

Decided 2026-10-19. There are no per-role limits today. `MixItUpSettings.limit` is one number for everyone (default 0 = no limit). A viewer can have their own base (`UserPullLimit.limit`) and temporary bonuses (`PullBuff`, admin-granted only).

**Defaults:** regular, subscriber, VIP, moderator and broadcaster all start at **0** (no limit). Staff change them in the admin panel whenever they want. Gifted subs only earn a pack. They do not add a pull-limit bonus.

- `MixItUpSettings.roleLimits` on the Paid pulls tab (`app/admin/mixitup/MixItUpConfig.tsx`), five number fields. The old `limit` stays as the fallback when a role is missing, so existing settings keep working. 0 still means no limit.
- The paid-pull webhook may send `role`: `regular | subscriber | vip | moderator | broadcaster`. Missing or unknown counts as regular. Do not call Twitch to look the role up. `CHANNEL_LOGIN` is always the broadcaster.
- A personal base limit still replaces the role default. Active personal buffs still add (`effectiveLimit`).
- **This stream, everyone:** on the same tab, an extra number of pulls for every viewer, and **Set** / **Clear**. Stored as one record `{ amount, streamKey, by, at }` (KV `pulls:stream-buff`). It counts only while `streamKey()` (`lib/mixitup-core.ts`) still matches. When the stream ends, the next read ignores it. No cron. `effectiveLimit` adds it for every viewer on top of their role or personal base. `requireAdmin`, `recordAudit`. Amount 0 clears it.
- Trainer-card community buffs (30.1) are a later way to grant the same kind of extra. They add as well. Build 28.1 first so 30.2 extends `effectiveLimit` instead of rewriting it.
- Same PR updates the FAQ answer from 27.1: no limit until staff set one, and staff can add extra pulls for everyone for the current stream.
- **Not touched:** `/api/twitch/*`, the panel, `middleware.ts`.
- **Checks:** `scripts/check-pull-limit.mts` for each role at 0 (no limit), a changed role limit, a personal override, a personal buff, the stream buff added and then ignored after the stream key changes, and a missing role.
- **Docs:** `docs/admin/mixitup.md`.

### 28.2 Generate a Mix It Up command from the saved settings (Ready, M)

The Commands tab already shows a paste-ready URL and JSON body for the selected command (`SetupPanel` in `app/admin/mixitup/CommandsPanel.tsx`). Paid pulls do not. Mix It Up has no API we should call to create commands inside it. Generate text the owner pastes.

- **Commands:** for each enabled command, a **Copy setup** block: command name (with `!`), webhook URL (`/api/webhooks/command`), JSON body `{ secret, command, username: "$username", args: "$allargs" }` using the real incoming secret, and which response field to send to chat (`message`). This is the existing panel, extended from "the one command you are editing" to "every enabled command".
- **Paid pulls:** on the Paid pulls tab, a **Copy setup** block built from `MixItUpSettings`: the balance request and the deduct request the site already sends (`action`, `currency`, `cost`, `message`, the URL fields). Say which Mix It Up action should answer `{ "balance": n }` and which should take the currency. Do not invent Mix It Up click-paths beyond what `docs/admin/mixitup.md` already tells the owner.
- **Checks:** a pure helper (next to `lib/mixitup-core.ts` or `lib/commands-core.ts`) covered by the existing Mix It Up check: the body contains the saved currency and the command name, and a secret is not printed as empty when one is set. Hand pass of both tabs.
- **Docs:** `docs/admin/mixitup.md`.

### 28.3 Font control on every card-back text element (Ready, S)

Decided 2026-10-19. The Font `<select>` only renders when an element is placed freely (`app/admin/components/card-back/Properties.tsx`). Stacked elements only get a size.

- Show the same font select on every text element, stacked or free. Options stay `BACK_FONTS` in `lib/card-back.ts` (display, body, mono, and the self-hosted faces). No font upload and no Google Fonts fetch.
- A stacked element with no font set keeps today's face, so existing designs do not change until someone picks one.
- **Checks:** `scripts/check-card-back.mts` if it asserts which fields a stacked element has. Hand pass: change the font on the big number and on the print line, stacked, and see it on the preview.
- Overlay fonts are 28.4, not this PR.

### 28.4 Font control in the Overlay Editor (Ready, M)

Decided with 28.3. The Overlay Editor has no font property (`lib/overlay-props.ts`). Text size and colour exist on the reveal label, the show-off label and the special-moment banner.

- Add a font select to those three text blocks, options the same `BACK_FONTS` ids. Default `display`, which is today's look, so a saved overlay does not change until someone picks a face.
- `public/widget.js` applies the family. Reuse the card-back font loader (`lib/card-back-overlay.ts`) rather than a second set of files. Per-pack overrides already exist (`overlay:packprops`): a pack can have its own face because these are ordinary overlay props.
- Do not edit `public/widget.js` in parallel with 25.2, 29.1 or 29.4.
- **Not touched:** the Twitch panel.
- **Checks:** `scripts/check-overlay.mts` for the new keys' defaults. `node --check public/widget.js`. Hand pass in the editor preview. Real OBS is not checkable here: say so in the PR.
- **Docs:** `docs/overlay.md`.

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

**Admin.** Pack workspace variant chips, the weights row and the upgrade cost row grow a Golden column. The public site shows the new labels wherever `VARIANT_LABELS` is used (dex, profile, FAQ, overlay). Achievement titles that say "Shiny Full Art" follow the label; the stored kind `all-shiny` / `first-shiny` does not rename. `docs/variants-and-scoring.md` describes the ladder and states that points still use `Card.stars` (29.3), and that Golden is not pulled until 29.5.

**Audit (read-only).** `scripts/audit-variant-rarity.mts`, same shape as `scripts/audit-trade-ledger.mts`: require `KV_REST_API_URL` and `KV_REST_API_READ_ONLY_TOKEN`, set the URL before the dynamic `import()`, load via `lib/db`, print a report, exit 0, first line "No keys were written." Report: cards by star count, holdings by variant index, copy ids `parseCopyId` would reject, any collection entry with index >= 4. Expected on today's data: zero index-4 entries, zero bad copy ids. Never writes.

**Dry-run migration.** `scripts/migrate-variant-rarity.mts`, same opt-in shape as `scripts/repair-trade-ledger.mts`: default dry-run, writes only with `--apply` and `TCG_REPAIR_CONFIRM=yes`, and only against the KV the env points at. The plan for this ladder is **empty** (ids did not move). The script prints "0 writes" and refuses `--apply` while the plan is empty, so it cannot be pointed at production by mistake. Holdings do not need a rewrite (29.3 keeps the score formula).

**Checks:** `scripts/check-upgrades.mts` for index 4 encode/decode, `parseCopyId`, and "rollDraw never returns golden". `npm run verify`.

### 29.3 Stars keep setting the value (decided, no PR)

Decided 2026-10-19. The stars on a card keep setting its value. The version multiplier stays as it is today (`baseScore × rarity from Card.stars × variantMultiplier × print bonus` in `lib/leaderboard.ts`). A Golden edition, once it exists, gets a version multiplier the same way a Shiny does. It does not replace the stars.

The names in 29.1 (Regular/Common through Golden/Legendary) are labels on the versions. The star names (Common through Legendary) stay too. Do not change `copyPoints`. Do not open a PR for this.

### 29.4 Variant styles, per pack, including Golden (Ready after 29.1, M)

Decided 2026-10-19: the amber Golden look is the default, and it must be editable. Every version's look is editable per pack. This is not a second effect system.

The Overlay Editor's **Variants** group is already that editor (`lib/overlay-props.ts`: label, shimmer, glow, rock, sparkles, reveal). Per-pack overrides are already `overlay:packprops`. What is missing is Golden, a way to open that group for one pack, and the website ignoring glow and rock (it uses the shimmer settings, then a hard-coded `.vfx-full` / `.vfx-shiny`).

- Add `golden` beside the other four in `VARIANT_DEFAULTS` and `variantProps`. Starting look, all of it editable: label "Golden", amber and cream shimmer (`#ffb703`, `#ffe14d`, `#fff6c2`), sweep 14s, loop on, an amber glow, a gentle rock, sparkles, burst colour `#f59e0b` (the Legendary amber in `lib/rarity.ts`). Reduced motion disables the sweep and the rock, as it does for Shiny.
- Pack workspace: a **Variant styles** link that opens the Overlay Editor with that pack selected and the Variants group open. Add a query (`?pack=<id>&group=variants`) if the editor cannot do that today. Do not build a second form that writes the same keys.
- Website tiles, the card dialog, the binder and the upgrade ceremony use the resolved shimmer, glow and rock for every version, including Golden, from those settings. A pack override then matches the stream. Overlay: `public/widget.js` and `public/widget.css`.
- **Not touched:** the Twitch panel. Golden is still not pulled (29.5), so the panel has nothing new to draw.
- Do not edit `public/widget.js` beside 25.2, 28.4 or 29.1.
- **Checks:** `scripts/check-overlay.mts` for the Golden defaults. Hand pass: change Golden's shimmer on one pack, see it in the editor preview and on a profile tile. Real OBS is not checkable here.
- **Docs:** `docs/overlay.md`, `docs/variants-and-scoring.md`.

### 29.5 Let Golden be pulled, including the Twitch panel (Blocked, panel freeze)

When the freeze lifts, in the same panel version as Ext:
- Turn `GOLDEN_PULLS` on. Packs opt in by setting a Golden weight (default stays 0, so nothing changes until a pack is edited).
- Teach `public/twitch-panel/panel.js` (and its CSS) the five-id list and index 4, or Golden entries render as a bad card number. Collection, season and upgrade responses may gain the new variant in existing arrays; do not change the JSON keys. `/api/twitch/upgrade` must understand a step up to Golden once the ladder includes it.
- Overlay already learned Golden in 29.1 and 29.4.
- Rebuild the extension zip (`scripts/lib/twitch-package.mjs` is in the freeze too). Bump `version`, screenshots, `twitch-extension/SUBMISSION.md`.

### 30.1 Trainer cards: buff model and Buff Editor (Ready, L)

Decided 2026-10-19. A trainer card grants one buff when its holder uses it, then the card is consumed (30.2). Staff-gated with the existing roles: admins edit (`requireAdmin`), mods do not get the page. No new role.

**Buff types** (the catalogue achievements also use, 27.5):

| Type | What the holder gets |
|---|---|
| `extra-pulls` | Their per-stream pull limit goes up by the magnitude while the buff lasts. Writes a `PullBuff` (`lib/pull-limit-core.ts`). A base limit of 0 still means no limit. |
| `extra-pack` | Magnitude pack credits. One pack is one card pull, the same as `!pack` today. A credit is used instead of counting against the stream limit. |
| `grant-achievement` | Awards one built-in achievement (and that achievement's bonus, once 27.5 has shipped). The achievement stays. This type has no duration. |
| Community | The same `extra-pulls` or `extra-pack`, but for every viewer, not one holder. Each viewer gets the benefit. It is not a shared pool. Stored once at `buffs:community`, not copied onto every user. |

**How long it lasts** (not used for `grant-achievement`):

- **Time:** a number of hours (`until` timestamp). Cap 1 to 8760.
- **Streams:** a number of stream keys (`streamKey()` in `lib/mixitup-core.ts`). Cap 1 to 30. Dropped when the limit is read, not by a cron.
- **Season:** until the active season changes.
- **Pulls:** for the next N pulls (cap 1 to 100). Decremented when a pull is saved for that viewer. A community buff counts a pull by each viewer separately.

Magnitude for pulls and packs is 1 to 10. **Stacking:** `refresh` moves the expiry out and does not add the amount again; `reject` refuses the use while that buff is active. Two different buffs both apply, up to `MAX_BUFFS` (20).

**Trade (decided).** A trainer card can be traded until someone uses it, like any other edition. Favourites and escrow still block a trade. Using it consumes it, so the new holder is the one who can use it. 30.2 does not add a trade ban.

**Model (pure, `lib/buffs-core.ts`):** `BuffDef`: `id`, `name`, `type`, `magnitude`, `duration: { unit: 'hours' | 'streams' | 'season' | 'pulls'; n?: number }`, `stack: 'refresh' | 'reject'`, `scope: 'self' | 'community'`, and `achievementId` when the type grants an achievement. KV `trainer:buffs` holds the definitions. A card gains `kind?: 'collector' | 'trainer'` (absent means collector) and `buffId?: string`, through the normal card save. A trainer is a Regular collection entry, so the frozen panel shows it as an ordinary card and needs no new key.

**Obtained** by a normal pull (the card's probability) or an admin grant. No variant roll, upgrades forced off. Not crafted.

**Editor.** `/admin/buffs`, "Buff Editor for Trainer Cards", nav entry in `lib/admin-nav.ts` (Game group), `docs/admin/routes.md`. List, create, edit, delete. Delete is refused while a card or an achievement still points at the buff. Pack workspace card panel: Kind, and a Buff select when Kind is Trainer. `ArmedButton` on delete. Audited (`recordAudit`).

**Docs:** `docs/admin.md` index line, and a short section in `docs/admin/packs-and-seasons.md` for the card kind. The FAQ waits for 30.2 so it does not describe a button that does not exist.

**Checks:** `scripts/check-buffs.mts` for the pure rules (duration maths, stack, community is not copied onto a user, caps). No KV writes from a laptop.

### 30.2 Use a trainer card: consume, buff, audit (Ready after 30.1, M)

- Owner, on the website card dialog: **Use** (two-tap, same arming as Upgrade). Hidden for visitors, for collector cards, and while the edition is in an offer or favourited.
- Server action, session viewer, not a client-supplied user. Confirms they hold one Regular copy, `card.kind === 'trainer'`, the buff exists, stack rule allows it.
- Applies the buff from 30.1: a personal `PullBuff` or pack credit on `user:<u>:pulllimit`, a row on `buffs:community`, or an achievement award. Source `card:<number>`.
- Consumes one edition: remove one collection entry (newest first, same choice as an upgrade spend) and retire that ledger copy. The card is gone. A timed buff can outlive it.
- `recordAudit(username, 'Trainer card used', '<card name>, <buff name>, until ...')`. New activity type `buff` on the site log only. Do not add it to any `/api/twitch/*` response.
- Tradable until used. Favourites and escrow still cannot be used or traded away by the usual rules. No new trade ban.
- **Checks:** `scripts/check-buffs.mts`: refresh does not double the amount, reject blocks, each duration drops the buff, a pull credit is consumed by one pull, a second copy is required for a second use, a favourite cannot be used.
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
| 25.2 panel strings | The website and the overlay change in 25.2. The panel keeps the old words (a copy is a print) until the freeze lifts |

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
