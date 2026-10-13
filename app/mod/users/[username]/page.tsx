import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@/app/components/Avatar';
import { Icon } from '@/app/components/Icon';
import { getActiveSeasonWithPacks, getAllCollectionUsers, getUserProfile } from '@/lib/kv';
import { getAvatars, sizeTwitchAvatar } from '@/lib/avatars';
import { getActivity } from '@/lib/activity';
import { plainText } from '@/lib/activity-view';
import { getUserAudit } from '@/lib/audit';
import { uniqueCount } from '@/lib/collection';
import { tradesForUser } from '@/lib/trades';
import { describeItems } from '@/lib/trade-core';
import { SUGGESTED_TAGS } from '@/lib/user-admin';
import { requireStaff } from '@/lib/staff-guard';
import { ModerationPanel, TagsEditor, TradesPanel, type TradeLine } from '../../../admin/users/[username]/UserPanels';
import { Chip, PageHeader, Panel, Tile } from '../../../admin/components/ui';

export const metadata = { title: 'Viewer · Mod', robots: { index: false } };
export const dynamic = 'force-dynamic';

const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

/** A viewer as a mod sees them: who they are, their restrictions and tags (editable), trades (cancel and refund), recent activity and what staff did to them. */
export default async function ModUserPage({ params }: { params: Promise<{ username: string }> }) {
  await requireStaff('mod');
  const username = (await params).username.toLowerCase();

  const [profile, avatars, audit, activity, trades, active, everyone] = await Promise.all([
    getUserProfile(username),
    getAvatars([username]),
    getUserAudit(username, 25),
    getActivity({ limit: 500 }),
    tradesForUser(username).catch(() => ({ incoming: [], outgoing: [], board: [], recent: [] })),
    getActiveSeasonWithPacks(),
    getAllCollectionUsers(),
  ]);
  const mine = everyone.find(u => u.username === username);
  if (!profile && !mine) notFound();

  const names = new Map<number, string>();
  const cardsByNumber = new Map<number, string>();
  for (const { cards } of active?.packs ?? []) for (const c of cards) { if (!names.has(c.number)) names.set(c.number, c.name); cardsByNumber.set(c.number, c.name); }
  const nameOf = (n: number) => names.get(n);

  const toLine = (t: (typeof trades.outgoing)[number], open: boolean): TradeLine => ({
    id: t.id, status: t.status, open, kind: t.kind,
    other: t.from === username ? (t.to ?? null) : t.from, mine: t.from === username,
    give: describeItems(t.give, nameOf), get: describeItems(t.get, nameOf),
    at: t.resolvedAt ?? t.createdAt, expiresAt: t.expiresAt, season: active?.season.name ?? 'season',
  });
  const lines: TradeLine[] = [...trades.outgoing.map(t => toLine(t, true)), ...trades.incoming.map(t => toLine(t, true)), ...trades.recent.map(t => toLine(t, false))];

  const now = Date.now();
  const displayName = profile?.displayName || username;
  const flags = profile?.flags;
  const unique = mine?.seasons.reduce((s, x) => s + uniqueCount(x.cards), 0) ?? 0;
  const pulls = mine?.seasons.reduce((s, x) => s + x.cards.length, 0) ?? 0;
  const av = avatars[username];
  const timeline = activity.events.filter(e => e.username === username).slice(0, 15);
  const cardName = (n: number) => cardsByNumber.get(n);

  return (
    <div className="space-y-6">
      <PageHeader
        title={displayName}
        subtitle={`@${username}${profile?.createdAt ? ` · first seen ${new Date(profile.createdAt).toLocaleDateString()}` : ''}`}
        back={{ href: '/mod/users', label: 'All viewers' }}
        actions={<Link href={`/u/${encodeURIComponent(username)}`} target="_blank" className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-white"><Icon name="external" />Public profile</Link>}
      />

      <div className="flex flex-wrap items-center gap-4">
        <Avatar src={av ? sizeTwitchAvatar(av, 150) : undefined} name={displayName} className="w-14 h-14 text-xl" />
        <div className="flex flex-wrap items-center gap-1.5">
          {flags?.noTrading && <Chip tone="red">No trading</Chip>}
          {flags?.hideFromBoard && <Chip tone="amber">Hidden from boards</Chip>}
          {!flags?.noTrading && !flags?.hideFromBoard && <Chip tone="green">No restrictions</Chip>}
          {(profile?.tags ?? []).map(t => <Chip key={t}>{t}</Chip>)}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Different cards" value={unique} />
        <Tile label="Total pulls" value={pulls} />
        <Tile label="Open offers" value={lines.filter(l => l.open).length} />
        <Tile label="Trades done" value={lines.filter(l => l.status === 'accepted').length} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Restrictions" icon="shield" hint="Stop them trading and/or hide them from the public rankings. The reason is only seen by staff.">
          <ModerationPanel username={username} initial={{ noTrading: !!flags?.noTrading, hideFromBoard: !!flags?.hideFromBoard, reason: flags?.reason ?? '', at: flags?.at, by: flags?.by }} />
        </Panel>
        <Panel title="Tags" icon="note" hint="Labels only staff can see.">
          <TagsEditor username={username} initial={profile?.tags ?? []} suggestions={SUGGESTED_TAGS} />
        </Panel>
      </div>

      <Panel title="Trades" icon="trade" hint="Cancelling an open offer returns the escrowed cards to whoever offered them.">
        <TradesPanel username={username} lines={lines} />
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel title="Recent activity" icon="activity">
          {timeline.length === 0 ? <p className="text-sm text-gray-600">Nothing in the recent log.</p> : (
            <ul className="divide-y divide-gray-800/60 rounded-lg border border-gray-800 overflow-hidden">
              {timeline.map(e => (
                <li key={e.seq} className="px-4 py-2 flex items-center gap-3 text-sm">
                  <span className="text-gray-300 truncate">{plainText(e, cardName)}</span>
                  <span className="ml-auto text-xs text-gray-600 shrink-0" title={new Date(e.at).toLocaleString()}>{ago(e.at, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="What staff did" icon="history" hint="Newest first.">
          {audit.length === 0 ? <p className="text-sm text-gray-600">No staff actions recorded yet.</p> : (
            <ul className="divide-y divide-gray-800/60 rounded-lg border border-gray-800 overflow-hidden">
              {audit.map((a, i) => (
                <li key={i} className="px-4 py-2 flex flex-wrap items-center gap-x-3 text-sm">
                  <span className="text-gray-200 font-medium">{a.action}</span>
                  {a.by && <span className="text-xs text-gray-400">by {a.by}</span>}
                  {a.detail && <span className="text-xs text-gray-500">{a.detail}</span>}
                  <span className="ml-auto text-xs text-gray-600" title={new Date(a.at).toLocaleString()}>{ago(a.at, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
