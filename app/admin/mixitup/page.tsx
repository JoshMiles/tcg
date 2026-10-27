import { staffPage } from '@/lib/staff-guard';
import { Icon } from '@/app/components/Icon';
import { PageTabs, pickTab, type PageTab } from '../components/PageTabs';
import { PageHeader } from '../components/ui';
import { currentStreamKey, getMixItUpLog, getMixItUpSettings } from '@/lib/mixitup';
import { healthChips, readMixItUpHealth } from '@/lib/mixitup-health';
import { timeAgo } from '@/lib/site-data';
import { getStreamBuff } from '@/lib/pull-limit';
import { streamBuffAmount } from '@/lib/pull-limit-core';
import { getCommandLog, getCommands, getCommandStats } from '@/lib/commands';
import { getWebhookSettings } from '@/lib/webhooks';
import { SITE_URL } from '@/lib/site';
import { CommandsPanel } from './CommandsPanel';
import { MixItUpConfig } from './MixItUpConfig';
import { MixItUpLog } from './MixItUpLog';
import { BridgeCard } from './BridgeCard';
import { listBridges, readBridge, readObs } from '@/lib/bridge';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Mix It Up · Admin', robots: { index: false } };

const CHIP_STYLE = {
  ok: { badge: 'badge-success', icon: 'checkCircle' },
  warn: { badge: 'badge-warning', icon: 'warning' },
  bad: { badge: 'badge-error', icon: 'alert' },
  muted: { badge: 'badge-ghost', icon: 'info' },
} as const;

const TABS: (PageTab & { hint: string })[] = [
  { id: 'paid', label: 'Paid pulls', icon: 'coins', hint: 'Viewers pay Brie Bucks for packs: prices, limits and the message sent to Mix It Up' },
  { id: 'commands', label: 'Commands', icon: 'chat', hint: 'Chat commands such as !showoff and !stats: one webhook, replies built from variables' },
  { id: 'log', label: 'Log', icon: 'list', hint: 'The last requests to and refusals for Mix It Up' },
];

export default async function MixItUpPage({ searchParams }: { searchParams: Promise<{ tab?: string; saved?: string; error?: string; note?: string }> }) {
  await staffPage('admin');
  const { tab: tabParam, saved, error, note } = await searchParams;
  const tab = pickTab(TABS, tabParam);
  const settings = await getMixItUpSettings();
  const bridge = await readBridge();
  return (
    <div className="space-y-6">
      <PageHeader title="Mix It Up" subtitle={TABS.find(t => t.id === tab)?.hint} />
      <ul className="flex flex-wrap gap-2" aria-label="Mix It Up connection">
        {healthChips(await readMixItUpHealth(), { balance: settings.balanceUrl, deduct: settings.deductUrl, add: settings.addUrl, viewers: settings.viewersUrl }, Date.now(), timeAgo, settings.connection === 'bridge' ? { at: bridge.at, obs: await readObs() } : undefined).map(c => (
          <li key={c.text} className={`badge badge-sm h-auto py-1 gap-1 whitespace-normal ${CHIP_STYLE[c.tone].badge}`}>
            <Icon name={CHIP_STYLE[c.tone].icon} /> {c.text}
          </li>
        ))}
      </ul>
      <PageTabs tabs={TABS} active={tab} base="/admin/mixitup" label="Mix It Up sections" />

      {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-2.5 text-sm text-red-300">Not saved: {error}</div>}
      {note && <div role="status" className="rounded-lg border border-green-500/30 bg-green-950/30 px-4 py-2.5 text-sm text-green-300">{note}</div>}
      {saved === 'mixitup' && (
        <div role="status" className="rounded-lg border border-green-500/30 bg-green-950/30 px-4 py-2.5 text-sm text-green-300 flex items-center gap-2">
          <Icon name="check" /> Mix It Up saved.
        </div>
      )}

      {tab === 'paid' && (
        <div className="space-y-6">
          <BridgeCard
            version={bridge.version}
            bridges={(await listBridges()).map(b => ({ id: b.id, name: b.name, paired: timeAgo(b.createdAt), seen: b.lastSeen ? timeAgo(b.lastSeen) : 'never' }))}
          />
          <MixItUpConfig settings={settings} streamExtra={streamBuffAmount(await getStreamBuff(), await currentStreamKey())} bridge={bridge} />
        </div>
      )}
      {tab === 'commands' && <CommandsPanel initial={await getCommands()} stats={await getCommandStats()} webhookUrl={`${SITE_URL}/api/webhooks/command`} secret={(await getWebhookSettings()).incomingSecret} />}
      {tab === 'log' && <MixItUpLog log={[...(await getMixItUpLog()), ...(await getCommandLog())].sort((a, b) => b.at - a.at)} />}
    </div>
  );
}
