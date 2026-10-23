// Checks how the build version is derived from the commit subject / preview PR (ROADMAP 42.1).
// Run: npx tsx scripts/check-version.mts
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const { deriveVersion } = await import('../lib/version');

ok(deriveVersion('1.1.0', 'Site speed: faster Card Dex (40.1) (#437)') === '1.437', 'PR number from the squash subject');
ok(deriveVersion('2.0.3', 'Fix thing (#12)  ') === '2.12', 'major comes from package.json; trailing space is fine');
ok(deriveVersion('1.1.0', 'Fix (#12) and more') === '1.1.0', 'a (#N) mid-subject is not a merge number');
ok(deriveVersion('1.1.0', 'wip commit') === '1.1.0', 'no number: package.json version');
ok(deriveVersion('1.1.0') === '1.1.0', 'no subject: package.json version');
ok(deriveVersion('1.1.0', 'wip', '438', 'preview') === '1.438-pr', 'preview build uses the PR id');
ok(deriveVersion('1.1.0', 'wip', '', 'preview') === '1.1.0', 'preview without a PR id falls back');
ok(deriveVersion('1.1.0', 'Thing (#437)', '438', 'production') === '1.437', 'production ignores the PR id');
ok(deriveVersion('1.1.0', 'wip', 'abc', 'preview') === '1.1.0', 'junk PR id ignored');
console.log('check-version: all passed');
process.exit(0);
