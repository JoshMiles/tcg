import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { deriveVersion } from './lib/version';

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
