'use client';
import { useState, type ReactNode } from 'react';
import type { MixItUpConnection } from '@/lib/mixitup-core';

/**
 * The direct-address switch inside "Advanced: connect without TCG Bridge" (the Mix It Up connection). The radio chooses between TCG Bridge and the addresses;
 * the address fields stay in the form either way, so a save in one mode keeps the other mode's values.
 */
export function ConnectionSwitch({ initial, addresses }: { initial: MixItUpConnection; addresses: ReactNode }) {
  const [mode, setMode] = useState<MixItUpConnection>(initial);
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
            <input type="radio" name="connection" value="addresses" checked={mode === 'addresses'} onChange={() => setMode('addresses')} className="radio radio-sm radio-primary" />
            Addresses (a relay of your own)
          </label>
        </div>
      </fieldset>
      <p className="text-xs text-gray-500">{mode === 'addresses' ? 'The site calls these addresses.' : 'Not used while the site talks through TCG Bridge. What you type here is kept.'}</p>
      {addresses}
    </div>
  );
}
