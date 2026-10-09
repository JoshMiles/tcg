// Build identity, stamped by next.config.ts at build time. Safe to import anywhere.
export interface BuildInfo {
  version: string;      // package.json version, e.g. "1.1.0"
  commit: string;       // short SHA, or "unknown"
  commitFull: string;
  branch: string;
  env: string;          // production | preview | development
  builtAt: string;      // ISO timestamp
  commitUrl: string | null;
}

export function getBuildInfo(): BuildInfo {
  const commitFull = process.env.BUILD_COMMIT ?? '';
  const repo = process.env.BUILD_REPO ?? '';
  return {
    version: process.env.BUILD_VERSION ?? '0.0.0',
    commit: commitFull ? commitFull.slice(0, 7) : 'unknown',
    commitFull,
    branch: process.env.BUILD_BRANCH ?? '',
    env: process.env.BUILD_ENV ?? 'development',
    builtAt: process.env.BUILD_TIME ?? '',
    commitUrl: repo && commitFull ? `https://github.com/${repo}/commit/${commitFull}` : null,
  };
}

/** "v1.1.0 · 75fdb70" */
export function formatVersion(b: BuildInfo): string {
  return `v${b.version} · ${b.commit}`;
}

/** Multi-line hover text with the full details. */
export function describeBuild(b: BuildInfo): string {
  return [
    `Version ${b.version}`,
    `Commit ${b.commitFull || 'unknown'}`,
    b.branch && `Branch ${b.branch}`,
    `Environment ${b.env}`,
    b.builtAt && `Built ${new Date(b.builtAt).toLocaleString()}`,
  ].filter(Boolean).join('\n');
}
