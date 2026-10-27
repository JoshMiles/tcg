import { Suspense } from 'react';
import { backupStatus } from '@/lib/backup';
import { checkEnv, readEnv, summarizeEnv } from '@/lib/env-health';
import { isPasswordLoginEnabled } from '@/lib/admin-token';
import { getBuildInfo } from '@/lib/version';
import { Tile } from './components/ui';

const ENV_TAB = '/admin/settings?tab=environment';

async function BackupTile() {
  const now = Date.now();
  const s = await backupStatus(now);
  const h = s.lastAt === null ? null : Math.floor((now - s.lastAt) / 3_600_000);
  const value = h === null ? 'None' : h < 1 ? 'Under 1h ago' : h < 48 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
  return <Tile icon="database" label="Last backup" value={value} sub={s.problem ?? `${s.count} kept`} tone={s.lastAt === null || s.stale ? 'red' : 'green'} href={ENV_TAB} />;
}

/** At-a-glance health on the dashboard: backup age (one Blob listing, streamed in), env readiness and build (both free), emergency login. Detail is on Settings. */
export function HealthStrip() {
  const env = summarizeEnv(checkEnv(readEnv()));
  const build = getBuildInfo();
  const passwordOn = isPasswordLoginEnabled();
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Suspense fallback={<Tile icon="database" label="Last backup" value="Checking" />}>
        <BackupTile />
      </Suspense>
      <Tile icon="shield" label="Environment" value={env.ready ? 'Ready' : `${env.requiredMissing} missing`} sub={env.weak > 0 ? `${env.weak} short secret${env.weak === 1 ? '' : 's'}` : env.recommendedMissing > 0 ? `${env.recommendedMissing} recommended not set` : 'everything set'} tone={!env.ready ? 'red' : env.weak > 0 || env.recommendedMissing > 0 ? 'amber' : 'green'} href={ENV_TAB} />
      <Tile icon="lock" label="Password login" value={passwordOn ? 'On' : 'Off'} sub={passwordOn ? 'emergency login open' : 'Twitch sign-in only'} tone={passwordOn ? 'amber' : 'green'} href={ENV_TAB} />
      <Tile icon="info" label="Build" value={`v${build.version}`} sub={`${build.commit}${build.env !== 'production' ? ` · ${build.env}` : ''}`} href="/admin/settings?tab=about" />
    </div>
  );
}
