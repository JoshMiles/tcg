// The TCG Bridge desktop app's own checks (ROADMAP 55.6a/55.6b, bridge/scripts/check.ts: a fake Mix It Up, a fake OBS and a fake site on
// local ports), run with the rest. The app is otherwise kept out of the root typecheck (tsconfig excludes bridge/) and has its own
// package.json; CI installs it separately, so without `npm ci` in bridge/ this check skips instead of failing.
import { existsSync } from 'node:fs';

if (!existsSync(new URL('../bridge/node_modules/obs-websocket-js', import.meta.url)) || !existsSync(new URL('../bridge/node_modules/ws', import.meta.url))) {
  console.log('skipped: run npm ci in bridge/ to check the TCG Bridge app');
} else {
  await import('../bridge/scripts/check');
}
