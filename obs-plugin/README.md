# TCG for OBS

A native OBS Studio plugin (ROADMAP Track 62): a dock called **TCG** that talks to TCG Bridge on the same PC. This is the skeleton (62.3): the dock shows whether TCG Bridge is running and nothing else yet; the live controls come with 62.4 and the install button in TCG Bridge with 62.5.

- Windows x64, OBS 31 (built against OBS 31.1.1), C++17, CMake, Qt6 Widgets for the dock.
- The plugin has TCG Bridge's version (CMake reads `bridge/package.json` when it configures, so a build from the repo is always the app's version). The dock footer shows it.

## What the dock shows

| State | Header (right side) | Body |
|-------|---------------------|------|
| Connected | green dot, "TCG Bridge connected" | a line saying it is connected (62.4 puts the controls here) |
| TCG Bridge not running | red dot, "TCG Bridge not running" | "The dock needs TCG Bridge", what to do, **Try again** |
| TCG Bridge older than 0.43.0 | amber dot, "TCG Bridge needs an update" | "Update TCG Bridge" and the version it found |

TCG Bridge 0.43.0 is the first with what the dock needs (the `pause-awards` request, the queue and the live feed on the Stream Deck link, ROADMAP 62.2). The dock tells the app's version from the `welcome` message.

## How it finds TCG Bridge

It uses the Stream Deck link, with nothing to type or switch on in the dock:

1. TCG Bridge listens on `127.0.0.1` (port 47654, or the next free one up to 47658) and writes the port and a fresh random token to `%APPDATA%\TCG Bridge\streamdeck.json` every time it starts. The listener is on while the Stream Deck link switch is on (Connections page, Stream Deck plugin).
2. The dock reads that file, connects to `ws://127.0.0.1:<port>` and sends `hello` (the token, protocol 1, its own version) first. The app answers `welcome` with its version, and closes the link on a wrong token, a wrong first message or silence for 5 seconds.
3. When the link is not up, the dock reads the file again and tries again after 2, 3, 5, 5 and then every 8 seconds, so a restarted TCG Bridge (new token) is found by itself. **Try again** tries at once.

Only plain `ws://` to `127.0.0.1` is used; the plugin never talks to the internet. All of this runs on a thread of its own; the dock gets changes as queued Qt calls, so OBS's interface never waits on the network.

## Files

- `src/core.h`: the parts with no OBS or Qt (token-file parsing, the hello message, version comparison, the retry wait). `tests/core_test.cpp` tests them; `ctest` runs it.
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

The first configure downloads about 1 GB (OBS sources, obs-deps, Qt6) and builds OBS's `libobs` and `obs-frontend-api` once. `release/tcg-obs/` then holds `bin/64bit/tcg-obs.dll` (and its `.pdb`) and `data/`; copy that folder to `%ProgramData%\obs-studio\plugins\` to try it by hand. To build against another OBS 31 release, change the versions and hashes in `buildspec.json` (the template's `buildspec.json` lists them).

CI (`.github/workflows/obs-plugin.yml`) does the same on `windows-2022` for changes under `obs-plugin/`, runs the tests and keeps `release/tcg-obs` as the `tcg-obs-windows-x64` artifact.

## Licence

The template's CMake files are GPL-2.0, and OBS's `libobs` is GPL-2.0-or-later, which the plugin links; see the repository `LICENSE` for the rest.
