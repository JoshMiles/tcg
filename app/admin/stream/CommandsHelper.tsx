'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { presetHref } from '@/lib/mixitup-presets';
import type { HelperGroup } from '@/lib/viewers-helper';

const secondary = 'rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:border-gray-500 inline-flex items-center gap-1.5';

/** A value with a Copy button. `shown` false masks it (the secret). */
function Value({ label, value, mask }: { label: string; value: string; mask?: boolean }) {
  const [show, setShow] = useState(!mask);
  const [copied, setCopied] = useState(false);
  const copy = () => { try { void navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };
  return (
    <div>
      <p className="block text-xs font-semibold text-gray-300 mb-1">{label}</p>
      <div className="flex gap-2">
        <code className="flex-1 min-w-0 break-all rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-xs">{show ? value || 'Not made yet' : '•'.repeat(24)}</code>
        {mask && <button type="button" onClick={() => setShow(s => !s)} aria-pressed={show} className={`${secondary} self-start`}>{show ? 'Hide' : 'Show'}</button>}
        <button type="button" onClick={copy} disabled={!value} className={`${secondary} self-start`}><Icon name="copy" />{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  );
}

/**
 * The one "Mix It Up commands" helper (ROADMAP 63.3): the webhook address and secret once, then a download for every command the cards need. A downloaded file
 * has the secret and the full address of its own webhook in it, so there is nothing to paste. It replaces the Copy setup cards of Commands, Stream Deck and Events.
 */
export function CommandsHelper({ address, secret, groups }: { address: string; secret: string; groups: HelperGroup[] }) {
  const [open, setOpen] = useState(false);
  const total = groups.reduce((n, g) => n + g.presets.length, 0);
  return (
    <section className="card rounded-2xl overflow-hidden" aria-labelledby="miu-helper-h">
      <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="miu-helper-h" className="font-semibold text-white flex items-center gap-2"><Icon name="link" className="text-yellow-400" />Mix It Up commands</h2>
          <p className="text-xs text-gray-500 mt-0.5">{total} ready-made commands to import into Mix It Up, all from here. Open this once when you set up.</p>
        </div>
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="miu-helper" className={secondary}>{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && (
        <div id="miu-helper" className="px-6 pb-5 pt-1 space-y-5 border-t border-gray-800">
          <div className="space-y-3 pt-4">
            <Value label="Webhook address" value={address} />
            <Value label="Secret" value={secret} mask />
            <p className="text-xs text-gray-500">Each download below already holds the secret and its own address, so you only need these two to build a command by hand. Do not share them. If the secret leaks, <Link href="/admin/settings?tab=webhooks" className="link">make a new one in Settings</Link> and download the commands again.</p>
            <p className="text-xs text-gray-500">Import a file in Mix It Up with its command list&rsquo;s Import. The Web Request action posts JSON; the Chat Message says the answer&rsquo;s <code>message</code> field (<code>$reply</code>).</p>
          </div>
          {groups.map(g => (
            <div key={g.id}>
              <h3 className="text-sm font-semibold text-white mb-2">{g.label}</h3>
              {g.presets.length === 0 ? <p className="text-xs text-gray-500">None yet.</p> : (
                <ul className="divide-y divide-gray-800/70 rounded-xl border border-gray-800">
                  {g.presets.map(p => (
                    <li key={p.title} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white">{p.title}</p>
                        <p className="text-[11px] text-gray-500">{p.note}</p>
                      </div>
                      <a href={presetHref(p.spec)} download className={secondary}><Icon name="download" />Download<span className="sr-only"> {p.title} for Mix It Up</span></a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
