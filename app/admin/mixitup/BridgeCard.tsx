'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArmedButton } from '@/app/components/ArmedButton';
import { Icon } from '@/app/components/Icon';
import { createPairCodeAction, liftPullBlockAction, revokeBridgeAction, setBridgeStaffAction } from './bridge-actions';

export interface BridgeRow { id: string; name: string; paired: string; seen: string; staff: boolean; by: string }
export interface BlockRow { username: string; by: string; scope: string }

const DOWNLOAD_URL = 'https://github.com/JoshMiles/tcg/releases?q=bridge-v&expanded=true';
const secondary ='rounded-lg border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-200 hover:border-gray-500 disabled:opacity-60';

/** Paid pulls → TCG Bridge: make a pairing code, and see or revoke the paired bridges. A token or its hash is never shown. */
export function BridgeCard({ bridges, version, blocks = [] }: { bridges: BridgeRow[]; version: string; blocks?: BlockRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pair, setPair] = useState<{ code: string; until: string } | null>(null);
  const make = () => start(async () => {
    setPair(await createPairCodeAction());
  });
  return (
    <section className="card rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800">
        <h2 className="font-semibold text-white flex items-center gap-2"><Icon name="link" className="text-yellow-400" />TCG Bridge</h2>
        <p className="text-xs text-gray-500 mt-0.5">The app on the stream PC that talks to Mix It Up for the site. Make a code, type it into the app once, and it stays paired until you revoke it.{version && <> Last version seen: {version}.</>}</p>
      </div>
      <div className="px-6 py-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <a href={DOWNLOAD_URL} target="_blank" rel="noopener noreferrer" className={`${secondary} inline-flex items-center gap-1.5`}><Icon name="download" />Download TCG Bridge</a>
          <button type="button" onClick={make} disabled={pending} className={secondary}>Pair TCG Bridge</button>
          {pair && (
            <p role="status" className="text-sm text-gray-300">
              Code <strong className="font-mono text-lg tracking-widest text-white">{pair.code}</strong>
              <span className="text-xs text-gray-500"> works once, until {pair.until} (10 minutes)</span>
            </p>
          )}
        </div>
        {bridges.length === 0 ? (
          <p className="text-sm text-gray-500">No bridge is paired.</p>
        ) : (
          <ul className="divide-y divide-gray-800 text-sm">
            {bridges.map(b => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-semibold text-white">{b.name}</span>
                  <span className="block text-xs text-gray-500">Paired {b.paired}{b.by && <> by {b.by}</>}. Last seen {b.seen}.</span>
                  <label className="mt-1 flex items-center gap-2 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      className="toggle toggle-xs"
                      checked={b.staff}
                      disabled={pending}
                      onChange={e => start(async () => { await setBridgeStaffAction(b.id, e.target.checked); router.refresh(); })}
                    />
                    Staff tools on this PC
                  </label>
                </div>
                <ArmedButton
                  onConfirm={() => start(async () => { await revokeBridgeAction(b.id); router.refresh(); })}
                  className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs font-semibold text-gray-300 hover:border-red-500/50 hover:text-red-300"
                  armedClassName="rounded-lg border border-red-500/60 bg-red-950/50 px-2.5 py-1 text-xs font-semibold text-red-200"
                >
                  Revoke
                </ArmedButton>
              </li>
            ))}
          </ul>
        )}
        {blocks.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-white">Blocked from pulls</h3>
            <ul className="divide-y divide-gray-800 text-sm">
              {blocks.map(b => (
                <li key={b.username} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-gray-200">{b.username}<span className="block text-xs text-gray-500">{b.scope}, by {b.by}</span></span>
                  <button type="button" disabled={pending} className={secondary} onClick={() => start(async () => { await liftPullBlockAction(b.username); router.refresh(); })}>Lift</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
