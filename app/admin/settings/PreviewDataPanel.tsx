import { PREVIEW_ID } from '@/lib/db';
import { countKeys } from '@/lib/sandbox';
import { Panel, Chip } from '../components/ui';
import { ConfirmButton } from '../components/ConfirmButton';
import { seedPreviewAction, wipePreviewAction } from './actions';

/**
 * Preview deployments only: this deployment works in the reserved `sbx:preview:*` namespace of the shared database (see
 * lib/db.ts), so it starts empty. Here you copy the live setup in to test against, or wipe it again.
 */
export async function PreviewDataPanel() {
  const keys = await countKeys(PREVIEW_ID).catch(() => 0);
  return (
    <Panel title="Preview data" icon="flask" hint="This preview deployment has its own walled-off data. Nothing you do here reaches the live site, and nothing from the live site shows up until you copy it in.">
      <p className="text-sm text-gray-300">
        {keys === 0 ? <Chip tone="amber">Empty</Chip> : <Chip tone="green">{keys.toLocaleString()} keys</Chip>}{' '}
        {keys === 0 ? 'No seasons or packs yet. Copy the live setup in to get something to test with.' : 'Copying again overwrites the setup keys it covers.'}
      </p>
      <form action={seedPreviewAction} className="space-y-3">
        <label className="flex items-start gap-2 text-sm text-gray-300">
          <input type="checkbox" name="withCollections" className="toggle toggle-sm toggle-primary" />
          <span>Also copy every viewer&apos;s collection <span className="text-gray-500">(for testing trades and the leaderboard on real-looking data)</span></span>
        </label>
        <ConfirmButton
          title="Copy the live setup into this preview?"
          confirmLabel="Copy it"
          message={<>Seasons, packs, cards and the overlay and scoring settings are copied from the live site into this preview&apos;s own data. The live site is only read, never changed. Discord, webhooks and sign-ins are not copied.</>}
          className="tcg-btn px-4 py-2 text-sm rounded-xl"
        >
          Copy setup from production
        </ConfirmButton>
      </form>
      <form action={wipePreviewAction}>
        <ConfirmButton
          title="Wipe all preview data?"
          confirmLabel="Wipe it"
          message={<>Every key in this preview&apos;s own data is deleted (seasons, packs, viewers, settings). The live site is not touched. You can copy the setup in again afterwards.</>}
          className="px-4 py-2 text-sm rounded-xl border border-red-500/40 text-red-300 hover:border-red-400"
        >
          Wipe preview data
        </ConfirmButton>
      </form>
    </Panel>
  );
}
