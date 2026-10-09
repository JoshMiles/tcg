import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Build stamp, baked in at build time so every deployment is identifiable (see lib/version.ts).
// On Vercel the commit comes from VERCEL_GIT_*; locally we ask git.
function git(args: string): string | undefined {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

const nextConfig: NextConfig = {
  env: {
    BUILD_VERSION: pkg.version,
    BUILD_COMMIT: process.env.VERCEL_GIT_COMMIT_SHA ?? git('rev-parse HEAD') ?? '',
    BUILD_BRANCH: process.env.VERCEL_GIT_COMMIT_REF ?? git('rev-parse --abbrev-ref HEAD') ?? '',
    BUILD_ENV: process.env.VERCEL_ENV ?? 'development', // production | preview | development
    BUILD_TIME: new Date().toISOString(),
    BUILD_REPO:
      process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
        ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
        : '',
  },
};

export default nextConfig;
