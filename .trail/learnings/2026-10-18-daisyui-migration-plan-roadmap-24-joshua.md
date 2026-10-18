---
title: daisyUI migration plan (ROADMAP 24)
author: Joshua
date: 2026-10-18
branch: chore/design-sync
cost: { minutes: 3, tokens: 62281 }
touches:
  - ROADMAP.md
---

## Decided
- Move to daisyUI 5, which needs Tailwind 4. Tailwind 3 to 4 goes first as its own no-visual-change PR (24.0), then daisyUI with a custom `cheesy` theme (24.1), then shared primitives, then page by page. Plan lives in ROADMAP.md item 24.
- Keep the navy gray-* and brand yellow-* scale overrides through the migration so unmigrated pages keep their look.
- No class prefix: nothing in app/ or lib/ defines btn, card, input, modal etc. (only .tcg-btn and .tcg-panel exist in globals.css).

## Tried and ruled out
- daisyUI 4 on Tailwind 3: works today but is the old line and forces a second migration.

## Watch out
- .design-sync has its own safelisted Tailwind config and a buildCmd using the v3 CLI; it must move to v4 with the app.
- Overlay (widget.css) and Twitch panel (panel.css) are plain CSS and out of scope; the panel is frozen anyway.
