'use client';

import { paidPullSetup } from '@/lib/mixitup-setup';
import type { MixItUpSettings } from '@/lib/mixitup-core';
import { Icon } from '@/app/components/Icon';

const secondary = 'rounded-lg border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-200 hover:border-gray-500';

/** What this site sends for a paid pull, so the owner can match it in Mix It Up. Uses the saved settings. */
export function PaidPullSetup({ settings }: { settings: MixItUpSettings }) {
  const s = paidPullSetup(settings);
  const copy = (t: string) => { try { void navigator.clipboard.writeText(t); } catch { /* clipboard blocked */ } };
  return (
    <section className="card rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800">
        <h2 className="font-semibold text-white flex items-center gap-2"><Icon name="link" className="text-yellow-400" />Copy setup</h2>
        <p className="text-xs text-gray-500 mt-0.5">The two requests this site sends. The address must answer in the HTTP reply (Mix It Up has no action that does; use TCG Bridge or a small service of your own).</p>
      </div>
      <div className="px-6 py-5 space-y-5 text-sm text-gray-300">
        <div className="space-y-2">
          <h3 className="font-semibold text-white text-sm">Balance</h3>
          <p className="text-xs text-gray-400">POST {s.balanceUrl || 'the balance address, once you save one'}. This action should answer <code>{s.balanceAnswer}</code>.</p>
          <Block text={s.balanceBody} onCopy={() => copy(s.balanceBody)} />
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold text-white text-sm">Deduct</h3>
          <p className="text-xs text-gray-400">
            POST {s.deductUrl || 'the deduct address, once you save one'}. This action takes the {s.currency}.
            {s.sameAddress ? ' It is the same address as balance, told apart by action.' : ''}
          </p>
          <Block text={s.deductBody} onCopy={() => copy(s.deductBody)} />
        </div>
      </div>
    </section>
  );
}

function Block({ text, onCopy }: { text: string; onCopy: () => void }) {
  return (
    <div className="flex gap-2">
      <pre className="flex-1 min-w-0 overflow-auto rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs">{text}</pre>
      <button type="button" onClick={onCopy} className={`${secondary} self-start`}>Copy</button>
    </div>
  );
}
