'use client';
import { useState, type ReactNode } from 'react';
import type { MixItUpConnection } from '@/lib/mixitup-core';

/**
 * The connection choice on the Connection form. The bridge's currency select shows only in bridge mode; the direct addresses sit under a
 * closed "Advanced" section (open from the start when the saved connection is `addresses`, and opened by choosing it). Both groups stay in
 * the form, so a save in one mode keeps the other mode's values.
 */
export function ConnectionSwitch({ initial, bridge, addresses }: { initial: MixItUpConnection; bridge: ReactNode; addresses: ReactNode }) {
  const [mode, setMode] = useState<MixItUpConnection>(initial);
  const [open, setOpen] = useState(initial === 'addresses');
  return (
    <div className="space-y-4">
      <fieldset className="fieldset">
        <legend className="fieldset-legend">How the site talks to Mix It Up</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-200">
          <label className="flex items-center gap-2">
            <input type="radio" name="connection" value="bridge" checked={mode === 'bridge'} onChange={() => setMode('bridge')} className="radio radio-sm radio-primary" />
            TCG Bridge (the app on the stream PC)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="connection" value="addresses" checked={mode === 'addresses'} onChange={() => { setMode('addresses'); setOpen(true); }} className="radio radio-sm radio-primary" />
            Addresses (a relay of your own)
          </label>
        </div>
      </fieldset>
      <div hidden={mode !== 'bridge'}>{bridge}</div>
      <details open={open} onToggle={e => setOpen(e.currentTarget.open)} className="rounded-xl border border-gray-800 bg-gray-950/40">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-200">Advanced: direct addresses</summary>
        <div className="px-4 pb-4 pt-1 space-y-3">
          <p className="text-xs text-gray-500">{mode === 'addresses' ? 'The site calls these addresses.' : 'Not used while the site talks through TCG Bridge. What you type here is kept.'}</p>
          {addresses}
        </div>
      </details>
    </div>
  );
}
