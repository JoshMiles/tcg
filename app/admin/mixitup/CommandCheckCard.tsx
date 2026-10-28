import { Icon } from '@/app/components/Icon';
import { Panel } from '../components/ui';
import { commandLabel, type CommandCheckRow, type ExpectedKind } from '@/lib/mixitup-command-check-core';

const KIND: Record<ExpectedKind, string> = { pack: 'chat command', chat: 'chat command', deck: 'Stream Deck button', event: 'event command' };

/** Mix It Up → Connection: the commands the site expects, found or missing among the enabled commands TCG Bridge reported (ROADMAP 57.8). Read only: nothing is changed in Mix It Up. */
export function CommandCheckCard({ rows }: { rows: CommandCheckRow[] }) {
  const missing = rows.filter(r => !r.found).length;
  return (
    <Panel title="Mix It Up commands" icon="list" hint="TCG Bridge reports only the commands that are switched on, so a missing command and a switched-off one look the same. Commands are matched by name, so create or switch on the exact name shown. Nothing here changes Mix It Up.">
      <p role="status" className={`text-sm ${missing ? 'text-amber-300' : 'text-green-300'}`}>{missing ? `${missing} missing` : 'Every command the site expects was found.'}</p>
      <ul className="space-y-1.5 text-sm">
        {rows.map(r => (
          <li key={`${r.kind}:${r.name}`} className="flex flex-wrap items-center gap-2">
            <Icon name={r.found ? 'checkCircle' : 'warning'} className={r.found ? 'text-green-400' : 'text-amber-300'} />
            <code>{commandLabel(r)}</code>
            <span className="text-xs text-gray-500">{KIND[r.kind]}</span>
            <span className={`text-xs ${r.found ? 'text-green-300' : 'text-amber-300'}`}>{r.found ? 'found' : 'missing or switched off'}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
