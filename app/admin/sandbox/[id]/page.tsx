import { PendingButton } from '../../components/PendingButton';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { currentSandboxId, runInSandbox } from '@/lib/db';
import { getSandbox, SOURCE_LABELS } from '@/lib/sandbox';
import { listCardValues, listSandboxCards, listSandboxUsers } from '@/lib/sandbox-tools';
import { getActiveSeasonWithPacks } from '@/lib/kv';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import { ConfirmButton } from '../../components/ConfirmButton';
import { UpgradePreview } from './UpgradePreview';
import { CopyableUrl } from '../../components/copyable-url';
import {
  addTestUserAction, deleteSandboxAction, enterSandboxAction, exitSandboxAction, grantCopiesAction, loginAsAction,
  resetSandboxAction, resetTestDataAction, seedUsersAction, simulatePullsAction,
} from '../actions';

export const dynamic = 'force-dynamic';

const field = 'block w-full rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white focus:border-yellow-500 focus:outline-none';

export default async function SandboxDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const { msg, err } = await searchParams;
  const sandbox = await getSandbox(id);
  if (!sandbox) notFound();

  const [activeId, users, cards, values, active] = await Promise.all([
    currentSandboxId(),
    listSandboxUsers(id),
    listSandboxCards(id),
    listCardValues(id),
    runInSandbox(id, () => getActiveSeasonWithPacks()),
  ]);
  const here = activeId === id;
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
  const upgradePacks = (active?.packs ?? []).filter(p => p.pack.upgradesEnabled);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href="/admin/sandbox" className="text-sm text-gray-500 hover:text-white">← All sandboxes</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-white">🧪 {sandbox.name}</h1>
            <p className="text-xs text-gray-500 mt-1">{SOURCE_LABELS[sandbox.source]} · created {new Date(sandbox.createdAt).toLocaleString()}</p>
          </div>
          {here ? (
            <form action={exitSandboxAction}><PendingButton className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500">Exit to production</PendingButton></form>
          ) : (
            <form action={enterSandboxAction.bind(null, id)}><PendingButton className="tcg-btn px-4 py-2 text-sm rounded-xl">Enter this sandbox</PendingButton></form>
          )}
        </div>
      </div>

      {msg && <div role="status" className="rounded-lg border border-green-500/30 bg-green-950/30 px-4 py-2.5 text-sm text-green-300">✓ {msg}</div>}
      {err && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-2.5 text-sm text-red-300">{err}</div>}
      {!here && <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-2.5 text-sm text-amber-200">You are not in this sandbox, so the admin pages and website still show production. The tools below work on this sandbox regardless. <strong>Enter</strong> it to see its data everywhere.</div>}
      {!active && <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-2.5 text-sm text-amber-200">This sandbox has no active season, so pulls and grants have nothing to land in. Enter it and activate a season under Seasons.</div>}

      {/* Links */}
      <section className="tcg-panel rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold text-white">Open it</h2>
        <div className="space-y-1.5">
          <p className="text-xs text-gray-500">OBS overlay for this sandbox (add <code className="text-gray-400">&amp;dev</code> for the test panel):</p>
          <CopyableUrl url={`${origin}/overlay.html?sandbox=${id}`} />
        </div>
        <Link href={`/admin/sandbox/${id}/twitch`} className="flex items-center justify-between gap-3 rounded-xl border border-purple-400/40 bg-purple-500/10 hover:bg-purple-500/20 px-4 py-3 transition-colors">
          <span className="text-sm font-bold text-purple-200">📺 Fake Twitch: test the extension panel here</span>
          <span className="text-xs text-purple-300/80">panel, mobile and video views, login, upgrades →</span>
        </Link>
        <div className="flex flex-wrap gap-2 text-sm">
          {[['/', 'Home'], ['/leaderboard', 'Leaderboard'], ['/cards', 'Card dex'], ['/account', 'My stats'], ['/collection', 'Collections']].map(([href, label]) => (
            <a key={href} href={href} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white">{label} ↗</a>
          ))}
        </div>
        <p className="text-xs text-gray-600">The website links show this sandbox only while you are in it (this browser).</p>
      </section>

      {/* Test users */}
      <section className="tcg-panel rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-white">Test users <span className="text-gray-600 font-normal">({users.length})</span></h2>
        {users.length === 0 ? (
          <p className="text-sm text-gray-500">No viewers yet. Add a test user, then give them pulls or specific copies.</p>
        ) : (
          <div className="space-y-2">
            <table className="w-full text-sm">
              <thead><tr className="text-xs uppercase tracking-wider text-gray-500 border-b border-gray-800"><th className="text-left py-2">User</th><th className="text-right py-2">Copies</th><th className="text-right py-2">Unique</th><th className="py-2" /></tr></thead>
              <tbody className="divide-y divide-gray-800/60">
                {users.slice(0, 10).map(u => (
                <tr key={u.username}>
                  <td className="py-2 text-gray-200 font-medium">{u.username}</td>
                  <td className="py-2 text-right tabular-nums text-gray-400">{u.copies}</td>
                  <td className="py-2 text-right tabular-nums text-gray-400">{u.unique}</td>
                  <td className="py-2 text-right">
                    <form action={loginAsAction.bind(null, id, u.username)} className="inline">
                      <PendingButton className="px-3 py-1 text-xs font-semibold rounded-lg border border-gray-700 text-gray-300 hover:border-yellow-500/60 hover:text-yellow-300" title="Log this browser in as this user on the website (sandbox only)">Log in as →</PendingButton>
                    </form>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
            {users.length > 10 && (
              <details>
                <summary className="cursor-pointer text-xs text-gray-400 hover:text-white">Show the other {users.length - 10} users</summary>
                <table className="w-full text-sm mt-2">
                  <tbody className="divide-y divide-gray-800/60">
                    {users.slice(10).map(u => (
                <tr key={u.username}>
                  <td className="py-2 text-gray-200 font-medium">{u.username}</td>
                  <td className="py-2 text-right tabular-nums text-gray-400">{u.copies}</td>
                  <td className="py-2 text-right tabular-nums text-gray-400">{u.unique}</td>
                  <td className="py-2 text-right">
                    <form action={loginAsAction.bind(null, id, u.username)} className="inline">
                      <PendingButton className="px-3 py-1 text-xs font-semibold rounded-lg border border-gray-700 text-gray-300 hover:border-yellow-500/60 hover:text-yellow-300" title="Log this browser in as this user on the website (sandbox only)">Log in as →</PendingButton>
                    </form>
                  </td>
                </tr>
              ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        )}
        <form action={addTestUserAction.bind(null, id)} className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-gray-500 space-y-1">Add a test user
            <input name="username" required maxLength={25} placeholder="alice" className={`${field} w-48`} />
          </label>
          <PendingButton pendingLabel="Adding…" className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500">Add</PendingButton>
        </form>
        <datalist id="sandbox-users">{users.map(u => <option key={u.username} value={u.username} />)}</datalist>
      </section>

      {/* Drive it */}
      <div className="grid gap-6 md:grid-cols-2">
        <form action={simulatePullsAction.bind(null, id)} className="tcg-panel rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold text-white">Simulate pulls</h2>
          <p className="text-xs text-gray-500">Draws cards exactly as the overlay does (pack by weight, card by odds, then the variant roll) and adds them to the user&apos;s collection.</p>
          <label className="block text-xs text-gray-500 space-y-1">User<input name="username" list="sandbox-users" required className={field} placeholder="alice" /></label>
          <label className="block text-xs text-gray-500 space-y-1">Number of pulls<input name="count" type="number" min={1} max={500} defaultValue={25} className={field} /></label>
          <PendingButton pendingLabel="Pulling…" className="tcg-btn px-4 py-2 text-sm rounded-xl">Pull</PendingButton>
        </form>

        <form action={grantCopiesAction.bind(null, id)} className="tcg-panel rounded-2xl p-5 space-y-3">
          <h2 className="font-semibold text-white">Give specific copies</h2>
          <p className="text-xs text-gray-500">The quickest way to set up a scenario, e.g. exactly enough Regulars to test an upgrade.</p>
          {upgradePacks.length > 0 && (
            <p className="text-xs text-gray-500">
              Upgrade costs: {upgradePacks.map(p => `${p.pack.name}: ${p.pack.upgradeCosts.reverse} / ${p.pack.upgradeCosts.full} / ${p.pack.upgradeCosts.shiny} (Reverse / Full / Shiny)`).join(' · ')}
            </p>
          )}
          <label className="block text-xs text-gray-500 space-y-1">User<input name="username" list="sandbox-users" required className={field} placeholder="alice" /></label>
          <label className="block text-xs text-gray-500 space-y-1">Card
            <select name="cardNumber" required className={field}>
              {cards.map(c => <option key={c.number} value={c.number}>#{c.number} {c.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-gray-500 space-y-1">Variant
              <select name="variant" className={field}>{VARIANTS.map(v => <option key={v} value={v}>{VARIANT_LABELS[v]}</option>)}</select>
            </label>
            <label className="block text-xs text-gray-500 space-y-1">Copies<input name="count" type="number" min={1} max={200} defaultValue={5} className={field} /></label>
          </div>
          <PendingButton className="tcg-btn px-4 py-2 text-sm rounded-xl" disabled={cards.length === 0}>Give</PendingButton>
        </form>
      </div>

      <UpgradePreview cards={cards} costs={upgradePacks[0]?.pack.upgradeCosts ?? { reverse: 5, full: 3, shiny: 3 }} />

      {/* Seed a whole season's worth of viewers */}
      <form action={seedUsersAction.bind(null, id)} className="tcg-panel rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold text-white">Seed a crowd of test users</h2>
        <p className="text-xs text-gray-500 leading-relaxed">
          Creates many viewers who have each pulled cards the way the overlay would draw them, so the leaderboard, card values and scarcity look like a real season.
          Run it again to add more. The <strong className="text-gray-400">Card values</strong> table below updates, so you can watch how rarity and scarcity set each card&apos;s points.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="block text-xs text-gray-500 space-y-1">Users<input name="count" type="number" min={1} max={300} defaultValue={100} className={field} /></label>
          <label className="block text-xs text-gray-500 space-y-1">Fewest pulls<input name="minPulls" type="number" min={1} max={2000} defaultValue={3} className={field} /></label>
          <label className="block text-xs text-gray-500 space-y-1">Most pulls<input name="maxPulls" type="number" min={1} max={2000} defaultValue={150} className={field} /></label>
          <label className="block text-xs text-gray-500 space-y-1">Spread
            <select name="shape" className={field}>
              <option value="realistic">Realistic: a few heavy collectors, many light ones</option>
              <option value="even">Even: everyone between fewest and most</option>
            </select>
          </label>
        </div>
        <PendingButton pendingLabel="Seeding…" className="tcg-btn px-4 py-2 text-sm rounded-xl">Seed users</PendingButton>
      </form>

      {/* How the points work out, card by card */}
      <details open className="tcg-panel rounded-2xl p-5 space-y-3">
        <summary className="cursor-pointer font-semibold text-white">Card values <span className="text-gray-600 font-normal text-sm">· what each copy is worth right now</span></summary>
        {values.length === 0 ? (
          <p className="text-sm text-gray-500 mt-3">No active season, so there are no cards to value.</p>
        ) : (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-500 leading-relaxed">
              Points per copy = base × <strong className="text-gray-400">rarity</strong> (how unlikely the card is to be pulled) × <strong className="text-gray-400">scarcity</strong> (how few copies of that exact version exist
              compared with the average card) × the variant multiplier. Hover a value for its scarcity factor.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                    <th className="text-left py-2 pr-2">#</th>
                    <th className="text-left py-2 pr-2">Card</th>
                    <th className="text-right py-2 px-2">Pull odds</th>
                    <th className="text-right py-2 px-2" title="Copies out there: Regular / Reverse / Full / Shiny">Copies R·RH·FA·✨</th>
                    {VARIANTS.map(v => <th key={v} className="text-right py-2 px-2">{v === 'regular' ? 'Regular' : v === 'reverse' ? 'Reverse' : v === 'full' ? 'Full Art' : '✨ Shiny'} pts</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {values.map(c => (
                    <tr key={c.number} className="hover:bg-white/[0.02]">
                      <td className="py-1.5 pr-2 text-gray-600 tabular-nums">{c.number}</td>
                      <td className="py-1.5 pr-2 text-gray-200">{c.name} <span className="text-yellow-500/80">{'★'.repeat(c.stars)}</span></td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-400">{c.pullRate > 0 ? `${(c.pullRate * 100).toFixed(c.pullRate < 0.01 ? 2 : 1)}%` : '—'}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">{c.copies.regular}·{c.copies.reverse}·{c.copies.full}·{c.copies.shiny}</td>
                      {VARIANTS.map(v => (
                        <td
                          key={v}
                          className={`py-1.5 px-2 text-right tabular-nums font-semibold ${v !== 'regular' && !c.upgrades ? 'text-gray-700' : 'text-yellow-300'}`}
                          title={`Scarcity ×${c.scarcity[v].toFixed(2)}`}
                        >
                          {c.values[v].toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </details>

      {/* Reset */}
      <section className="rounded-2xl border border-red-500/20 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-red-300">Reset and delete</h2>
        <div className="flex flex-wrap gap-2">
          <form action={resetTestDataAction.bind(null, id)}>
            <ConfirmButton title="Remove all viewer data?" confirmLabel="Remove viewer data" message={<>Removes every test user and collection from <strong className="text-white">{sandbox.name}</strong>, keeping its seasons, packs and settings. Production is not touched.</>} className="px-3.5 py-2 text-sm font-semibold text-gray-200 border border-gray-700 hover:border-gray-500 rounded-xl">Clear test data</ConfirmButton>
          </form>
          <form action={resetSandboxAction.bind(null, id)}>
            <ConfirmButton title="Reset this sandbox?" confirmLabel="Reset sandbox" message={<>Wipes <strong className="text-white">{sandbox.name}</strong> and copies production&apos;s current setup in again. Everything you changed here is lost. Production is not touched.</>} className="px-3.5 py-2 text-sm font-semibold text-gray-200 border border-gray-700 hover:border-gray-500 rounded-xl">Reset to a fresh copy</ConfirmButton>
          </form>
          <form action={deleteSandboxAction.bind(null, id)}>
            <ConfirmButton title="Delete this sandbox?" confirmLabel="Delete sandbox" message={<>Permanently deletes <strong className="text-white">{sandbox.name}</strong> and all its data. Production is not touched.</>} className="px-3.5 py-2 text-sm font-bold text-red-400 hover:text-red-200 border border-red-500/30 hover:bg-red-950/40 rounded-xl">Delete sandbox</ConfirmButton>
          </form>
        </div>
      </section>
    </div>
  );
}
