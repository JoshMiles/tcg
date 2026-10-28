<div align="center">

# The Cheesy TCG

**A trading card game played live on stream.**

Viewers on the [Cheesygidds Twitch channel](https://www.twitch.tv/cheesygidds) pull cards on the stream overlay,<br>then collect, trade and show them off on [cheesytcg.app](https://cheesytcg.app).

[![Play on Twitch](https://img.shields.io/badge/Play_on-Twitch-9146FF?style=for-the-badge&logo=twitch&logoColor=white)](https://www.twitch.tv/cheesygidds)
[![Website](https://img.shields.io/badge/cheesytcg.app-FFC93C?style=for-the-badge&logo=vercel&logoColor=black)](https://cheesytcg.app)

[![CI](https://github.com/JoshMiles/tcg/actions/workflows/ci.yml/badge.svg)](https://github.com/JoshMiles/tcg/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![daisyUI](https://img.shields.io/badge/daisyUI-5-5A0EF8?logo=daisyui&logoColor=white)
![Node](https://img.shields.io/badge/Node-24-5FA04E?logo=nodedotjs&logoColor=white)
[![License](https://img.shields.io/badge/license-all_rights_reserved-lightgrey)](LICENSE)

[What it is](#what-it-is) · [How it fits together](#how-it-fits-together) · [Repo map](#repo-map) · [Running it locally](#running-it-locally) · [Checks and CI](#checks-and-ci) · [Deploys and versions](#deploys-and-versions) · [Documentation](#documentation) · [How work is done](#how-work-is-done) · [License](#license)

</div>

---

> [!NOTE]
> The game runs only on the Cheesygidds channel. This repository is published so people can read how it works; it is not a kit for running your own copy (see [License](#license)).

> [!TIP]
> **Here to play, or ended up here by accident?** This page is the game's source code. You don't need any of it to play.
>
> - **Play:** watch [Cheesygidds on Twitch](https://www.twitch.tv/cheesygidds) and pull cards in chat.
> - **Your cards, binder and trades:** [cheesytcg.app](https://cheesytcg.app)
> - **Questions:** the [FAQ](https://cheesytcg.app/faq)
> - **Ideas or feedback:** [cheesytcg.app/feedback](https://cheesytcg.app/feedback)
> - **Something broken?** [Report a bug](https://github.com/JoshMiles/tcg/issues/new?template=bug_report.yml) or [suggest a feature](https://github.com/JoshMiles/tcg/issues/new?template=feature_request.yml) (needs a free GitHub account), or just say so in the Twitch chat.

## What it is

The Cheesy TCG is a trading card game played live on the Cheesygidds Twitch channel. Viewers pull card packs on the stream, watch each pull open on the overlay, then collect, trade and show off their cards on the website. Data is three tiers: **Seasons, Packs, Cards**. Each viewer's pulls are stored per season, and duplicates are kept on purpose, because every entry is one pull (see [`docs/data-architecture.md`](docs/data-architecture.md)).

## How it fits together

| Piece | What it does | Where |
|:------|:-------------|:------|
| **Stream overlay** | The OBS browser source: pack openings, card reveals, upgrades, show-off | `public/widget.js`, `public/overlay.html` |
| **Public site** | Profiles, binders, the dex, leaderboard, trading, print pages | `app/` (public routes) |
| **Admin and mod portals** | Seasons, packs, cards, the Overlay Editor, the Mix It Up page, staff roles, backups (admin); a slimmer moderation panel (mod) | `app/admin`, `app/mod` |
| **Twitch Extension** | A channel panel where viewers see their collection and trades | `public/twitch-panel`, `twitch-extension` |
| **Mix It Up integration** | Paid pulls with Brie Bucks, chat commands, event rewards | `app/admin/stream` and the `lib/mixitup*` and `lib/bridge*` files |
| **TCG Bridge** | A Windows app on the stream PC that carries the site's requests to Mix It Up and watches OBS | `bridge/` |

The site is Next.js on Vercel. Data lives in Upstash Redis, reached only through `lib/db.ts`; card art and backups are in Vercel Blob. Mix It Up's Developer API only listens on the stream PC, so the cloud site cannot call it. Mix It Up calls the site when a viewer uses a chat command; TCG Bridge on the stream PC asks the site for jobs (take Brie Bucks, post a chat line, run a command), runs them against Mix It Up and posts the answers back.

```
Twitch chat --> Mix It Up --(chat command)--> TCG site (Vercel) --> Redis, Blob
                    ^                            |    |    |
                    |                            |    |    +--> website, admin and mod portals
                    |                            |    +-------> Twitch panel extension
                    |                            |
                    +-- TCG Bridge <--(jobs)-----+---------> OBS overlay (widget.js)
                         (stream PC)
                             |
                             +--> OBS WebSocket (scene, stream state)
```

Details: [`docs/overlay.md`](docs/overlay.md), [`docs/twitch-extension.md`](docs/twitch-extension.md), [`docs/admin/mixitup.md`](docs/admin/mixitup.md) and [`bridge/README.md`](bridge/README.md).

## Repo map

| Folder | What is in it |
|:-------|:--------------|
| `app/` | The Next.js App Router: public pages, `admin/`, `mod/`, `api/` routes and shared `components/` |
| `lib/` | Server and shared logic: the data layer (`db.ts`, `kv.ts`), trading, scoring, backups, Mix It Up and the bridge |
| `public/` | Static files: the overlay (`widget.js`, `widget.css`, `overlay.html`), the Twitch panel (`twitch-panel/`), fonts, icons, brand art |
| `bridge/` | TCG Bridge, the desktop app for the stream PC (its own `package.json`) |
| `scripts/` | The `check-*.mts` checks, the mock KV and fake Twitch, seeding, the changelog builder |
| `docs/` | Area docs, plus `archive/` for history |
| `twitch-extension/` | The Twitch Extension submission pack and its images |
| `content/` | The staff wiki topics (`content/wiki/*.md`) |
| `.github/` | CI workflows, the PR template, issue templates |

[`docs/reference.md`](docs/reference.md) lists which file does what and the API routes.

## Running it locally

> [!IMPORTANT]
> You need **Node 24**. Local work runs against an in-memory fake database (the mock KV), never production data.

```bash
npm ci
node scripts/mock-kv.cjs          # fake KV on :4111, keep it running
# create .env.local as shown in docs/local-dev.md
npx tsx scripts/seed-dev.mts      # seeds a demo season
npm run dev
```

[`docs/local-dev.md`](docs/local-dev.md) covers logging in, the overlay test panel and a fake Twitch for website login. [`docs/hosting.md`](docs/hosting.md) lists every environment variable.

## Checks and CI

```bash
npm run verify   # typecheck, every scripts/check-*.mts, syntax check of the overlay
npm run build    # production build; needs no secrets
```

There is no browser test suite; changes are also checked by running the app. TCG Bridge has its own checks: in `bridge/`, run `npm ci`, then `npm run typecheck` and `npm run check` (a fake Mix It Up, OBS and site, no Electron needed).

| Workflow | What it runs |
|:---------|:-------------|
| [`ci.yml`](.github/workflows/ci.yml) | On every pull request and push to `main`: typecheck, the checks, the overlay syntax checks and a build with no secrets |
| [`bridge.yml`](.github/workflows/bridge.yml) | For changes under `bridge/` or `streamdeck/`: typecheck, the checks, the version rule and packing the Stream Deck plugin. On `main` it also builds and publishes the installer, with the plugin inside |
| [`pr-body.yml`](.github/workflows/pr-body.yml) | Checks the PR description against the template (`scripts/check-pr-body.mjs`) and that the docs, staff wiki and README were updated for the code the PR changes (`scripts/check-docs.mjs`, mapped in `docs/doc-map.json`) |
| [`claude-code-review.yml`](.github/workflows/claude-code-review.yml), [`claude.yml`](.github/workflows/claude.yml) | Claude reviews pull requests and answers `@claude` mentions |

## Deploys and versions

Pushing a branch builds a Vercel Preview; merging to `main` deploys production at `cheesytcg.app`. The scheduled jobs (nightly encrypted backup, account check, weekly and per-minute jobs) are in `vercel.json`. The **site version** is `<major>.<PR number>`, for example `1.437`: the major is the first part of `package.json`'s `version`, the PR number comes from the squash-merge commit. It shows in the admin sidebar. Environment variables, backups and data health are in [`docs/hosting.md`](docs/hosting.md).

**TCG Bridge** has its own semver in `bridge/package.json`. Every PR that changes anything under `bridge/` (except `bridge/README.md`) or `streamdeck/` (the Stream Deck plugin, shipped inside the app with the same version) raises the minor version, and CI fails otherwise. When that PR merges, the workflow builds the installer and publishes the GitHub release `bridge-v<version>` by itself, with no hand tag. The installed app updates itself from that release. More in [`bridge/README.md`](bridge/README.md).

## Documentation

Start with [`CLAUDE.md`](CLAUDE.md) (the working rules) and [`ROADMAP.md`](ROADMAP.md). Each area doc opens with a line saying when to read it.

<details>
<summary><b>Area docs</b> (click to expand)</summary>

<br>

| Doc | Covers |
|:----|:-------|
| [`docs/data-architecture.md`](docs/data-architecture.md) | How seasons, packs, cards, collections and profiles are stored |
| [`docs/variants-and-scoring.md`](docs/variants-and-scoring.md) | Variants, upgrades, card values, score, the leaderboard |
| [`docs/serials.md`](docs/serials.md) | The copy ledger, serial and unique copy numbers, copy pages |
| [`docs/trading.md`](docs/trading.md) | Trades, escrow, trade pages, notifications |
| [`docs/public-site.md`](docs/public-site.md) | Index of the public pages |
| [`docs/admin.md`](docs/admin.md) | Index of the admin pages, including Mix It Up |
| [`docs/overlay.md`](docs/overlay.md) | The stream overlay and its editor |
| [`docs/twitch-extension.md`](docs/twitch-extension.md) | The Twitch panel, the hosted zip and the submission pack |
| [`docs/sandbox.md`](docs/sandbox.md) | `lib/db.ts`, sandboxes, preview data, the fake Twitch page |
| [`docs/staff.md`](docs/staff.md) | Staff roles, Twitch sign-in for the panels, the mod panel |
| [`docs/hosting.md`](docs/hosting.md) | Deploys, environment variables, build stamp, backups, data health |
| [`docs/review.md`](docs/review.md) | Running a review batch: seed data, page sweeps, the mod access test |
| [`docs/local-dev.md`](docs/local-dev.md) | Running locally, the overlay test panel, fake Twitch login |
| [`docs/git-and-prs.md`](docs/git-and-prs.md) | Pushing, PRs, PR bodies, review comments |
| [`docs/model-workflow.md`](docs/model-workflow.md) | Planning work and delegating it to subagents |
| [`docs/reference.md`](docs/reference.md) | Which file does what, the API routes |
| [`docs/archive/roadmap-history.md`](docs/archive/roadmap-history.md) | The original plan behind finished roadmap items |

</details>

## How work is done

[`ROADMAP.md`](ROADMAP.md) lists open work only; finished items move to [`docs/archive/roadmap-history.md`](docs/archive/roadmap-history.md). Each feature is one pull request, branched from an up-to-date `main`, with a description that follows the [PR template](.github/pull_request_template.md) (Changelog, Summary, Test plan). Player-facing changes fill the Changelog section, which feeds the site's What's new page. Planning, writing and grunt work are split between models: see [`docs/model-workflow.md`](docs/model-workflow.md).

## Built alongside Claude

This project was designed and developed together with [Claude](https://claude.ai), Anthropic's AI assistant, through [Claude Code](https://claude.com/claude-code). Most commits and pull requests were written by Claude working with the maintainer, who set the direction, reviewed the work and tested it on stream. Commits carry a `Co-Authored-By: Claude` line, and [`CLAUDE.md`](CLAUDE.md) holds the working rules Claude follows in this codebase.

## Contributing

This is a personal project for one community, so outside pull requests are not expected. Bug reports and ideas are welcome as [issues](https://github.com/JoshMiles/tcg/issues). If you play the game, the quickest way to reach us is in the Cheesygidds Twitch chat.

> [!CAUTION]
> Please do not report security problems in public issues. See [`SECURITY.md`](SECURITY.md).

## License

Copyright (c) 2026 Josh Miles. All rights reserved.

The source is published for reading and reference only. You may not copy, modify, host or redistribute the code, card art, sounds or branding without written permission. See [`LICENSE`](LICENSE). Bundled fonts keep their own licenses (OFL, in `public/fonts/back`).

---

<div align="center">
<sub>Made for the <a href="https://www.twitch.tv/cheesygidds">Cheesygidds</a> community.</sub>
</div>
