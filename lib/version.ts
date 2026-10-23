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

/**
 * The build's version: "<major>.<PR number>" from the "(#N)" a squash merge puts at the end of the commit subject,
 * "<major>.<N>-pr" on a preview build of PR N, else the package.json version. Used by next.config.ts, so keep it dependency-free.
 */
export function deriveVersion(pkgVersion: string, subject?: string, previewPr?: string, vercelEnv?: string): string {
  const major = pkgVersion.split('.')[0];
  if (vercelEnv === 'preview' && previewPr && /^\d+$/.test(previewPr)) return `${major}.${previewPr}-pr`;
  const n = subject?.match(/\(#(\d+)\)\s*$/)?.[1];
  return n ? `${major}.${n}` : pkgVersion;
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
