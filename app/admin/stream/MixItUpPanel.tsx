import { PendingButton } from '@/app/components/PendingButton';
import { Panel, fieldClass, selectClass } from '../components/ui';
import type { MixItUpSettings } from '@/lib/mixitup-core';
import type { BridgeState } from '@/lib/bridge';
import type { StatusCard } from '@/lib/mixitup-page';
import { saveConnectionAction } from './mixitup-actions';
import { ConnectionSwitch } from './ConnectionSwitch';
import { PaidPullSetup } from './PaidPullSetup';
import { BrieBucksSafetyPanel } from './SafetyPanels';
import { Card } from './StatusCards';

const help = 'text-[11px] text-gray-500 leading-relaxed';

/** Connections → Mix It Up: the "Mix It Up to the site" status (and the direct addresses' status when they are in use), the currency, the Brie Bucks safety switches, and "Advanced: connect without TCG Bridge" (collapsed unless it is in use). */
export function MixItUpPanel({ settings: s, bridge, statuses }: { settings: MixItUpSettings; bridge: BridgeState; statuses: StatusCard[] }) {
  const direct = s.connection === 'addresses';
  return (
    <div className="space-y-6">
      {statuses.map(c => <Card key={c.id} card={c} />)}

      <form action={saveConnectionAction}>
        <input type="hidden" name="connection" value="bridge" />
        <Panel title="Currency" icon="coins" hint="The Mix It Up currency viewers pay with. The list comes from TCG Bridge, so it appears once the app has connected. Balances, payments and chat viewers all go through the app.">
          {direct ? <p className="text-sm text-amber-300">The site is using direct addresses (Advanced, below), so the currency is the name saved there. Saving this switches back to TCG Bridge.</p> : null}
          {bridge.currencies.length > 0 ? (
            <fieldset className="fieldset sm:max-w-sm">
              <legend className="fieldset-legend"><label htmlFor="mx-currency-id">Currency</label></legend>
              <select id="mx-currency-id" name="currencyId" defaultValue={s.currencyId} className={`${selectClass} w-full`}>
                <option value="">Choose a currency</option>
                {s.currencyId && !bridge.currencies.some(c => c.id === s.currencyId) && <option value={s.currencyId}>{s.currency} (saved)</option>}
                {bridge.currencies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </fieldset>
          ) : (
            <>
              <input type="hidden" name="currencyId" value={s.currencyId} />
              <p className="text-sm text-amber-300">Pair TCG Bridge first.</p>
            </>
          )}
          <PendingButton type="submit" className="btn btn-primary btn-sm self-start">Save currency</PendingButton>
        </Panel>
      </form>

      <BrieBucksSafetyPanel chat={s.chat} />

      <details open={direct} className="rounded-2xl border border-gray-800 bg-gray-950/40">
        <summary className="cursor-pointer select-none px-5 py-3 text-sm font-semibold text-gray-200">Advanced: connect without TCG Bridge</summary>
        <div className="px-5 pb-5 pt-1 space-y-6">
          <p className={help}>Direct addresses are for a relay of your own. While TCG Bridge is the connection, they are not used.</p>
          <form action={saveConnectionAction} className="space-y-4">
            {[s.balanceUrl, s.deductUrl, s.addUrl, s.viewersUrl].some(u => u.startsWith('http://')) && (
              <p role="alert" className="text-xs text-amber-300">A saved address uses http. Save it again with https:// to keep it working securely.</p>
            )}
            <ConnectionSwitch
              initial={s.connection}
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
          </form>
          {direct && <PaidPullSetup settings={s} />}
        </div>
      </details>
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
