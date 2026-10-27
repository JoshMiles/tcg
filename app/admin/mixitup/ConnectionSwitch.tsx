'use client';
import { useState, type ReactNode } from 'react';
import type { MixItUpConnection } from '@/lib/mixitup-core';

const label = 'block text-xs font-semibold text-gray-300 mb-1';

/**
 * The connection choice on the Paid pulls form. Both field groups stay in the form (hidden, not removed), so a save in one mode
 * keeps the other mode's values.
 */
export function ConnectionSwitch({ initial, bridge, addresses }: { initial: MixItUpConnection; bridge: ReactNode; addresses: ReactNode }) {
  const [mode, setMode] = useState<MixItUpConnection>(initial);
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className={label}>How the site talks to Mix It Up</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-200">
          <label className="flex items-center gap-2">
            <input type="radio" name="connection" value="bridge" checked={mode === 'bridge'} onChange={() => setMode('bridge')} className="radio radio-sm radio-primary" />
            TCG Bridge (the app on the stream PC)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="connection" value="addresses" checked={mode === 'addresses'} onChange={() => setMode('addresses')} className="radio radio-sm radio-primary" />
            Addresses (a relay of your own)
          </label>
        </div>
      </fieldset>
      <div hidden={mode !== 'bridge'}>{bridge}</div>
      <div hidden={mode !== 'addresses'}>{addresses}</div>
    </div>
  );
}
