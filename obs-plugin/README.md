# TCG for OBS

A native OBS Studio plugin (ROADMAP Track 62): a dock called **TCG** that talks to TCG Bridge on the same PC. The dock has the live controls (62.4): pause pulls, pause channel point awards, happy hour, the queue and the live feed. TCG Bridge ships the plugin and installs it (62.5): see "Install" below.

- Windows x64, OBS 31 (built against OBS 31.1.1), C++17, CMake, Qt6 Widgets for the dock.
- The plugin has TCG Bridge's version (CMake reads `bridge/package.json` when it configures, so a build from the repo is always the app's version). The dock footer shows it.

## What the dock shows

| State | Header (right side) | Body |
|-------|---------------------|------|
| Connected | green dot, "Live · TCG Bridge connected" or "Offline · TCG Bridge connected" (from `live` in the state) | the controls, below |
| TCG Bridge not running | red dot, "TCG Bridge not running" | "The dock needs TCG Bridge", what to do, **Try again** |
| TCG Bridge older than 0.43.0 | amber dot, "TCG Bridge needs an update" | "Update TCG Bridge" and the version it found |

TCG Bridge 0.43.0 is the first with what the dock needs (the `pause-awards` request, the queue and the live feed on the Stream Deck link, ROADMAP 62.2). The dock tells the app's version from the `welcome` message.

## The controls (62.4)

Top to bottom, dark like OBS (colours from the mockup; the stylesheets are set on the dock's own widgets, so OBS's other docks look as before):

- **Pulls**: two 44 px buttons. **Pulls** is green "Pulls on / Press to pause" or amber "Pulls paused / Press to resume"; **Awards** (channel point awards) the same ("Awards on", "Awards paused"). While the site has not said yet (`null`) the button reads "Waiting for the site" and is disabled. A muted line under them shows the pause reason (for example "scene BRB"). The awards button sends an explicit target (`pause-awards` with `on`), so a late second press cannot flip it back; the pulls button toggles (`pause`).
- **Happy hour**: while one runs, its name in yellow and "N min left" (rounded up, redrawn every 30 seconds) with **End**; always three presets: **Free 15 min**, **Free 30 min**, **50% off 30 min**.
- **Queue (n)**: **Skip** and **Clear** (Clear asks "Clear the whole queue?" first). Each row is viewer and what, then "showing" for the one on screen or the seconds it waited ("12s"); "Nothing waiting" when empty.
- **Feed**: filter chips **All / Pulls / Requests / Events / Problems** (one is checked at a time), then the lines newest first with the local time (HH:MM) in grey; problems in red. It scrolls and takes the remaining height; the whole controls page scrolls when the dock is very small.
- Footer: "Plugin x.y.z". There is no link to the Stream page: the Stream Deck link does not tell the dock the site address, and the app is not changed for it.

Sending: every button sends `{"t":"do","n":N,"req":{...}}` through the link (`Link::send`, safe from any thread). The app answers `{"t":"done","n":N,"ok":true|false,"text":"..."}` and then pushes its new state. All the buttons that send are disabled from the press until the answer and the next state have both come (or 3 seconds pass; 0.8 seconds after an `ok` answer whose state did not change), so a press cannot be sent twice. A `false` answer shows its text in red under the Pulls buttons. If the link drops, the dock goes back to the "not running" page and reconnects by itself.

Keyboard and screen readers: Tab goes top to bottom (Pulls, Awards, End, the three presets, Skip, Clear, the five chips, the feed), Space or Enter presses, the chips are checkable and show a focus ring, and every button has an accessible name ("Pulls on. Press to pause", "Feed filter: Problems"). The state is parsed with `QJsonDocument` on the UI thread; a field of the wrong type gets the old-app default.

## How it finds TCG Bridge

It uses the Stream Deck link, with nothing to type or switch on in the dock:

1. TCG Bridge listens on `127.0.0.1` (port 47654, or the next free one up to 47658) and writes the port and a fresh random token to `%APPDATA%\TCG Bridge\streamdeck.json` every time it starts. The listener is on while the Stream Deck link switch is on (Connections page, Stream Deck plugin).
2. The dock reads that file, connects to `ws://127.0.0.1:<port>` and sends `hello` (the token, protocol 1, its own version) first. The app answers `welcome` with its version, and closes the link on a wrong token, a wrong first message or silence for 5 seconds.
3. When the link is not up, the dock reads the file again and tries again after 2, 3, 5, 5 and then every 8 seconds, so a restarted TCG Bridge (new token) is found by itself. **Try again** tries at once.

Only plain `ws://` to `127.0.0.1` is used; the plugin never talks to the internet. All of this runs on a thread of its own; the dock gets changes as queued Qt calls, so OBS's interface never waits on the network.

## Install

TCG Bridge (0.44.0 and newer) carries `tcg-obs.dll` and its `data/` folder in its installer. Its Connections page, OBS part, **TCG dock for OBS**, has the **Install OBS plugin** button (also **Update** / **Reinstall**). It asks you to close OBS first, then copies the plugin to `%ProgramData%\obs-studio\plugins\tcg-obs\` (`bin\64bit\tcg-obs.dll`, `data\`, and a `version.txt` with the version installed), which OBS 30 to 32 load without administrator rights. Start OBS and open View > Docks > TCG. The plugin is built against OBS 31 and loads in OBS 32 too (seen in 32.2.2). If OBS is a newer major than 32, TCG Bridge shows a warning that it may not load (it still installs). Details: [bridge/README.md](../bridge/README.md), "Install OBS plugin".

The plugin's folder reaches TCG Bridge's release build as the `tcg-obs-windows-x64` artifact of this folder's workflow, which the bridge release workflow calls; a release fails when it is missing. Changes under `obs-plugin/` follow TCG Bridge's version rule (raise the minor).

## Files

- `src/core.h`: the parts with no OBS or Qt (token-file parsing, the hello message, version comparison, the retry wait, and for the controls the request bodies, minutes left, the waiting text and the feed filter). `tests/core_test.cpp` tests them; `ctest` runs it.
- `src/link.h`, `src/link.cpp`: the connection, on its own thread, with [IXWebSocket](https://github.com/machinezone/IXWebSocket) v11.4.6 (BSD-3-Clause, fetched by CMake at a pinned commit, built static, no TLS and no zlib).
- `src/dock.cpp`, `src/plugin-main.cpp`: the dock and the module entry points (`obs_frontend_add_dock_by_id`).
- `data/locale/en-US.ini`: the dock's title.
- `buildspec.json`, `cmake/`: from [obs-plugintemplate](https://github.com/obsproject/obs-plugintemplate), Windows only. `buildspec.json` pins the OBS sources, obs-deps and Qt6 (versions and hashes) that CMake downloads into `.deps/` on the first configure; `cmake/common/bootstrap.cmake` is changed to take the version from `bridge/package.json`.

## Build

You need Visual Studio 2022 (Desktop C++ workload with a Windows 10 SDK 10.0.22621 or newer), CMake 3.28 or newer and git. From this folder:

```
cmake --preset windows-x64
cmake --build --preset windows-x64
ctest --preset windows-x64
cmake --install build_x64 --config RelWithDebInfo --prefix release
```

The first configure downloads about 1 GB (OBS sources, obs-deps, Qt6) and builds OBS's `libobs` and `obs-frontend-api` once. `release/tcg-obs/` then holds `bin/64bit/tcg-obs.dll` (and its `.pdb`) and `data/`; copy that folder to `%ProgramData%\obs-studio\plugins\` to try it by hand (or let TCG Bridge do it, above). To build against another OBS 31 release, change the versions and hashes in `buildspec.json` (the template's `buildspec.json` lists them).

CI (`.github/workflows/obs-plugin.yml`) does the same on `windows-2022` for changes under `obs-plugin/` and when `bridge.yml` calls it for a release, runs the tests, checks that `bin/64bit/tcg-obs.dll` and `data/locale/en-US.ini` are in `release/tcg-obs` and keeps that folder as the `tcg-obs-windows-x64` artifact.

## Licence

Everything in `obs-plugin/` is licensed under the GNU General Public License, version 2 (`obs-plugin/LICENSE`), because the plugin links OBS's `libobs` (GPL-2.0-or-later) and its CMake files come from the GPL-2.0 obs-plugintemplate. The rest of the repository (the site, TCG Bridge, the Stream Deck plugin) stays under the root `LICENSE`. IXWebSocket, fetched at build time, is BSD-3-Clause.
