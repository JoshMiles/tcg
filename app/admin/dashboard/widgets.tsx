import { Icon } from '@/app/components/Icon';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar } from '@/app/components/Avatar';
import { sizeTwitchAvatar } from '@/lib/avatars';
import { cardThumbUrl } from '@/lib/card-art';
import { getRarity } from '@/lib/rarity';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import { timeAgo } from '@/lib/site-data';
import type { ActivityEvent } from '@/lib/activity';
import type { DashboardData } from '@/lib/dashboard-data';
import type { WidgetType } from '@/lib/dashboard';
import type { IconName } from '@/app/components/Icon';
import { OverlayStatus } from '../components/OverlayStatus';
import { QuickActions } from '../components/QuickActions';
import { NotesWidget } from './NotesWidget';
import { Empty, More, Panel } from './panel';
import { Attention, Changes, Economy, OverlayControlsWidget, Progress, PulseWidget, PullsChart, Viewers } from './widgets-extra';

// ── Widgets ──

function Overview({ d }: { d: DashboardData }) {
  const stats = [
    { label: 'Players', accent: 'from-poke-blue-light to-poke-blue', value: d.totalUsers, sub: 'unique collectors' },
    { label: 'Cards pulled', accent: 'from-yellow-300 to-yellow-600', value: d.totalOwned, sub: 'total across all players' },
    { label: 'Card pool', accent: 'from-red-400 to-poke-red', value: d.allCards.length, sub: `across ${d.packs.length} pack${d.packs.length !== 1 ? 's' : ''}` },
    { label: 'Avg complete', accent: 'from-emerald-300 to-emerald-600', value: `${d.avgCompletion}%`, sub: d.totalUsers > 0 ? `${d.topCollectors[0]?.pct ?? 0}% best` : 'no players yet' },
  ];
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 h-full">
      {stats.map(({ label, accent, value, sub }) => (
        <div key={label} className="tcg-panel holo-hover rounded-2xl overflow-hidden hover:-translate-y-0.5 hover:shadow-glow transition-all">
          <div className={`h-1.5 bg-gradient-to-r ${accent}`} />
          <div className="p-5 space-y-1">
            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">{label}</p>
            <p className="font-display text-4xl font-bold text-white tabular-nums">{value}</p>
            <p className="text-xs text-gray-500">{sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TopCollectors({ d }: { d: DashboardData }) {
  return (
    <Panel title="Top collectors" icon="award" flush action={<span className="flex items-center gap-4"><More href={`/leaderboard/${d.season.id}`} external>Full leaderboard ↗</More><More href="/admin/users">View all →</More></span>}>
      {d.topCollectors.length === 0 ? <Empty>No players yet. Share the overlay and start pulling cards!</Empty> : (
        <div className="divide-y divide-gray-800/60">
          {d.topCollectors.map(({ username, owned, pct }, i) => (
            <div key={username} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-800/30 transition-colors">
              <span className={`text-sm font-bold w-5 tabular-nums shrink-0 ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-gray-700'}`}>{i + 1}</span>
              <Avatar src={d.avatars[username] && sizeTwitchAvatar(d.avatars[username]!, 70)} name={username} className="w-8 h-8 text-xs" />
              <Link href={`/admin/users/${username}`} className="flex-1 text-sm font-mono text-gray-200 hover:text-white truncate">{username}</Link>
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-yellow-500 rounded-full" style={{ width: `${pct}%` }} /></div>
                <span className="text-xs text-gray-500 tabular-nums w-16 text-right">{owned}/{d.allCards.length} <span className="text-gray-700">·</span> <span className="text-yellow-500">{pct}%</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Leaderboard({ d }: { d: DashboardData }) {
  const rows = d.board?.rows.slice(0, 7) ?? [];
  return (
    <Panel title="Leaderboard" icon="trophy" flush action={<More href={`/leaderboard/${d.season.id}`} external>Full ↗</More>}>
      {rows.length === 0 ? <Empty>No scores yet.</Empty> : (
        <ol className="divide-y divide-gray-800/60">
          {rows.map((r, i) => (
            <li key={r.username} className="px-5 py-2.5 flex items-center gap-3">
              <span className={`text-sm font-bold w-5 tabular-nums ${i === 0 ? 'text-amber-400' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-gray-700'}`}>{i + 1}</span>
              <Link href={`/admin/users/${r.username}`} className="flex-1 min-w-0 text-sm font-mono text-gray-200 hover:text-white truncate">{r.username}{r.complete && <Icon name="cheese" className="ml-1 text-yellow-400" title="Complete collection" />}</Link>
              <span className="text-sm font-bold text-yellow-400 tabular-nums">{r.score.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Rarity({ d }: { d: DashboardData }) {
  return (
    <Panel title="Rarity mix" icon="gem">
      {d.rarityDist.length === 0 ? <p className="text-sm text-gray-600">No cards in active packs</p> : (
        <div className="space-y-3">
          {d.rarityDist.map(r => (
            <div key={r.stars} className="space-y-1">
              <div className="flex items-center justify-between text-xs"><span className={`${r.text} font-medium`}>{'★'.repeat(r.stars)}</span><span className="text-gray-600">{r.count} cards · {r.pct}%</span></div>
              <div className="h-1 bg-gray-800 rounded-full overflow-hidden"><div className={`h-full ${r.bar} rounded-full`} style={{ width: `${r.pct}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Packs({ d }: { d: DashboardData }) {
  return (
    <Panel title="Active packs" icon="cards" flush action={<More href="/admin/packs">Manage →</More>}>
      {d.packs.length === 0 ? <Empty>No active packs in this season</Empty> : (
        <div className="divide-y divide-gray-800/60">
          {d.packs.map(({ pack, cards }) => (
            <Link key={pack.id} href={`/admin/packs/${pack.id}`} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-800/30 transition-colors">
              {pack.coverImageUrl ? <img src={pack.coverImageUrl} alt="" loading="lazy" className="w-7 h-9 object-cover rounded shrink-0" /> : <div className="w-7 h-9 bg-gray-800 rounded shrink-0" />}
              <div className="flex-1 min-w-0"><p className="text-sm text-white truncate">{pack.name}</p><p className="text-xs text-gray-600">{cards.length} cards{pack.upgradesEnabled ? ' · variants on' : ''}</p></div>
              <span className="text-xs text-gray-700">→</span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
}

function CardOwnership({ d }: { d: DashboardData }) {
  return (
    <Panel title="Card ownership" icon="cards" flush action={<span className="text-xs text-gray-600">sorted by rarity</span>}>
      <div className="overflow-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900">
            <tr className="text-gray-600 text-xs uppercase border-b border-gray-800">
              <th className="text-left px-5 py-3">#</th><th className="text-left px-5 py-3">Card</th><th className="text-left px-5 py-3">Pack</th>
              <th className="text-right px-5 py-3">Rarity</th><th className="text-right px-5 py-3">Owners</th><th className="text-right px-5 py-3 w-28">Coverage</th>
            </tr>
          </thead>
          <tbody>
            {d.cardStats.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-600">No cards in active packs</td></tr>}
            {d.cardStats.map(c => {
              const rarity = getRarity(c.stars);
              const covPct = d.totalUsers > 0 ? Math.round((c.ownedBy / d.totalUsers) * 100) : 0;
              const packName = d.packs.find(({ cards }) => cards.some(pc => pc.id === c.id))?.pack.name ?? '';
              return (
                <tr key={c.id} className="border-t border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-2.5 text-gray-600 tabular-nums text-xs">{c.number}</td>
                  <td className="px-5 py-2.5"><div className="flex items-center gap-2.5">{c.imageUrl ? <img src={cardThumbUrl(c.imageUrl)} alt="" loading="lazy" className="w-5 h-7 object-cover rounded shrink-0" /> : <div className="w-5 h-7 bg-gray-800 rounded shrink-0" />}<span className="text-gray-200">{c.name}</span></div></td>
                  <td className="px-5 py-2.5 text-gray-600 text-xs">{packName}</td>
                  <td className="px-5 py-2.5 text-right"><span className={`text-xs font-medium ${rarity?.text ?? 'text-gray-400'}`}>{'★'.repeat(c.stars)}</span></td>
                  <td className="px-5 py-2.5 text-right text-gray-400 tabular-nums">{c.ownedBy}</td>
                  <td className="px-5 py-2.5 text-right"><div className="flex items-center justify-end gap-2"><div className="w-16 h-1 bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-gray-500 rounded-full" style={{ width: `${covPct}%` }} /></div><span className="text-xs text-gray-600 tabular-nums w-8 text-right">{covPct}%</span></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** One activity event as a sentence (names are plain text: they come from unauthenticated endpoints). */
function describe(e: ActivityEvent, d: DashboardData): { icon: IconName; text: string } {
  const cardName = (n: number) => d.allCards.find(c => c.number === n)?.name ?? `#${n}`;
  const v = (x?: string) => (x && x !== 'regular' ? ` (${VARIANT_LABELS[x as keyof typeof VARIANT_LABELS] ?? x})` : '');
  switch (e.type) {
    case 'pull': return { icon: 'cards', text: `${e.username} pulled ${e.cardName || cardName(e.cardNumber)}${v(e.variant)}${e.isNew ? ', new!' : ''}` };
    case 'grant': return { icon: 'gift', text: `${e.username} was granted ${cardName(e.cardNumber)}${v(e.variant)}` };
    case 'remove': return { icon: 'trash', text: `${cardName(e.cardNumber)} removed from ${e.username}` };
    case 'upgrade': return { icon: 'sparkles', text: `${e.username} upgraded ${e.cardName || cardName(e.cardNumber)} to ${VARIANT_LABELS[e.to]}` };
    case 'trade': {
      const w = { offered: 'offered a trade', countered: 'countered an offer', accepted: `traded with ${e.partner ?? '?'}`, declined: 'had an offer declined', cancelled: 'had an offer cancelled', expired: 'had an offer expire' }[e.action];
      return { icon: 'trade', text: `${e.username} ${w}` };
    }
    case 'reset': return { icon: 'refresh', text: e.scope === 'everyone' ? 'All collections reset' : `${e.username}'s collection reset` };
    case 'delete': return { icon: 'x', text: `${e.username} deleted` };
    case 'trigger': return { icon: 'zap', text: e.kind === 'pull' ? `Pack draw requested for ${e.username}` : e.kind === 'card' ? `${e.username} showed off ${e.cardName ?? 'a card'}` : `Collection view requested for ${e.username}` };
    default: return { icon: 'book', text: `${e.username}'s collection shown` };
  }
}

function Activity({ d }: { d: DashboardData }) {
  const events = d.activity.slice(0, 9);
  return (
    <Panel title="Recent activity" icon="radio" flush action={<More href="/admin/activity">Live feed →</More>}>
      {events.length === 0 ? <Empty>Nothing has happened yet.</Empty> : (
        <ul className="divide-y divide-gray-800/60">
          {events.map(e => {
            const { icon, text } = describe(e, d);
            return (
              <li key={e.seq} className="px-5 py-2 flex items-center gap-3 text-sm">
                <Icon name={icon} className="text-gray-500" />
                <span className="flex-1 min-w-0 truncate text-gray-300">{text}</span>
                <span className="text-xs text-gray-600 shrink-0">{timeAgo(e.at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Trades({ d }: { d: DashboardData }) {
  const t = d.trades;
  const tile = (label: string, value: number | string) => (
    <div className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2.5"><p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">{label}</p><p className="font-display text-2xl font-bold text-white tabular-nums">{value}</p></div>
  );
  return (
    <Panel title="Trading" icon="trade" flush action={<More href="/admin/trades">Manage →</More>}>
      {!t ? <Empty>No trade data.</Empty> : (
        <>
          <div className="grid grid-cols-3 gap-3 px-5 py-4">{tile('Open offers', t.open.length)}{tile('In escrow', t.escrowedCopies)}{tile('Done today', t.completed24h)}</div>
          {t.recent.length === 0 ? <p className="px-5 pb-5 text-sm text-gray-600">No trades yet.</p> : (
            <ul className="divide-y divide-gray-800/60 border-t border-gray-800">
              {t.recent.map(r => (
                <li key={r.id} className="px-5 py-2 flex items-center gap-3 text-sm">
                  <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 border ${r.status === 'accepted' ? 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10' : 'text-gray-400 border-gray-700'}`}>{r.status}</span>
                  <span className="flex-1 min-w-0 truncate text-gray-300">{r.from}{r.status === 'accepted' && r.resolvedBy ? ` ⇄ ${r.resolvedBy}` : r.to ? ` → ${r.to}` : ' → board'}</span>
                  {r.resolvedAt && <span className="text-xs text-gray-600 shrink-0">{timeAgo(r.resolvedAt)}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

function Overlay() {
  return (
    <Panel title="Overlay status" icon="monitor">
      <div className="space-y-3">
        <OverlayStatus />
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/overlay" className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"><Icon name="palette" className="mr-1.5" />Overlay editor</Link>
          <Link href="/admin/settings?tab=overlay" className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"><Icon name="settings" className="mr-1.5" />Overlay settings</Link>
        </div>
      </div>
    </Panel>
  );
}

const VARIANT_BAR: Record<string, string> = { regular: 'bg-gray-500', reverse: 'bg-violet-500', full: 'bg-sky-500', shiny: 'bg-amber-400' };
function Variants({ d }: { d: DashboardData }) {
  const total = VARIANTS.reduce((s, v) => s + d.variantCounts[v], 0);
  return (
    <Panel title="Variant mix" icon="sparkles">
      {total === 0 ? <p className="text-sm text-gray-600">No copies yet.</p> : (
        <div className="space-y-3">
          {VARIANTS.map(v => {
            const n = d.variantCounts[v];
            const pct = Math.round((n / total) * 100);
            return (
              <div key={v} className="space-y-1">
                <div className="flex items-center justify-between text-xs"><span className="text-gray-300">{VARIANT_LABELS[v]}</span><span className="text-gray-500 tabular-nums">{n.toLocaleString()} · {pct}%</span></div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden"><div className={`h-full ${VARIANT_BAR[v]} rounded-full`} style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function Valuable({ d }: { d: DashboardData }) {
  const cards = d.board ? [...d.board.values.cards.values()].sort((a, b) => b.values.regular - a.values.regular).slice(0, 6) : [];
  return (
    <Panel title="Most valuable cards" icon="coins" flush action={<span className="text-xs text-gray-600">per Regular copy</span>}>
      {cards.length === 0 ? <Empty>No values yet.</Empty> : (
        <ul className="divide-y divide-gray-800/60">
          {cards.map(cv => {
            const c = d.allCards.find(x => x.number === cv.number);
            return (
              <li key={cv.number} className="px-5 py-2 flex items-center gap-3 text-sm">
                {c?.imageUrl ? <img src={cardThumbUrl(c.imageUrl)} alt="" loading="lazy" className="w-5 h-7 object-cover rounded shrink-0" /> : <div className="w-5 h-7 bg-gray-800 rounded shrink-0" />}
                <span className="flex-1 min-w-0 truncate text-gray-200">{c?.name ?? `#${cv.number}`}</span>
                <span className="text-xs text-gray-600 tabular-nums">{cv.copies} out</span>
                <span className="font-bold text-yellow-400 tabular-nums w-14 text-right">{cv.values.regular}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function Unowned({ d }: { d: DashboardData }) {
  const missing = d.cardStats.filter(c => c.ownedBy === 0);
  return (
    <Panel title="Cards nobody owns" icon="hole" flush>
      {missing.length === 0 ? <Empty>Every card has been pulled by someone</Empty> : (
        <ul className="divide-y divide-gray-800/60 max-h-72 overflow-auto">
          {missing.map(c => (
            <li key={c.id} className="px-5 py-2 flex items-center gap-3 text-sm">
              <span className="text-xs text-gray-600 tabular-nums w-6">#{c.number}</span>
              <span className="flex-1 min-w-0 truncate text-gray-200">{c.name}</span>
              <span className={`text-xs ${getRarity(c.stars)?.text ?? 'text-gray-400'}`}>{'★'.repeat(c.stars)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Live({ d }: { d: DashboardData }) {
  const l = d.live;
  return (
    <Panel title="Stream status" icon="radio">
      {!l ? <p className="text-sm text-gray-500">Twitch isn&rsquo;t configured or can&rsquo;t be reached, so the live status is unknown.</p> : l.live ? (
        <div className="space-y-1.5">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-red-400"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> LIVE{typeof l.viewers === 'number' ? ` · ${l.viewers.toLocaleString()} watching` : ''}</p>
          {l.title && <p className="text-sm text-gray-200 break-words">{l.title}</p>}
          {l.game && <p className="text-xs text-gray-500">{l.game}</p>}
        </div>
      ) : <p className="text-sm text-gray-400">The channel is offline right now.</p>}
    </Panel>
  );
}

const SHORTCUTS: [string, IconName, string][] = [
  ['/admin/packs/new', 'cards', 'New pack'], ['/admin/seasons/new', 'trophy', 'New season'], ['/admin/overlay', 'palette', 'Overlay editor'],
  ['/admin/trades', 'trade', 'Trades'], ['/admin/serials', 'cheese', 'Serials'], ['/admin/sandbox', 'flask', 'Sandbox'], ['/admin/users', 'users', 'Users'], ['/admin/assets', 'image', 'Assets'], ['/admin/settings', 'settings', 'Settings'],
];
function Shortcuts() {
  return (
    <Panel title="Shortcuts" icon="compass">
      <div className="grid grid-cols-2 gap-2">
        {SHORTCUTS.map(([href, icon, label]) => (
          <Link key={href} href={href} className="flex items-center gap-2 rounded-lg bg-gray-950/50 border border-gray-800 hover:border-yellow-500/40 px-3 py-2 text-sm text-gray-300 hover:text-white transition-colors"><Icon name={icon} className="text-gray-500" />{label}</Link>
        ))}
      </div>
    </Panel>
  );
}

/** The server-rendered content of one widget. */
export function renderWidget(type: WidgetType, d: DashboardData, opts: { gift?: string }): ReactNode {
  switch (type) {
    case 'overview': return <Overview d={d} />;
    case 'quick-actions':
      return <QuickActions usernames={d.users.map(([n]) => n).sort()} cards={[...d.allCards].sort((a, b) => a.number - b.number).map(c => ({ number: c.number, name: c.name, stars: c.stars }))} defaultUsername={opts.gift ?? ''} />;
    case 'top-collectors': return <TopCollectors d={d} />;
    case 'leaderboard': return <Leaderboard d={d} />;
    case 'rarity': return <Rarity d={d} />;
    case 'packs': return <Packs d={d} />;
    case 'card-ownership': return <CardOwnership d={d} />;
    case 'activity': return <Activity d={d} />;
    case 'trades': return <Trades d={d} />;
    case 'overlay': return <Overlay />;
    case 'pulse': return <PulseWidget d={d} />;
    case 'attention': return <Attention d={d} />;
    case 'pulls-chart': return <PullsChart d={d} />;
    case 'economy': return <Economy d={d} />;
    case 'viewers': return <Viewers d={d} />;
    case 'progress': return <Progress d={d} />;
    case 'changes': return <Changes d={d} describe={describe} />;
    case 'overlay-controls': return <OverlayControlsWidget d={d} />;
    case 'variants': return <Variants d={d} />;
    case 'valuable': return <Valuable d={d} />;
    case 'unowned': return <Unowned d={d} />;
    case 'live': return <Live d={d} />;
    case 'shortcuts': return <Shortcuts />;
    case 'notes': return <Panel title="Notes" icon="note"><NotesWidget initial={d.notes} /></Panel>;
  }
}
