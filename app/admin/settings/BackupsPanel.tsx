import { backupStatus } from '@/lib/backup';
import { Panel, Chip } from '../components/ui';
import { ConfirmButton } from '../components/ConfirmButton';
import { backupNowAction } from './actions';

const fmtSize = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function ago(at: number, now: number): string {
  const h = Math.floor((now - at) / 3_600_000);
  if (h < 1) return 'less than an hour ago';
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/** Nightly backups: when the newest one was made and how big it is (red when it is more than 36 hours old), plus a Back up now button. */
export async function BackupsPanel() {
  const now = Date.now();
  const s = await backupStatus(now);
  const production = process.env.VERCEL_ENV === 'production';
  return (
    <Panel title="Backups" icon="shield" hint="Every night a copy of all game data (seasons, packs, collections, profiles, editions, trades, settings) is encrypted and stored. The newest 14 are kept. Sandboxes, caches, counters and the activity log are not included.">
      <p className="text-sm text-gray-300 flex flex-wrap items-center gap-2">
        {s.lastAt === null ? <Chip tone="red">No backup</Chip> : s.stale ? <Chip tone="red">Overdue</Chip> : <Chip tone="green">Up to date</Chip>}
        {s.lastAt !== null && <span>Last backup {ago(s.lastAt, now)} ({new Date(s.lastAt).toISOString().replace('T', ' ').slice(0, 16)} UTC), {s.size !== null ? fmtSize(s.size) : 'unknown size'}, {s.count} kept.</span>}
      </p>
      {s.problem && <p role="alert" className="text-sm text-red-300">{s.problem}</p>}
      {production ? (
        <form action={backupNowAction}>
          <ConfirmButton
            title="Back up now?"
            confirmLabel="Back up"
            message={<>Takes a backup of everything right now and stores it as today&apos;s file (replacing the one from earlier today, if any). It reads every key, so it can take a little while.</>}
            className="btn btn-primary px-4 py-2 text-sm rounded-xl"
          >
            Back up now
          </ConfirmButton>
        </form>
      ) : (
        <p className="text-xs text-gray-500">Backups only run on the live site, not on previews or locally.</p>
      )}
      <p className="text-xs text-gray-500 leading-relaxed">
        To restore, download the file{s.url ? <> (<a href={s.url} className="underline decoration-dotted hover:text-gray-300">newest backup</a>)</> : ''} and run <code className="text-gray-400">scripts/restore-backup.mts</code> with your <code className="text-gray-400">BACKUP_ENCRYPTION_KEY</code>. By default it restores into a sandbox so you can look first.
      </p>
    </Panel>
  );
}
