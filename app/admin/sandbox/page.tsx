import { Icon } from '@/app/components/Icon';
import { PendingButton } from '../components/PendingButton';
import Link from 'next/link';
import { currentSandboxId } from '@/lib/db';
import { countKeys, listSandboxes, MAX_SANDBOXES, SOURCE_LABELS, sweepExpiredSandboxes, type SandboxSource } from '@/lib/sandbox';
import { getSandboxStats } from '@/lib/sandbox-tools';
import { createSandboxAction, enterSandboxAction, exitSandboxAction } from './actions';
import { Tile } from '../components/ui';

export const metadata = { title: 'Sandbox · Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

const SOURCES: SandboxSource[] = ['config', 'collections', 'empty'];
const DAY = 86_400_000;

function ago(at: number | undefined, now: number): string {
  if (!at) return 'never';
  const m = Math.floor((now - at) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

export default async function SandboxPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  const swept = await sweepExpiredSandboxes(); // there is no background job: expired sandboxes go the next time anyone looks
  const [sandboxes, activeId] = await Promise.all([listSandboxes(), currentSandboxId()]);
  const active = sandboxes.find(s => s.id === activeId);
  const details = await Promise.all(sandboxes.map(async s => ({ s, stats: await getSandboxStats(s.id).catch(() => null), keys: await countKeys(s.id).catch(() => 0) })));
  const now = Date.now();
  const totalUsers = details.reduce((n, d) => n + (d.stats?.users ?? 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white"><Icon name="flask" className="mr-2 text-purple-300" />Sandbox</h1>
        <p className="text-sm text-gray-500 mt-0.5">A private copy of the app to test upgrades, trades and anything risky, without touching production.</p>
      </div>

      {sp.err && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-2.5 text-sm text-red-300">{sp.err}</div>}
      {swept.length > 0 && <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-2.5 text-sm text-amber-200"><Icon name="hourglass" className="mr-1.5" />Deleted {swept.length === 1 ? 'an expired sandbox' : `${swept.length} expired sandboxes`}: {swept.join(', ')}.</div>}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Tile label="Sandboxes" value={`${sandboxes.length} / ${MAX_SANDBOXES}`} sub="each is a full copy of the data" />
        <Tile label="Test viewers" value={totalUsers.toLocaleString()} sub="across all sandboxes" />
        <Tile label="You are on" value={active ? active.name : activeId ? 'Missing sandbox' : 'Production'} sub={active || activeId ? 'in this browser' : 'real data: be careful'} />
        <Tile label="Expiring" value={sandboxes.filter(s => s.expiresAt).length} sub="delete themselves on a date" />
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

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr] items-start">
        {/* Existing */}
        <section className="space-y-3">
          <h2 className="font-semibold text-white">Your sandboxes <span className="text-gray-600 font-normal">({sandboxes.length})</span></h2>
          {sandboxes.length === 0 && <p className="tcg-panel rounded-xl p-6 text-sm text-gray-500 text-center">None yet. Create one to start testing.</p>}
          <ul className="space-y-3">
            {details.map(({ s, stats, keys }) => {
              const left = s.expiresAt ? s.expiresAt - now : null;
              return (
                <li key={s.id} className={`tcg-panel rounded-2xl p-4 space-y-3 ${s.id === activeId ? 'ring-1 ring-purple-400/40' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-white flex flex-wrap items-center gap-2">
                        {s.name}
                        {s.id === activeId && <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-300 bg-purple-500/10 border border-purple-400/30 rounded-full px-2 py-0.5">You are here</span>}
                        {left !== null && <span className={`text-[10px] font-extrabold uppercase tracking-wider rounded-full px-2 py-0.5 border ${left < 2 * DAY ? 'text-amber-300 bg-amber-500/10 border-amber-400/30' : 'text-gray-400 bg-gray-800/60 border-gray-700'}`}><Icon name="hourglass" className="mr-1 w-3 h-3" />{left < DAY ? 'expires today' : `expires in ${Math.ceil(left / DAY)}d`}</span>}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{SOURCE_LABELS[s.source]}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/sandbox/${s.id}`} className="px-3.5 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500">Tools</Link>
                      {s.id !== activeId && <form action={enterSandboxAction.bind(null, s.id)}><PendingButton pendingLabel="Entering…" className="tcg-btn px-3.5 py-2 text-sm rounded-xl">Enter</PendingButton></form>}
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs">
                    <div><dt className="text-gray-600 uppercase tracking-wider font-bold text-[10px]">Viewers</dt><dd className="text-gray-200 tabular-nums">{stats ? stats.users.toLocaleString() : '—'}</dd></div>
                    <div><dt className="text-gray-600 uppercase tracking-wider font-bold text-[10px]">Copies</dt><dd className="text-gray-200 tabular-nums">{stats ? stats.copies.toLocaleString() : '—'}</dd></div>
                    <div><dt className="text-gray-600 uppercase tracking-wider font-bold text-[10px]">Active season</dt><dd className="text-gray-200 truncate">{stats?.activeSeason ?? 'none'}</dd></div>
                    <div><dt className="text-gray-600 uppercase tracking-wider font-bold text-[10px]">Last used</dt><dd className="text-gray-200">{ago(s.lastUsedAt ?? s.createdAt, now)}</dd></div>
                  </dl>
                  <p className="text-[11px] text-gray-600">Created {new Date(s.createdAt).toLocaleDateString()} · {keys.toLocaleString()} records</p>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Create */}
        <form action={createSandboxAction} className="tcg-panel rounded-2xl p-5 space-y-4 xl:sticky xl:top-4">
          <h2 className="font-semibold text-white">New sandbox</h2>
          <label className="block space-y-1 text-sm text-gray-300">
            Name
            <input name="name" required maxLength={40} placeholder="e.g. Upgrade testing" className="block w-full rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none" />
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
          <label className="block space-y-1 text-sm text-gray-300">
            Delete itself
            <select name="expiresInDays" defaultValue="0" className="block w-full rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none">
              <option value="0">Never (I will delete it)</option>
              <option value="7">After 7 days</option>
              <option value="30">After 30 days</option>
            </select>
          </label>
          <p className="text-xs text-gray-600">Copying reads production but only ever writes into the new sandbox. Discord and webhook settings are never copied.</p>
          <PendingButton pendingLabel="Creating…" className="tcg-btn px-5 py-2.5 text-sm rounded-xl w-full">Create and enter</PendingButton>
        </form>
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
          <li>A purple bar and pill are shown on every page while this browser is in a sandbox. Sandboxes you set to expire delete themselves, and you can have at most {MAX_SANDBOXES}.</li>
        </ul>
      </details>
    </div>
  );
}
