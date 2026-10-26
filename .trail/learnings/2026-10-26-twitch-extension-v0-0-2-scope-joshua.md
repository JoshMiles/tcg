---
title: Twitch extension v0.0.2 scope and version number
author: Joshua
date: 2026-10-26
branch: main
cost: { minutes: 4, tokens: 70752 }
touches:
  - HANDOFF.md
  - package.json
  - scripts/lib/twitch-package.mjs
  - twitch-extension/SUBMISSION.md
---

## Decided
- Josh (2026-10-26): extension version 0.0.2 = ROADMAP Track 34 in full (34.1 to 34.6 built one PR at a time, 34.7 planned and possibly moved to 0.0.3, 34.8 release).
- The extension gets its own version number (Twitch's 0.0.x) for the Asset Hosting zip name; package.json `version` (the site's, 1.1.0) stays as it is. Today `packageVersion()` in scripts/lib/twitch-package.mjs reads package.json, so 34.8 changes that.

## Tried and ruled out
- Bumping package.json to 0.0.2: rejected, it is the site's version, not Twitch's.

## Watch out
- Twitch versions are 0.0.x in the Developer Console; the 0.0.1 submission's change log ("Initial release") is in twitch-extension/SUBMISSION.md.
