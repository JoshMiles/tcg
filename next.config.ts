import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { deriveVersion } from './lib/version';
import { securityHeaderRules } from './lib/security-headers';

// Build stamp, baked in at build time so every deployment is identifiable (see lib/version.ts).
// On Vercel the commit comes from VERCEL_GIT_*; locally we ask git.
function git(args: string): string | undefined {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

const nextConfig: NextConfig = {
  // CLAUDE.md is the agent guide; stop `next dev` writing its own AGENTS.md.
  agentRules: false,
  // Cache Components (partial prerendering). Every route still opts out with `instant = false` until the site shell is split.
  cacheComponents: true,
  partialPrefetching: true,
  // Wiki pages read content/wiki/*.md at request time. Trace those files into the server bundle.
  outputFileTracingIncludes: {
    '/admin/wiki': ['./content/wiki/**/*'],
    '/admin/wiki/[slug]': ['./content/wiki/**/*'],
  },
  env: {
    BUILD_VERSION: deriveVersion(
      pkg.version,
      process.env.VERCEL_GIT_COMMIT_MESSAGE ?? git('log -1 --format=%s'),
      process.env.VERCEL_GIT_PULL_REQUEST_ID,
      process.env.VERCEL_ENV,
    ),
    BUILD_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA ?? git('rev-parse HEAD') ?? '',
    BUILD_BRANCH: process.env.VERCEL_GIT_COMMIT_REF ?? git('rev-parse --abbrev-ref HEAD') ?? '',
    BUILD_ENV: process.env.VERCEL_ENV ?? 'development', // production | preview | development
    BUILD_TIME: new Date().toISOString(),
    BUILD_REPO:
      process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
        ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
        : '',
  },
  // Card art is big and the overlay re-requests it on every OBS refresh. Files are replaced under the
  // same name only rarely, so a day of caching (and a week of serve-stale-while-revalidating) is safe.
  async headers() {
    return [
      // Site-wide security headers and the CSP trial (lib/security-headers.ts; asserted by scripts/check-security-headers.mts).
      ...securityHeaderRules(process.env.NODE_ENV !== 'production'),
      {
        // The service worker must always be re-checked, or a fixed one would never reach people.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/assets/cards/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      {
        source: "/assets/sounds/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

// `npm run analyze` builds and writes a treemap of every JS bundle to .next/analyze/client.html.
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.npm_lifecycle_event === 'analyze', openAnalyzer: false });

export default withBundleAnalyzer(nextConfig);
