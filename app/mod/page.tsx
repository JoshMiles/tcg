import Link from 'next/link';
import { Icon, type IconName } from '@/app/components/Icon';
import { getActiveSeasonWithPacks } from '@/lib/kv';
import { getActivity } from '@/lib/activity';
import { plainText } from '@/lib/activity-view';
import { listOpenTrades } from '@/lib/trades';
import { getHiddenUsers } from '@/lib/user-admin';
import { getStaff } from '@/lib/staff-guard';
import { PageHeader, Panel, Tile } from '../admin/components/ui';

export const metadata = { title: 'Mod panel', robots: { index: false } };
export const dynamic = 'force-dynamic';

const ago = (t: number, now: number) => {
  const m = Math.max(0, Math.round((now - t) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

const LINKS: { href: string; icon: IconName; title: string; text: string }[] = [
  { href: '/mod/activity', icon: 'radio', title: 'Live activity', text: 'Watch pulls, upgrades and trades as they happen.' },
  { href: '/mod/users', icon: 'users', title: 'Viewers', text: 'Look someone up, restrict or tag them.' },
  { href: '/mod/trades', icon: 'trade', title: 'Trades', text: 'Open offers, the log, and flagged trades.' },
];

export default async function ModHomePage() {
  const staff = await getStaff();
  const [{ events }, active, open, hidden] = await Promise.all([
    getActivity({ limit: 200 }), getActiveSeasonWithPacks(), listOpenTrades().catch(() => []), getHiddenUsers().catch(() => new Set<string>()),
  ]);
  const names = new Map<number, string>();
  for (const { cards } of active?.packs ?? []) for (const c of cards) if (!names.has(c.number)) names.set(c.number, c.name);
  const now = Date.now();
  const lastHour = events.filter(e => now - e.at < 3_600_000).length;

  return (
    <div className="space-y-6">
      <PageHeader title={`Hi ${staff?.displayName ?? 'there'}`} subtitle="Keep an eye on the game and look after the community." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Events, last hour" value={lastHour} icon="activity" href="/mod/activity" />
        <Tile label="Open trade offers" value={open.length} icon="trade" href="/mod/trades" />
        <Tile label="Hidden from boards" value={hidden.size} icon="eye" href="/mod/users?show=restricted" />
        <Tile label="Season" value={active?.season.name ?? 'none'} icon="trophy" />
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {LINKS.map(l => (
          <Link key={l.href} href={l.href} className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 hover:border-yellow-500/40 transition-colors">
            <p className="font-bold text-white"><Icon name={l.icon} className="mr-2 text-yellow-400" />{l.title}</p>
            <p className="text-sm text-gray-400 mt-1">{l.text}</p>
          </Link>
        ))}
      </div>

      <Panel title="Latest activity" icon="activity" actions={<Link href="/mod/activity" className="text-xs font-bold text-yellow-400 hover:text-yellow-300">See all</Link>}>
        {events.length === 0 ? <p className="text-sm text-gray-600">Nothing yet.</p> : (
          <ul className="divide-y divide-gray-800/60 rounded-lg border border-gray-800 overflow-hidden">
            {events.slice(0, 10).map(e => (
              <li key={e.seq} className="px-4 py-2 flex items-center gap-3 text-sm">
                <span className="text-gray-300 truncate">{plainText(e, n => names.get(n))}</span>
                <span className="ml-auto text-xs text-gray-600 shrink-0">{ago(e.at, now)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
