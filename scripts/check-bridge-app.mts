// The TCG Bridge desktop app's own checks (ROADMAP 55.6a, bridge/scripts/check.ts: a fake Mix It Up and a fake site on local ports),
// run with the rest. The app is otherwise kept out of the root typecheck (tsconfig excludes bridge/) and has its own package.json.
await import('../bridge/scripts/check');
