<div align="center">

# The Cheesy TCG

**A trading card game played live on stream.**

Viewers on the [Cheesygidds Twitch channel](https://www.twitch.tv/cheesygidds) pull cards on the stream overlay,<br>then collect, trade and show them off on [cheesytcg.app](https://cheesytcg.app).

[![Play on Twitch](https://img.shields.io/badge/Play_on-Twitch-9146FF?style=for-the-badge&logo=twitch&logoColor=white)](https://www.twitch.tv/cheesygidds)
[![Website](https://img.shields.io/badge/cheesytcg.app-FFC93C?style=for-the-badge&logo=vercel&logoColor=black)](https://cheesytcg.app)

[![CI](https://github.com/JoshMiles/tcg/actions/workflows/ci.yml/badge.svg)](https://github.com/JoshMiles/tcg/actions/workflows/ci.yml)
![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![daisyUI](https://img.shields.io/badge/daisyUI-5-5A0EF8?logo=daisyui&logoColor=white)
![Node](https://img.shields.io/badge/Node-24-5FA04E?logo=nodedotjs&logoColor=white)
[![License](https://img.shields.io/badge/license-all_rights_reserved-lightgrey)](LICENSE)

[What's in it](#whats-in-it) · [Tech stack](#tech-stack) · [Running it locally](#running-it-locally) · [Documentation](#documentation) · [License](#license)

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

## What's in it

| Part | What it does | Where |
|:-----|:-------------|:------|
| **Stream overlay** | The OBS browser source: pack openings, card reveals, upgrades, show-off | `public/widget.js`<br>`public/overlay.html` |
| **Public site** | Profiles, binders, the dex, leaderboard, trading, print pages | `app/(site)` |
| **Admin panel** | Seasons, packs, cards, the Overlay Editor, staff roles, backups | `app/admin` |
| **Twitch Extension** | A channel panel where viewers see their collection and trades | `public/twitch-panel`<br>`twitch-extension` |
| **API** | Pulls, trades, auth, cron jobs, webhooks | `app/api` |

## Tech stack

| Layer | Tools |
|:------|:------|
| **App** | [Next.js 15](https://nextjs.org) (App Router, server actions), React 19, TypeScript (strict) |
| **Styling** | Tailwind CSS 4 with daisyUI 5 |
| **Hosting and data** | [Vercel](https://vercel.com), Vercel KV (Upstash Redis), Vercel Blob for images and backups |
| **Twitch** | Twitch OAuth for sign-in, a Twitch Extension for the channel panel |
| **Optional** | Resend (email alerts), Web Push, Discord webhooks |

Data is three tiers in KV: **Seasons → Packs → Cards**. Each viewer's pulls are stored per season; duplicates are kept on purpose, because each entry is one pull. More in [`CLAUDE.md`](CLAUDE.md#data-architecture).

## Running it locally

> [!IMPORTANT]
> You need **Node 24**. Local work runs against an in-memory fake database, never a real one.

```bash
npm ci
node scripts/mock-kv.cjs          # fake KV on :4111, keep it running
# create .env.local as shown in docs/local-dev.md
npx tsx scripts/seed-dev.mts      # seeds a demo season
npm run dev
```

[`docs/local-dev.md`](docs/local-dev.md) covers logging in, the overlay test panel and a fake Twitch for website login. [`docs/hosting.md`](docs/hosting.md) lists every environment variable.

### Checks

```bash
npm run verify   # typecheck, every scripts/check-*.mts, syntax check of the overlay
npm run build    # production build; needs no secrets
```

CI runs both on every pull request. There is no browser test suite; changes are also checked by running the app.

## Documentation

<details>
<summary><b>Area docs</b> (click to expand)</summary>

<br>

| Doc | Covers |
|:----|:-------|
| [`ROADMAP.md`](ROADMAP.md) | Open work and the rules in force |
| [`docs/reference.md`](docs/reference.md) | Which file does what, the API routes |
| [`docs/variants-and-scoring.md`](docs/variants-and-scoring.md) | Card variants, upgrades, values, the leaderboard |
| [`docs/serials.md`](docs/serials.md) | Serial numbers and the copy ledger |
| [`docs/trading.md`](docs/trading.md) | Trades, escrow, notifications |
| [`docs/overlay.md`](docs/overlay.md) | The stream overlay and its editor |
| [`docs/twitch-extension.md`](docs/twitch-extension.md) | The Twitch panel |
| [`docs/public-site.md`](docs/public-site.md), [`docs/admin.md`](docs/admin.md) | Indexes for the site and admin topics |
| [`docs/staff.md`](docs/staff.md), [`docs/sandbox.md`](docs/sandbox.md) | Staff roles, sandboxes and preview data |

</details>

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
