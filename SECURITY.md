# Security policy

## Reporting a problem

Please do not open a public issue for a security problem.

Report it privately through GitHub: on this repository open **Security**, then **Report a vulnerability**. Include what you found, how to reproduce it and what it affects. You will get a reply within a week.

## In scope

- The live site and API at `https://cheesytcg.app`
- The stream overlay and the Twitch Extension panel
- The code in this repository

Examples: signing in as someone else, reading or changing another viewer's collection or trades, getting staff access, saving pulls without a server ticket, leaking secrets.

## Out of scope

- Denial of service, load testing or spam against the live site
- Attacks on Twitch, Vercel, GitHub or other services we use
- Social engineering of staff or viewers

Test against a local copy with the mock database (see `docs/local-dev.md`), not against real players' data. Never write to the live site while testing.

## Supported versions

Only the current `main` branch, which is what production runs.
