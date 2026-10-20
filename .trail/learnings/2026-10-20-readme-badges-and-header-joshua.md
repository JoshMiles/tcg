---
title: README badges and header
author: Joshua
date: 2026-10-20
branch: chore/edition-serial-wording
cost: { minutes: 1, tokens: 60279 }
touches:
  - README.md
  - package.json
---

## Decided
README has a centered header with shields.io badges (Twitch, site, CI from ci.yml, stack versions, license) and a NOTE callout saying the game runs only on Cheesygidds.

## Tried and ruled out
Nothing.

## Watch out
Badge versions are hard-coded; bump them when package.json majors change (README said Tailwind 3 while package.json had 4).
