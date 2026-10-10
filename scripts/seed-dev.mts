// Seeds the local mock KV (scripts/mock-kv.cjs) with Season 1: `npx tsx scripts/seed-dev.mts`
// Refuses to run against anything that isn't localhost, so it can never write to the real database.
const url = process.env.KV_REST_API_URL ?? 'http://localhost:4111';
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error(`Refusing to seed non-local KV: ${url}`);
process.env.KV_REST_API_URL = url;
process.env.KV_REST_API_TOKEN ??= 'dev';
process.env.KV_URL ??= 'redis://dev';
const { seedSeason1 } = await import('../lib/kv');
await seedSeason1();
console.log('Seeded Season 1 into', url);
