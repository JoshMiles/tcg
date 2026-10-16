// Checks the alpha / beta label helper (ROADMAP 16.3): reading the stored settings, the banner text and the admin header text.
// Run: npx tsx scripts/check-site-label.mts
process.env.KV_REST_API_URL ||= 'http://localhost:4111';
process.env.KV_REST_API_TOKEN ||= 'dev';
process.env.KV_URL ||= 'redis://dev';
const ok = (cond: unknown, msg: string) => { if (!cond) throw new Error('FAILED: ' + msg); };
const { parseSiteLabel, bannerText, adminSiteText, BANNER_DEFAULT } = await import('../lib/site-label');

ok(parseSiteLabel(null).label === null && parseSiteLabel(undefined).mode === 'open', 'nothing stored: no label, open');
ok(parseSiteLabel('not json').label === null, 'junk: no label');
ok(parseSiteLabel({ label: 'gold' }).label === null, 'unknown label ignored');
const beta = parseSiteLabel(JSON.stringify({ mode: 'beta', label: 'beta', v: 2 }));
ok(beta.label === 'beta' && beta.mode === 'beta' && bannerText(beta) === BANNER_DEFAULT.beta, 'default banner text');
ok(bannerText(parseSiteLabel({ label: 'alpha', message: '  Hello testers  ' })) === 'Hello testers', 'the admin message replaces the default');
ok(!BANNER_DEFAULT.alpha.includes('—') && !BANNER_DEFAULT.beta.includes('—'), 'no em dashes');
ok(adminSiteText(parseSiteLabel({ mode: 'beta', label: 'beta' })) === 'closed beta', 'admin text: closed beta');
ok(adminSiteText(parseSiteLabel({ mode: 'open', label: 'beta' })) === 'open beta', 'admin text: public beta');
ok(adminSiteText(parseSiteLabel({ mode: 'open', label: 'none' })) === null, 'admin text: nothing when open and unlabelled');
console.log('check-site-label: all passed');
process.exit(0);
