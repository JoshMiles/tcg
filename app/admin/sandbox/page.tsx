import { PendingButton } from '../components/PendingButton';
import Link from 'next/link';
import { currentSandboxId } from '@/lib/db';
import { listSandboxes, SOURCE_LABELS, type SandboxSource } from '@/lib/sandbox';
import { createSandboxAction, enterSandboxAction, exitSandboxAction } from './actions';

export const dynamic = 'force-dynamic';

const SOURCES: SandboxSource[] = ['config', 'collections', 'empty'];

export default async function SandboxPage() {
  const [sandboxes, activeId] = await Promise.all([listSandboxes(), currentSandboxId()]);
  const active = sandboxes.find(s => s.id === activeId);

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-white">🧪 Sandbox</h1>
        <p className="text-sm text-gray-500 mt-0.5">A private copy of the app to test upgrades, trades and anything risky, without touching production.</p>
      </div>

      <div className={`rounded-2xl border p-5 flex flex-wrap items-center justify-between gap-3 ${active ? 'border-purple-500/40 bg-purple-950/20' : 'border-gray-800 bg-gray-900/60'}`}>
        {active ? (
          <>
            <p className="text-sm text-purple-200">You are in the sandbox <strong>{active.name}</strong>. Everything you do in the admin and on the website (in this browser) uses its data.</p>
            <div className="flex items-center gap-2">
              <Link href={`/admin/sandbox/${active.id}`} className="tcg-btn px-4 py-2 text-sm rounded-xl">Open tools →</Link>
              <form action={exitSandboxAction}><PendingButton className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500">Exit to production</PendingButton></form>
            </div>
          </>
        ) : activeId ? (
          <>
            <p className="text-sm text-amber-200">This browser points at a sandbox that no longer exists, so it is looking at an empty, safe namespace.</p>
            <form action={exitSandboxAction}><PendingButton className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500">Exit to production</PendingButton></form>
          </>
        ) : (
          <p className="text-sm text-gray-300">You are on <strong className="text-white">production</strong>. Create a sandbox below and enter it to experiment safely.</p>
        )}
      </div>

      {/* How it keeps production safe */}
      <details className="tcg-panel rounded-2xl p-5 text-sm text-gray-400 leading-relaxed">
        <summary className="cursor-pointer text-gray-200 font-semibold">How a sandbox keeps production safe</summary>
        <ul className="mt-3 space-y-1.5 list-disc pl-5">
          <li>Its data lives in a separate namespace of the same database: every read and write is prefixed with the sandbox id, so it cannot see or change production records.</li>
          <li>It never posts to Discord, never calls outgoing webhooks, and cannot delete files from the shared image storage.</li>
          <li>Images and sounds are shared with production (uploads you make in a sandbox stay available), so card art works out of the box.</li>
          <li>The Twitch Extension panel always talks to production. Test upgrades and trades on the website instead: use <strong>Log in as</strong> on a sandbox&apos;s page to become a test user.</li>
          <li>To test the OBS overlay against a sandbox, open the sandbox&apos;s overlay link (it adds <code className="text-gray-300">?sandbox=…</code>).</li>
        </ul>
      </details>

      {/* Create */}
      <form action={createSandboxAction} className="tcg-panel rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white">New sandbox</h2>
        <label className="block space-y-1 text-sm text-gray-300">
          Name
          <input name="name" required maxLength={40} placeholder="e.g. Upgrade testing" className="block w-full max-w-sm rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none" />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm text-gray-300 mb-1">Start from</legend>
          {SOURCES.map((s, i) => (
            <label key={s} className="flex items-start gap-3 rounded-lg border border-gray-800 hover:border-gray-600 px-3 py-2.5 cursor-pointer">
              <input type="radio" name="source" value={s} defaultChecked={i === 0} className="mt-1 accent-yellow-400" />
              <span className="text-sm text-gray-300">{SOURCE_LABELS[s]}</span>
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-gray-600">Copying reads production but only ever writes into the new sandbox. Discord and webhook settings are never copied.</p>
        <PendingButton pendingLabel="Creating…" className="tcg-btn px-5 py-2.5 text-sm rounded-xl">Create and enter</PendingButton>
      </form>

      {/* Existing */}
      <section className="space-y-3">
        <h2 className="font-semibold text-white">Your sandboxes <span className="text-gray-600 font-normal">({sandboxes.length})</span></h2>
        {sandboxes.length === 0 && <p className="text-sm text-gray-600">None yet.</p>}
        <ul className="space-y-2">
          {sandboxes.map(s => (
            <li key={s.id} className="tcg-panel rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-white flex items-center gap-2">
                  {s.name}
                  {s.id === activeId && <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-300 bg-purple-500/10 border border-purple-400/30 rounded-full px-2 py-0.5">You are here</span>}
                </p>
                <p className="text-xs text-gray-500">{SOURCE_LABELS[s.source]} · created {new Date(s.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/admin/sandbox/${s.id}`} className="px-3.5 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500">Tools</Link>
                {s.id !== activeId && (
                  <form action={enterSandboxAction.bind(null, s.id)}><PendingButton pendingLabel="Entering…" className="tcg-btn px-3.5 py-2 text-sm rounded-xl">Enter</PendingButton></form>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
