---
title: Track 38 next step after 38.13/38.14
author: Joshua
date: 2026-10-21
branch: overlay-editor-menu-bar
cost: { minutes: 1, tokens: 64356 }
touches:
  - ROADMAP.md
---

## Decided
- Track 38 build order: after 38.13/38.14 (shipped #348-#350) comes 38.29 (a), the menu bar + status bar, before 38.1. Delegated to one Sonnet session on local branch `overlay-editor-menu-bar` (commit locally, no push until the user asks).
- Shared workspace shell (MenuBar, StatusBar) lives in app/admin/components/workspace/ with no overlay imports, so 38.30 (card back editor) can reuse it.
- Status bar shows only data that exists today; pointer X/Y (38.19) and fps (38.23) are not stubbed.

## Tried and ruled out
- Editing ROADMAP.md while the executor works in the same working tree: it would clash with the branch checkout. Do roadmap cleanup after.

## Watch out
- ROADMAP still lists 35.2 as Ready, but it shipped in #346. Remove it in a roadmap PR.
- The working tree has unrelated .trail/cache changes: stage only your own files by path.
