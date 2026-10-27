import { lastEmergencyLogin } from '@/lib/admin-cookie';
import { securityCard } from '@/lib/security-card';
import { readEnv } from '@/lib/env-health';
import { RECORDED_SECRETS, readSecretsLastUsed } from '@/lib/secret-used';
import { Panel, Chip } from '../components/ui';

/** Which secrets are set and how long they are (never the values), whether the emergency password login is on, and when it was last used, and when each incoming secret last worked (and on which route). */
export async function SecurityPanel() {
  const card = securityCard(readEnv());
  const [last, used] = await Promise.all([lastEmergencyLogin(), readSecretsLastUsed()]);
  return (
    <Panel title="Security" icon="lock" hint="Set or not set, and length only. A value is never shown here or sent to this page.">
      <p className="text-sm text-gray-300 flex flex-wrap items-center gap-2">
        Emergency password login:
        {!card.passwordLoginOn ? <Chip tone="green">Off</Chip> : card.passwordLoginUsable ? <Chip tone="amber">On</Chip> : <Chip tone="gray">On, but not usable (password or cookie secret missing)</Chip>}
      </p>
      <p className="text-sm text-gray-300">
        Last emergency login: {last ? `${new Date(last).toISOString().replace('T', ' ').slice(0, 16)} UTC` : 'none recorded'}
        <span className="text-xs text-gray-500"> (recorded since this card shipped; every login is also in the Discord admin log)</span>
      </p>
      <ul className="divide-y divide-gray-800/60">
        {card.secrets.map(s => (
          <li key={s.name} className="py-2 flex flex-wrap items-center gap-2">
            <code className="text-sm text-gray-100">{s.name}</code>
            {s.set ? (s.short ? <Chip tone="amber">short</Chip> : <Chip tone="green">set</Chip>) : <Chip tone="gray">not set</Chip>}
            {s.set && <span className="text-xs text-gray-400 tabular-nums">{s.length} characters</span>}
            <span className="text-xs text-gray-500 ml-auto">{s.what}</span>
          </li>
        ))}
      </ul>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 pt-2">Incoming secrets, last used</h3>
      <ul className="divide-y divide-gray-800/60">
        {RECORDED_SECRETS.map(s => (
          <li key={s.name} className="py-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-100">{s.label}</span>
            <span className="text-xs text-gray-400 ml-auto">
              {used[s.name] ? <>last used {new Date(used[s.name].at).toISOString().replace('T', ' ').slice(0, 16)} UTC by <code>{used[s.name].route}</code></> : 'never recorded'}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-500">Written at most once a minute per secret, on a successful use only. The value is never stored.</p>
    </Panel>
  );
}
