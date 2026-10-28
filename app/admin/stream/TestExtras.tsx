import { Icon } from '@/app/components/Icon';
import { PendingButton } from '@/app/components/PendingButton';
import { Panel, fieldClass } from '../components/ui';
import { TEST_VIEWERS_MAX } from '@/lib/mixitup-core';
import { addTestViewerAction, removeTestViewerAction } from './test-pull-actions';

const secondary = 'btn btn-sm btn-outline';

/** Test → Test viewers (moved from Connections in 63.4): who Test pulls may pretend to be. */
export function TestViewers({ viewers }: { viewers: string[] }) {
  return (
    <Panel title="Test viewers" icon="flask" hint={`Who "Simulate a chat pull" above may pretend to be, so a real viewer is never touched. At most ${TEST_VIEWERS_MAX}. A throwaway Twitch account works well.`}>
      {viewers.length === 0 ? <p className="text-xs text-gray-500">None. Add one to use Test pulls.</p> : (
        <ul className="flex flex-wrap gap-2">
          {viewers.map(v => (
            <li key={v}>
              <form action={removeTestViewerAction.bind(null, v)} className="badge badge-lg gap-2 pr-1">
                {v}
                <PendingButton className="btn btn-ghost btn-xs btn-circle" aria-label={`Remove ${v}`}><Icon name="x" /></PendingButton>
              </form>
            </li>
          ))}
        </ul>
      )}
      {viewers.length < TEST_VIEWERS_MAX && (
        <form action={addTestViewerAction} className="flex items-end gap-2">
          <fieldset className="fieldset">
            <legend className="fieldset-legend"><label htmlFor="mx-testviewer">Twitch login</label></legend>
            <input id="mx-testviewer" name="login" placeholder="a_throwaway_account" autoComplete="off" className={fieldClass} />
          </fieldset>
          <PendingButton className={secondary}>Add test viewer</PendingButton>
        </form>
      )}
    </Panel>
  );
}
