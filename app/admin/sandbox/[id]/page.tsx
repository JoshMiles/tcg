import { Icon } from '@/app/components/Icon';
import { PendingButton } from '../../components/PendingButton';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { currentSandboxId, isPreview, runInSandbox } from '@/lib/db';
import { PreviewOff } from '../PreviewOff';
import { getSandbox, readProduction, readSandboxKey, SOURCE_LABELS } from '@/lib/sandbox';
import { getSandboxStats, listCardValues, listSandboxCards, listSandboxUserRows } from '@/lib/sandbox-tools';
import { getLog, getUndoLabel } from '@/lib/sandbox-log';
import { SCENARIOS } from '@/lib/sandbox-scenarios';
import { diffSetup, readSetup, summarizeDiff, type DiffArea } from '@/lib/sandbox-diff';
import { getActiveSeasonWithPacks } from '@/lib/kv';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import { ConfirmButton } from '../../components/ConfirmButton';
import { PageTabs, pickTab } from '../../components/PageTabs';
import { UpgradePreview } from './UpgradePreview';
import { SandboxUsers } from './SandboxUsers';
import { CopyableUrl } from '../../components/copyable-url';
import {
  addTestUserAction, applyScenarioAction, deleteSandboxAction, enterSandboxAction, exitSandboxAction, grantCopiesAction, loginAsFormAction,
  removeUsersAction, resetSandboxAction, resetTestDataAction, seedUsersAction, setExpiryAction, simulatePullsAction, undoLastAction,
} from '../actions';
import { Tile, fieldClass } from '../../components/ui';

export const metadata = { title: 'Sandbox · Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

const field = fieldClass;
const DAY = 86_400_000;

function ago(at: number, now: number): string {
  const m = Math.floor((now - at) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

export default async function SandboxDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string; tab?: string; user?: string }> }) {
  if (isPreview()) return <PreviewOff />;
  const { id } = await params;
  const { msg, err, tab: tabParam, user: userParam } = await searchParams;
  const sandbox = await getSandbox(id);
  if (!sandbox) notFound();

  const tabs = [
    { id: 'overview', label: 'Overview', icon: 'monitor' },
    { id: 'users', label: 'Users', icon: 'users' },
    { id: 'drive', label: 'Simulate', icon: 'zap' },
    { id: 'values', label: 'Card values', icon: 'coins' },
    { id: 'compare', label: 'Compare', icon: 'filter' },
    { id: 'log', label: 'Activity', icon: 'history' },
    { id: 'reset', label: 'Settings & reset', icon: 'settings' },
  ] as const;
  const tab = pickTab(tabs, tabParam);

  // Only load what the open tab needs; every tab needs the active season and the headline numbers.
  const [activeId, stats, active] = await Promise.all([currentSandboxId(), getSandboxStats(id), runInSandbox(id, () => getActiveSeasonWithPacks())]);
  const [rows, cards, values, entries, undo, diff] = await Promise.all([
    tab === 'users' ? listSandboxUserRows(id) : null,
    tab === 'drive' ? listSandboxCards(id) : [],
    tab === 'values' ? listCardValues(id) : null,
    tab === 'log' ? getLog(id) : null,
    tab === 'log' ? getUndoLabel(id) : null,
    tab === 'compare' ? Promise.all([readSetup(readProduction), readSetup(k => readSandboxKey(id, k))]).then(([p, b]) => diffSetup(p, b)) : null,
  ]);
  const here = activeId === id;
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
  const upgradePacks = (active?.packs ?? []).filter(p => p.pack.upgradesEnabled);
  const now = Date.now();
  const left = sandbox.expiresAt ? sandbox.expiresAt - now : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/admin/sandbox" className="text-sm text-gray-500 hover:text-white">← All sandboxes</Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-white"><Icon name="flask" className="mr-2 text-purple-300" />{sandbox.name}</h1>
            <p className="text-xs text-gray-500 mt-1">{SOURCE_LABELS[sandbox.source]} · created {new Date(sandbox.createdAt).toLocaleString()}{left !== null && <> · <span className={left < 2 * DAY ? 'text-amber-300' : ''}>deletes itself in {left < DAY ? 'under a day' : `${Math.ceil(left / DAY)} days`}</span></>}</p>
          </div>
          {here ? (
            <form action={exitSandboxAction}><PendingButton className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500">Exit to production</PendingButton></form>
          ) : (
            <form action={enterSandboxAction.bind(null, id)}><PendingButton className="tcg-btn px-4 py-2 text-sm rounded-xl">Enter this sandbox</PendingButton></form>
          )}
        </div>
      </div>

      {msg && <div role="status" className="rounded-lg border border-green-500/30 bg-green-950/30 px-4 py-2.5 text-sm text-green-300"><Icon name="check" className="mr-1" />{msg}</div>}
      {err && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-2.5 text-sm text-red-300">{err}</div>}
      {!here && <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-2.5 text-sm text-amber-200">You are not in this sandbox, so the admin pages and website still show production. The tools below work on this sandbox regardless. <strong>Enter</strong> it to see its data everywhere.</div>}
      {!active && <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 px-4 py-2.5 text-sm text-amber-200">This sandbox has no active season, so pulls and grants have nothing to land in. Enter it and activate a season under Seasons.</div>}

      <PageTabs tabs={tabs} active={tab} base={`/admin/sandbox/${id}`} label="Sandbox sections" />

      {/* ── Overview ── */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <Tile label="Viewers" value={stats.users.toLocaleString()} />
            <Tile label="Prints" value={stats.copies.toLocaleString()} sub={`${stats.unique} different cards`} />
            <Tile label="Active season" value={stats.activeSeason ?? 'None'} sub={`${stats.seasons} season${stats.seasons === 1 ? '' : 's'}, ${stats.packs} pack${stats.packs === 1 ? '' : 's'}`} />
            <Tile label="Open trades" value={stats.openTrades} />
            <Tile label="Last used" value={sandbox.lastUsedAt ? ago(sandbox.lastUsedAt, now) : 'never'} />
            <Tile label="Upgrades" value={upgradePacks.length > 0 ? 'On' : 'Off'} sub={upgradePacks.length > 0 ? `${upgradePacks.length} pack${upgradePacks.length === 1 ? '' : 's'}` : 'no pack has them'} />
          </div>
          <section className="tcg-panel rounded-2xl p-5 space-y-3">
            <h2 className="font-semibold text-white">Open it</h2>
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500">OBS overlay for this sandbox (add <code className="text-gray-400">&amp;dev</code> for the test panel):</p>
              <CopyableUrl url={`${origin}/overlay.html?sandbox=${id}`} />
            </div>
            <Link href={`/admin/sandbox/${id}/twitch`} className="flex items-center justify-between gap-3 rounded-xl border border-purple-400/40 bg-purple-500/10 hover:bg-purple-500/20 px-4 py-3 transition-colors">
              <span className="text-sm font-bold text-purple-200"><Icon name="tv" className="mr-2" />Fake Twitch: test the extension panel here</span>
              <span className="text-xs text-purple-300/80">panel, mobile and video views, login, upgrades →</span>
            </Link>
            <div className="flex flex-wrap gap-2 text-sm">
              {[['/', 'Home'], ['/leaderboard', 'Leaderboard'], ['/cards', 'Card dex'], ['/account', 'My stats'], ['/trade', 'Trading'], ['/collection', 'Collections']].map(([href, label]) => (
                <a key={href} href={href} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white">{label} ↗</a>
              ))}
            </div>
            <p className="text-xs text-gray-600">The website links show this sandbox only while you are in it (this browser).</p>
          </section>
        </div>
      )}

      {/* ── Users ── */}
      {tab === 'users' && rows && (
        <div className="space-y-4">
          <SandboxUsers id={id} rows={rows} loginAs={loginAsFormAction.bind(null, id)} clear={removeUsersAction.bind(null, id, 'clear')} remove={removeUsersAction.bind(null, id, 'delete')} />
          <form action={addTestUserAction.bind(null, id)} className="tcg-panel rounded-2xl p-4 flex flex-wrap items-end gap-2">
            <label className="text-xs text-gray-500 space-y-1">Add a test user
              <input name="username" required maxLength={25} placeholder="alice" className={`${field} w-48`} />
            </label>
            <PendingButton pendingLabel="Adding…" className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500">Add</PendingButton>
          </form>
        </div>
      )}

      {/* ── Simulate ── */}
      {tab === 'drive' && (
        <div className="space-y-6">
          <section className="space-y-3">
            <div><h2 className="font-semibold text-white">Scenarios</h2><p className="text-xs text-gray-500 mt-0.5">One click sets up a situation to test. They add to what is already there, name the viewers they use, and can be undone from the Activity tab.</p></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SCENARIOS.map(s => {
                const blocked = !active ? 'No active season' : s.needsUpgrades && upgradePacks.length === 0 ? 'Needs upgrades switched on in a pack' : null;
                return (
                  <form key={s.id} action={applyScenarioAction.bind(null, id, s.id)} className="tcg-panel rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <span className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-400/25 text-purple-200 flex items-center justify-center shrink-0"><Icon name={s.icon} /></span>
                      <div className="min-w-0"><h3 className="font-semibold text-white leading-tight">{s.title}</h3><p className="text-xs text-gray-500 mt-1 leading-relaxed">{s.description}</p></div>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-2">
                      {blocked ? <span className="text-xs text-amber-300">{blocked}</span> : <span />}
                      <PendingButton pendingLabel="Setting up…" disabled={!!blocked} className="px-3.5 py-1.5 text-sm font-bold rounded-lg border border-purple-400/40 text-purple-100 hover:bg-purple-500/15 disabled:opacity-40 disabled:pointer-events-none">Set up</PendingButton>
                    </div>
                  </form>
                );
              })}
            </div>
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <form action={simulatePullsAction.bind(null, id)} className="tcg-panel rounded-2xl p-5 space-y-3">
              <h2 className="font-semibold text-white">Simulate pulls</h2>
              <p className="text-xs text-gray-500">Draws cards exactly as the overlay does (pack by weight, card by odds, then the variant roll) and adds them to the user&apos;s collection.</p>
              <label className="block text-xs text-gray-500 space-y-1">User<input name="username" list="sandbox-users" required defaultValue={userParam} className={field} placeholder="alice" /></label>
              <label className="block text-xs text-gray-500 space-y-1">Number of pulls<input name="count" type="number" min={1} max={500} defaultValue={25} className={field} /></label>
              <PendingButton pendingLabel="Pulling…" className="tcg-btn px-4 py-2 text-sm rounded-xl">Pull</PendingButton>
            </form>

            <form action={grantCopiesAction.bind(null, id)} className="tcg-panel rounded-2xl p-5 space-y-3">
              <h2 className="font-semibold text-white">Give specific prints</h2>
              <p className="text-xs text-gray-500">The quickest way to set up a one-off scenario, e.g. exactly enough Regulars to test an upgrade.</p>
              {upgradePacks.length > 0 && (
                <p className="text-xs text-gray-500">Upgrade costs: {upgradePacks.map(p => `${p.pack.name}: ${p.pack.upgradeCosts.reverse} / ${p.pack.upgradeCosts.full} / ${p.pack.upgradeCosts.shiny} (Reverse / Full / Shiny)`).join(' · ')}</p>
              )}
              <label className="block text-xs text-gray-500 space-y-1">User<input name="username" list="sandbox-users" required defaultValue={userParam} className={field} placeholder="alice" /></label>
              <label className="block text-xs text-gray-500 space-y-1">Card
                <select name="cardNumber" required className={field}>{cards.map(c => <option key={c.number} value={c.number}>#{c.number} {c.name}</option>)}</select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-gray-500 space-y-1">Variant
                  <select name="variant" className={field}>{VARIANTS.map(v => <option key={v} value={v}>{VARIANT_LABELS[v]}</option>)}</select>
                </label>
                <label className="block text-xs text-gray-500 space-y-1">Prints<input name="count" type="number" min={1} max={200} defaultValue={5} className={field} /></label>
              </div>
              <PendingButton className="tcg-btn px-4 py-2 text-sm rounded-xl" disabled={cards.length === 0}>Give</PendingButton>
            </form>
          </div>
          <datalist id="sandbox-users">{(rows ?? []).map(u => <option key={u.username} value={u.username} />)}</datalist>

          <UpgradePreview cards={cards} costs={upgradePacks[0]?.pack.upgradeCosts ?? { reverse: 5, full: 3, shiny: 3 }} />

          <form action={seedUsersAction.bind(null, id)} className="tcg-panel rounded-2xl p-5 space-y-3">
            <h2 className="font-semibold text-white">Seed a custom crowd</h2>
            <p className="text-xs text-gray-500 leading-relaxed">Creates many viewers who have each pulled cards the way the overlay would draw them, so the leaderboard, card values and scarcity look like a real season. Run it again to add more.</p>
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
        </div>
      )}

      {/* ── Card values ── */}
      {tab === 'values' && values && (
        values.length === 0 ? <p className="tcg-panel rounded-2xl p-8 text-center text-sm text-gray-500">No active season, so there are no cards to value.</p> : (
          <section className="tcg-panel rounded-2xl p-5 space-y-3">
            <p className="text-xs text-gray-500 leading-relaxed">
              Points per print = base × <strong className="text-gray-400">rarity</strong> (how unlikely the card is to be pulled) × the variant multiplier. These are the base values: a print with a low edition number (see Settings → Scoring) is worth more.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-gray-500 border-b border-gray-800">
                    <th className="text-left py-2 pr-2">#</th><th className="text-left py-2 pr-2">Card</th>
                    <th className="text-right py-2 px-2">Pull odds</th>
                    <th className="text-right py-2 px-2" title="Prints out there: Regular / Reverse / Full / Shiny">Prints R·RH·FA·SH</th>
                    {VARIANTS.map(v => <th key={v} className="text-right py-2 px-2">{v === 'regular' ? 'Regular' : v === 'reverse' ? 'Reverse' : v === 'full' ? 'Full Art' : 'Shiny'} pts</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {values.map(c => (
                    <tr key={c.number} className="hover:bg-white/2">
                      <td className="py-1.5 pr-2 text-gray-600 tabular-nums">{c.number}</td>
                      <td className="py-1.5 pr-2 text-gray-200">{c.name} <span className="text-yellow-500/80">{'★'.repeat(c.stars)}</span></td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-400">{c.pullRate > 0 ? `${(c.pullRate * 100).toFixed(c.pullRate < 0.01 ? 2 : 1)}%` : '-'}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">{c.copies.regular}·{c.copies.reverse}·{c.copies.full}·{c.copies.shiny}</td>
                      {VARIANTS.map(v => <td key={v} className={`py-1.5 px-2 text-right tabular-nums font-semibold ${v !== 'regular' && !c.upgrades ? 'text-gray-700' : 'text-yellow-300'}`}>{c.values[v].toLocaleString()}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      )}

      {/* ── Compare with production ── */}
      {tab === 'compare' && diff && <CompareTab items={diff} source={sandbox.source} />}

      {/* ── Activity ── */}
      {tab === 'log' && entries && (
        <div className="space-y-4">
          <section className="tcg-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
            {undo ? (
              <>
                <div><h2 className="font-semibold text-white">Undo the last change</h2><p className="text-sm text-gray-400 mt-0.5">Puts viewers&apos; cards back as they were before: <strong className="text-gray-200">{undo.label}</strong> ({ago(undo.at, now)}).</p></div>
                <form action={undoLastAction.bind(null, id)}>
                  <ConfirmButton title="Undo this change?" confirmLabel="Undo" message={<>Restore every viewer&apos;s cards to how they were before <strong className="text-white">{undo.label}</strong>? Anything done to viewers since is lost. It is refused if trades have happened since.</>} className="px-4 py-2 text-sm font-bold rounded-xl border border-purple-400/40 text-purple-100 hover:bg-purple-500/15">
                    <Icon name="undo" className="mr-1.5" />Undo
                  </ConfirmButton>
                </form>
              </>
            ) : <p className="text-sm text-gray-500">Nothing to undo yet. Changes to viewers&apos; cards (pulls, grants, scenarios, clearing) can be undone one step at a time.</p>}
          </section>
          <section className="tcg-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-800"><h2 className="font-semibold text-white">What happened here</h2><p className="text-xs text-gray-500 mt-0.5">The newest {entries.length === 0 ? 'actions' : `${entries.length} actions`} taken in this sandbox from the admin.</p></div>
            {entries.length === 0 ? <p className="px-5 py-10 text-center text-sm text-gray-600">Nothing yet.</p> : (
              <ul className="divide-y divide-gray-800/60">
                {entries.map((e, i) => (
                  <li key={i} className="px-5 py-2.5 flex flex-wrap items-baseline gap-x-3 text-sm">
                    <span className="text-gray-200 font-medium">{e.label}</span>
                    {e.detail && <span className="text-xs text-gray-500 truncate">{e.detail}</span>}
                    {e.undoable && <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300/80">undoable</span>}
                    <span className="ml-auto text-xs text-gray-600 shrink-0" title={new Date(e.at).toLocaleString()}>{ago(e.at, now)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* ── Settings & reset ── */}
      {tab === 'reset' && (
        <div className="space-y-6">
          <form action={setExpiryAction.bind(null, id)} className="tcg-panel rounded-2xl p-5 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[16rem]"><h2 className="font-semibold text-white">Automatic deletion</h2><p className="text-xs text-gray-500 mt-0.5">{left !== null ? `This sandbox deletes itself in ${left < DAY ? 'under a day' : `${Math.ceil(left / DAY)} days`}. Change or switch it off here.` : 'Old sandboxes clutter the database. Let this one delete itself after a while.'}</p></div>
            <select name="days" defaultValue="0" className={`${field} w-48`}><option value="0">Never</option><option value="7">In 7 days</option><option value="30">In 30 days</option></select>
            <PendingButton className="px-4 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-200 hover:border-gray-500">Save</PendingButton>
          </form>
          <section className="rounded-2xl border border-red-500/20 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-red-300">Reset and delete</h2>
            <div className="flex flex-wrap gap-2">
              <form action={resetTestDataAction.bind(null, id)}>
                <ConfirmButton title="Remove all viewer data?" confirmLabel="Remove viewer data" message={<>Removes every test user and collection from <strong className="text-white">{sandbox.name}</strong>, keeping its seasons, packs and settings. Production is not touched. You can undo it from the Activity tab.</>} className="px-3.5 py-2 text-sm font-semibold text-gray-200 border border-gray-700 hover:border-gray-500 rounded-xl">Clear test data</ConfirmButton>
              </form>
              <form action={resetSandboxAction.bind(null, id)}>
                <ConfirmButton title="Reset this sandbox?" confirmLabel="Reset sandbox" message={<>Wipes <strong className="text-white">{sandbox.name}</strong> and copies production&apos;s current setup in again. Everything you changed here is lost, including the activity log. Production is not touched.</>} className="px-3.5 py-2 text-sm font-semibold text-gray-200 border border-gray-700 hover:border-gray-500 rounded-xl">Reset to a fresh copy</ConfirmButton>
              </form>
              <form action={deleteSandboxAction.bind(null, id)}>
                <ConfirmButton title="Delete this sandbox?" confirmLabel="Delete sandbox" message={<>Permanently deletes <strong className="text-white">{sandbox.name}</strong> and all its data. Production is not touched.</>} className="px-3.5 py-2 text-sm font-bold text-red-400 hover:text-red-200 border border-red-500/30 hover:bg-red-950/40 rounded-xl">Delete sandbox</ConfirmButton>
              </form>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const AREAS: DiffArea[] = ['Season', 'Pack', 'Card', 'Setting'];
const CHANGE_STYLE = { added: 'text-green-300 bg-green-500/10 border-green-400/30', removed: 'text-red-300 bg-red-500/10 border-red-400/30', changed: 'text-amber-300 bg-amber-500/10 border-amber-400/30' };
const SHOWN = 60;

function CompareTab({ items, source }: { items: ReturnType<typeof diffSetup>; source: string }) {
  const sum = summarizeDiff(items);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Tile label="Differences" value={sum.total} sub={sum.total === 0 ? 'identical to production' : 'in setup and settings'} />
        <Tile label="Changed" value={sum.changed} />
        <Tile label="Only in sandbox" value={sum.added} />
        <Tile label="Only in production" value={sum.removed} />
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">Compares seasons, packs, cards and the overlay and scoring settings with production right now. It does not compare viewers. {source === 'empty' ? 'This sandbox started empty, so everything it lacks shows as only in production. ' : 'A sandbox starts as a copy, so differences are what you changed here (or what changed in production since). '}Nothing here writes to production; to start again from production&apos;s current setup, use Reset.</p>
      {items.length === 0 ? (
        <p className="tcg-panel rounded-2xl p-8 text-center text-sm text-gray-500"><Icon name="checkCircle" className="block w-7 h-7 mx-auto mb-2 text-green-400/70" />This sandbox&apos;s setup matches production.</p>
      ) : AREAS.map(area => {
        const list = items.filter(i => i.area === area);
        if (list.length === 0) return null;
        return (
          <section key={area} className="tcg-panel rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2"><h2 className="font-semibold text-white">{area}s</h2><span className="text-xs text-gray-500">{list.length}</span></div>
            <ul className="divide-y divide-gray-800/60">
              {list.slice(0, SHOWN).map(i => (
                <li key={`${i.area}-${i.id}`} className="px-5 py-3 space-y-1.5">
                  <p className="flex items-center gap-2 text-sm text-gray-100"><span className={`text-[10px] font-extrabold uppercase tracking-wider rounded-full px-1.5 py-px border ${CHANGE_STYLE[i.change]}`}>{i.change === 'added' ? 'only here' : i.change === 'removed' ? 'only in production' : 'changed'}</span><span className="truncate">{i.label}</span></p>
                  {i.fields.length > 0 && (
                    <table className="text-xs w-full max-w-3xl"><tbody>
                      {i.fields.map(f => (
                        <tr key={f.field}><td className="pr-3 py-0.5 text-gray-500 whitespace-nowrap align-top">{f.field}</td><td className="pr-3 py-0.5 text-gray-400 font-mono break-all">{f.production}</td><td className="pr-3 py-0.5 text-gray-600 align-top">→</td><td className="py-0.5 text-amber-200 font-mono break-all">{f.sandbox}</td></tr>
                      ))}
                    </tbody></table>
                  )}
                </li>
              ))}
            </ul>
            {list.length > SHOWN && <p className="px-5 py-2.5 text-xs text-gray-500 border-t border-gray-800">Showing the first {SHOWN} of {list.length}.</p>}
          </section>
        );
      })}
    </div>
  );
}
