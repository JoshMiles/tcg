import { Icon } from '@/app/components/Icon';
import { PendingButton } from '@/app/components/PendingButton';
import { Panel, fieldClass, selectClass } from '../components/ui';
import type { MixItUpSettings } from '@/lib/mixitup-core';
import type { BridgeState } from '@/lib/bridge';
import { saveConnectionAction, checkBalanceAction, sendTestAction } from './mixitup-actions';
import { BridgeCard, type BridgeRow } from './BridgeCard';
import { ConnectionSwitch } from './ConnectionSwitch';
import { PaidPullSetup } from './PaidPullSetup';
import { addTestViewerAction, removeTestViewerAction } from './test-pull-actions';
import { TEST_VIEWERS_MAX } from '@/lib/mixitup-core';

const help = 'text-[11px] text-gray-500 leading-relaxed';
const secondary = 'btn btn-sm btn-outline';

/** Mix It Up → Connection: TCG Bridge (download, pairing, paired apps), how the site talks to Mix It Up, the currency, the direct addresses (Advanced) and the Try it buttons. */
export function ConnectionTab({ settings: s, bridge, bridges }: { settings: MixItUpSettings; bridge: BridgeState; bridges: BridgeRow[] }) {
  return (
    <div className="space-y-6">
      <BridgeCard version={bridge.version} bridges={bridges} />

      <form action={saveConnectionAction}>
        <Panel title="Connection to Mix It Up" icon="link" hint="TCG Bridge is the normal way. Direct addresses are for a relay of your own and live under Advanced.">
          {[s.balanceUrl, s.deductUrl, s.addUrl, s.viewersUrl].some(u => u.startsWith('http://')) && (
            <p role="alert" className="text-xs text-amber-300">A saved address uses http. Save it again with https:// to keep it working securely.</p>
          )}
          <ConnectionSwitch
            initial={s.connection}
            bridge={
              <fieldset className="fieldset sm:max-w-sm">
                <legend className="fieldset-legend"><label htmlFor="mx-currency-id">Currency</label></legend>
                {bridge.currencies.length > 0 ? (
                  <select id="mx-currency-id" name="currencyId" defaultValue={s.currencyId} className={`${selectClass} w-full`}>
                    <option value="">Choose a currency</option>
                    {s.currencyId && !bridge.currencies.some(c => c.id === s.currencyId) && <option value={s.currencyId}>{s.currency} (saved)</option>}
                    {bridge.currencies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                ) : (
                  <>
                    <input type="hidden" name="currencyId" value={s.currencyId} />
                    <p className="text-sm text-amber-300">Pair TCG Bridge first.</p>
                  </>
                )}
                <p className={help}>The Mix It Up currency viewers pay with. The list comes from TCG Bridge, so it appears once the app has connected. Balances, payments and chat viewers all go through the app.</p>
              </fieldset>
            }
            addresses={
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="mx-balance" name="balanceUrl" label="Balance address" value={s.balanceUrl} placeholder="https://webhook.mixitupapp.com/...">
                  A Mix It Up webhook command that answers with the viewer&rsquo;s balance. We send <code>{'{ action: "balance", username, currency, secret }'}</code>.
                </Field>
                <Field id="mx-deduct" name="deductUrl" label="Deduct address (optional)" value={s.deductUrl} placeholder="Leave empty to use the balance address">
                  The command that takes the currency. We send <code>{'{ action: "deduct", username, amount, currency, message, pullId, secret }'}</code>. With one address, the command tells them apart by <code>action</code>.
                </Field>
                <Field id="mx-add" name="addUrl" label="Add address (optional)" value={s.addUrl} placeholder="Only needed for the Bonus Brie Bucks buff">
                  The command that gives currency. We send <code>{'{ action: "add", username, amount, currency, secret }'}</code>. Used by the Bonus Brie Bucks buff in the Buff Editor; without it that buff cannot be applied.
                </Field>
                <Field id="mx-viewers" name="viewersUrl" label="Chat viewers address (optional)" value={s.viewersUrl} placeholder="Only needed for community buffs that pay out">
                  A command that answers <code>{'{ "users": ["name", ...] }'}</code> (or a plain list): who is in chat now. We send <code>{'{ action: "viewers", currency, secret }'}</code>. Community score and Brie Bucks buffs go to these viewers.
                </Field>
                <Field id="mx-secret" name="secret" label="Shared secret (optional)" value={s.secret} autoComplete="off">
                  Sent as <code>secret</code> in every request, so the command can check it came from here.
                </Field>
                <Field id="mx-field" name="balanceField" label="Balance field" value={s.balanceField}>
                  The key in the reply that holds the number, for example <code>{'{ "balance": 250 }'}</code>.
                </Field>
                <Field id="mx-currency" name="currency" label="Currency name" value={s.currency} />
              </div>
            }
          />
          <PendingButton type="submit" className="btn btn-primary btn-sm self-start">Save connection</PendingButton>
        </Panel>
      </form>

      {s.connection === 'addresses' && <PaidPullSetup settings={s} />}

      <Panel title="Try it" icon="zap" hint="Uses the saved settings. Neither button takes any currency.">
        <div className="flex flex-wrap items-end gap-4">
          <form action={checkBalanceAction} className="flex items-end gap-2">
            <fieldset className="fieldset">
              <legend className="fieldset-legend"><label htmlFor="mx-who">Viewer</label></legend>
              <input id="mx-who" name="who" placeholder="viewer name" className={fieldClass} />
            </fieldset>
            <PendingButton type="submit" className={secondary}>Check balance</PendingButton>
          </form>
          <form action={sendTestAction}><PendingButton type="submit" className={secondary}>Send test message</PendingButton></form>
        </div>
      </Panel>
      <Panel title="Test viewers" icon="flask" hint={`Who "Simulate a chat pull" on the Overview may pretend to be, so a real viewer is never touched. At most ${TEST_VIEWERS_MAX}. A throwaway Twitch account works well.`}>
        {s.testViewers.length === 0 ? <p className="text-xs text-gray-500">None. Add one to use Test pulls.</p> : (
          <ul className="flex flex-wrap gap-2">
            {s.testViewers.map(v => (
              <li key={v}>
                <form action={removeTestViewerAction.bind(null, v)} className="badge badge-lg gap-2 pr-1">
                  {v}
                  <PendingButton className="btn btn-ghost btn-xs btn-circle" aria-label={`Remove ${v}`}><Icon name="x" /></PendingButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        {s.testViewers.length < TEST_VIEWERS_MAX && (
          <form action={addTestViewerAction} className="flex items-end gap-2">
            <fieldset className="fieldset">
              <legend className="fieldset-legend"><label htmlFor="mx-testviewer">Twitch login</label></legend>
              <input id="mx-testviewer" name="login" placeholder="a_throwaway_account" autoComplete="off" className={fieldClass} />
            </fieldset>
            <PendingButton className={secondary}>Add test viewer</PendingButton>
          </form>
        )}
      </Panel>
    </div>
  );
}

function Field({ id, name, label, value, placeholder, autoComplete, children }: { id: string; name: string; label: string; value: string; placeholder?: string; autoComplete?: string; children?: React.ReactNode }) {
  return (
    <fieldset className="fieldset">
      <legend className="fieldset-legend"><label htmlFor={id}>{label}</label></legend>
      <input id={id} name={name} defaultValue={value} placeholder={placeholder} autoComplete={autoComplete} className={fieldClass} />
      {children && <p className={help}>{children}</p>}
    </fieldset>
  );
}
