# TCG Bridge

A small Windows app for the stream PC. Mix It Up's Developer API only listens on that PC (`http://localhost:8911`), so the TCG site, which runs in the cloud, cannot reach it. TCG Bridge sits in the tray, asks the site for jobs (balance, take or give currency, chat viewers, a chat line), runs them against Mix It Up and posts the answers back. Site side and job details: [docs/admin/mixitup.md](../docs/admin/mixitup.md).

## Install and pair

1. On the site open Admin > Mix It Up and press **Download TCG Bridge** (or take the newest `bridge-v*` release from [GitHub releases](https://github.com/JoshMiles/tcg/releases?q=bridge-v&expanded=true)). Run `TCG-Bridge-Setup-<version>.exe`.
2. **The installer is not code-signed.** Windows SmartScreen says it "protected your PC": press **More info**, then **Run anyway**.
3. In Mix It Up switch the Developer API on: Services > Developer API > Connect.
4. On the site press **Pair TCG Bridge** and type the code into the app (the site address is `https://cheesytcg.app`). The app turns green when the site and Mix It Up both answer.

It starts with Windows and lives in the tray; closing the window keeps it running. Quit from the tray menu. It updates itself from the latest GitHub release (checked on start and every 6 hours, installed when you quit).

## Develop

```
cd bridge
npm install
npm run typecheck   # tsc --noEmit
npm run check       # fake Mix It Up and fake site, no Electron needed
npm start           # build, then run the app
npm run dist        # build the installer into release/ (not committed)
```

`TCG_BRIDGE_DATA=<folder>` keeps the app's settings in that folder instead of the real user data folder, which is handy against a local site (`http://localhost:3000` is allowed as a site address; anything else must be https).

- `src/site.ts`, `src/mixitup.ts`, `src/jobs.ts`, `src/service.ts`, `src/settings.ts`: plain TypeScript with no Electron imports, so the checks run under Node.
- `src/main.ts` and `src/preload.ts`: the Electron glue (tray, window, auto start, updates, encrypted token).
- `renderer/`: the window, plain HTML, CSS and JS.

To release: bump `version` in `package.json`, merge, then push a tag `bridge-v<version>`. `.github/workflows/bridge.yml` builds the installer on `windows-latest` and attaches it to a release of that tag.
