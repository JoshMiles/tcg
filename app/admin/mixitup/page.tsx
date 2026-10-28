import Link from 'next/link';
import { staffPage } from '@/lib/staff-guard';
import { Icon } from '@/app/components/Icon';
import { PageTabs, pickTab, type PageTab } from '../components/PageTabs';
import { PageHeader } from '../components/ui';
import { kv } from '@/lib/db';
import { getActiveSeasonWithPacks } from '@/lib/kv';
import { currentStreamKey, getMixItUpLog, getMixItUpSettings } from '@/lib/mixitup';
import { healthChips, readMixItUpHealth } from '@/lib/mixitup-health';
import { needsSetup, pickLogFilter, statusCards, streamNumbers } from '@/lib/mixitup-page';
import { timeAgo } from '@/lib/site-data';
import { getStreamBuff } from '@/lib/pull-limit';
import { streamBuffAmount } from '@/lib/pull-limit-core';
import { getCommandLog, getCommands, getCommandStats } from '@/lib/commands';
import { getWebhookSettings } from '@/lib/webhooks';
import { packSetup } from '@/lib/mixitup-setup';
import { CHANNEL_LOGIN, SITE_URL } from '@/lib/site';
import { listBridges, readBridge, readObs } from '@/lib/bridge';
import { bridgeAccount, isStaffPc } from '@/lib/bridge-core';
import { readWatchdogAt } from '@/lib/overlay-watchdog';
import { isPullsPaused, pauseChatOn, pauseReason } from '@/lib/pull-pause';
import { CommandsPanel } from './CommandsPanel';
import { ConnectionTab } from './ConnectionTab';
import { channelConnectReady, readChannelStatus } from '@/lib/twitch-channel';
import { readEventSub, recentTwitchEvents } from '@/lib/twitch-events';
import { listeningLine } from '@/lib/twitch-events-core';
import { testingLine } from '@/lib/twitch-channel-core';
import { MixItUpConfig } from './MixItUpConfig';
import { MixItUpLog } from './MixItUpLog';
import { StreamDeckTab } from './StreamDeckTab';
import { EventsTab } from './EventsTab';
import { getBuffDefs } from '@/lib/buffs';
import { readCommandCheck } from '@/lib/mixitup-command-check';
import { errorDays, readErrors } from '@/lib/bridge-errors';
import { getHappyHour, happyHourWhat } from '@/lib/happyhour';
import { readPackGoal } from '@/lib/pack-goal';
import { Overview, CHIP_STYLE } from './Overview';
import { PullRules } from './PullRules';
import { ChatBucks } from './ChatBucks';
import { readLedgerCheck } from '@/lib/bridge-chat';
import { listPullBlocks } from '@/lib/pull-block';
import { readUptime } from '@/lib/bridge-uptime';
import { readChecklist } from '@/lib/bridge-checklist';
import { recentTests } from '@/lib/mixitup-test';
import { inSandbox } from '@/lib/db';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Mix It Up · Admin', robots: { index: false } };

const TABS: (PageTab & { hint: string })[] = [
  { id: 'overview', label: 'Overview', icon: 'home', hint: 'Is everything working? The state of the connection, this stream and a few quick tests' },
  { id: 'connection', label: 'Connection', icon: 'link', hint: 'TCG Bridge, the currency viewers pay with and how the site reaches Mix It Up' },
  { id: 'paid', label: 'Paid pulls', icon: 'coins', hint: 'Viewers pay Brie Bucks for packs: prices, limits and messages' },
  { id: 'bigpulls', label: 'Big pulls', icon: 'sparkles', hint: 'Run a Mix It Up command when a big card is pulled' },
  { id: 'chat', label: 'Chat and Brie Bucks', icon: 'database', hint: 'Chat posts when the stream starts and ends, the Brie Bucks backup and the check of charges' },
  { id: 'commands', label: 'Commands', icon: 'chat', hint: 'Chat commands such as !showoff and !stats: one webhook, replies built from variables' },
  { id: 'streamdeck', label: 'Stream Deck', icon: 'gamepad', hint: 'Buttons that apply a buff, give extra pulls or a free pack: one Mix It Up command each' },
  { id: 'events', label: 'Events', icon: 'gift', hint: 'Free packs or a buff for gifted subs, bits, raids and channel point redeems' },
  { id: 'log', label: 'Log', icon: 'list', hint: 'The last requests to and refusals for Mix It Up' },
];

/** The community pack goal (57.5) for its box, and the community buffs it can give. */
async function packGoalView() {
  const [cur, defs] = await Promise.all([readPackGoal(), getBuffDefs()]);
  const buffs = defs.filter(b => b.scope === 'community' && b.type !== 'grant-achievement').map(b => ({ id: b.id, name: b.name }));
  const r = cur?.goal.reward;
  const reward = !r || r.type === 'none' ? 'none' : r.type === 'pulls' ? `${r.amount} extra pull${r.amount === 1 ? '' : 's'} each this stream` : `community buff ${buffs.find(b => b.id === r.buffId)?.name ?? '(missing)'}`;
  return { buffs, running: cur ? { label: cur.goal.label, target: cur.goal.target, count: cur.count, reward, by: cur.goal.by } : null };
}

/** The connected Twitch channel (58.1) for the Connection tab; null when none. */
async function twitchView() {
  const c = await readChannelStatus();
  if (!c) return null;
  // 58.2: what TCG Bridge says about its EventSub connection, and the newest events it forwarded.
  const [sub, events] = await Promise.all([readEventSub(), recentTwitchEvents(8)]);
  const listening = listeningLine(sub, events[0] ?? null, Date.now(), timeAgo);
  const off = sub && sub.state !== 'connected' ? sub.reason || (sub.state === 'off' ? 'TCG Bridge is not listening' : 'TCG Bridge is reconnecting to Twitch') : '';
  return {
    login: c.login, scopes: c.scopes, since: timeAgo(c.connectedAt), by: c.by, testing: c.testing, testingLine: testingLine(c.login),
    listening, problem: listening ? '' : off || (sub ? 'TCG Bridge has not reported lately' : 'TCG Bridge has not reported a Twitch connection yet'),
    events: events.map(e => ({ text: e.text, ago: timeAgo(e.at) })),
  };
}

async function happyHourView(now: number) {
  const h = await getHappyHour(now);
  return h ? { what: happyHourWhat(h), minutesLeft: Math.max(1, Math.ceil((h.endsAt - now) / 60_000)), by: h.by } : null;
}

export default async function MixItUpPage({ searchParams }: { searchParams: Promise<{ tab?: string; saved?: string; error?: string; note?: string; filter?: string }> }) {
  await staffPage('admin');
  const { tab: tabParam, saved, error, note, filter } = await searchParams;
  const tab = pickTab(TABS, tabParam);
  const settings = await getMixItUpSettings();
  const bridge = await readBridge();
  const health = await readMixItUpHealth();
  const obs = await readObs();
  const watchdogAt = await readWatchdogAt();
  const bridges = await listBridges();
  const blocks = await listPullBlocks();
  const now = Date.now();
  const setupLabel = bridges.length > 0 || Object.values(health.seen).some(s => s.okAt) ? 'Run setup again' : 'Set up Mix It Up';
  const mergedLog = async () => [...(await getMixItUpLog()), ...(await getCommandLog())].sort((a, b) => b.at - a.at);
  /** Everything the Overview shows beyond the health row: the stream marker, both logs and the stream's extra pulls. Read only on that tab. */
  const overviewProps = async () => {
    const [log, cmdLog] = [await getMixItUpLog(), await getCommandLog()];
    const cards = statusCards({ health, settings, bridge, paired: bridges.length, obs, now, ago: timeAgo, watchdogAt });
    return {
      cards, now, login: CHANNEL_LOGIN, obsPaired: bridges.length > 0, setup: needsSetup(cards), setupLabel,
      numbers: streamNumbers(log, cmdLog, (await kv.get<number>('twitch:live:since')) || null, now),
      recent: [...log, ...cmdLog].sort((a, b) => b.at - a.at).slice(0, 5),
      streamExtra: streamBuffAmount(await getStreamBuff(), await currentStreamKey()),
      paused: await isPullsPaused(), pauseReason: await pauseReason(), pauseChat: await pauseChatOn(),
      testViewers: settings.testViewers, paidOn: settings.enabled, sandbox: await inSandbox(), tests: await recentTests(), uptime: await readUptime(), checklist: await readChecklist(),
    };
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Mix It Up" subtitle={TABS.find(t => t.id === tab)?.hint} />
      {tab !== 'overview' && (
        <ul className="flex flex-wrap gap-2" aria-label="Mix It Up connection">
          {healthChips(health, { balance: settings.balanceUrl, deduct: settings.deductUrl, add: settings.addUrl, viewers: settings.viewersUrl }, now, timeAgo, settings.connection === 'bridge' ? { at: bridge.at, obs, watchdog: { on: settings.overlayWatchdog, at: watchdogAt } } : undefined).map(c => (
            <li key={c.text} className={`badge badge-sm h-auto py-1 gap-1 whitespace-normal ${CHIP_STYLE[c.tone].badge}`}>
              <Icon name={CHIP_STYLE[c.tone].icon} /> {c.text}
            </li>
          ))}
        </ul>
      )}
      <PageTabs tabs={TABS} active={tab} base="/admin/mixitup" label="Mix It Up sections" />

      {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-2.5 text-sm text-red-300">Not saved: {error}</div>}
      {note && <div role="status" className="rounded-lg border border-green-500/30 bg-green-950/30 px-4 py-2.5 text-sm text-green-300">{note}</div>}
      {saved === 'mixitup' && (
        <div role="status" className="rounded-lg border border-green-500/30 bg-green-950/30 px-4 py-2.5 text-sm text-green-300 flex items-center gap-2">
          <Icon name="check" /> Mix It Up saved.
        </div>
      )}

      {tab === 'overview' && <Overview {...await overviewProps()} />}
      {tab === 'connection' && (
        <div className="space-y-6">
          <Link href="/admin/mixitup/setup" className="btn btn-primary btn-sm"><Icon name="wrench" />{setupLabel}</Link>
          <ConnectionTab settings={settings} bridge={bridge} bridges={bridges.map(b => ({ id: b.id, name: b.name, paired: timeAgo(b.createdAt), seen: b.lastSeen ? timeAgo(b.lastSeen) : 'never', staff: isStaffPc(b), account: bridgeAccount(b), by: b.by ?? '' }))} blocks={blocks.map(b => ({ username: b.username, by: b.by, scope: b.streamKey ? 'this stream' : 'until lifted' }))} commandCheck={await readCommandCheck(await getBuffDefs())} errors={{ rows: (await readErrors()).map(e => ({ ...e, ago: timeAgo(e.at) })), days: await errorDays() }} twitch={await twitchView()} twitchReady={channelConnectReady()} />
        </div>
      )}
      {tab === 'paid' && <MixItUpConfig settings={settings} happyHour={await happyHourView(now)} packGoal={await packGoalView()}packs={((await getActiveSeasonWithPacks())?.packs ?? []).filter(p => p.cards.length > 0).map(p => ({ id: p.pack.id, name: p.pack.name, price: p.pack.price }))} />}
      {tab === 'bigpulls' && <PullRules rules={settings.pullRules} commands={bridge.commands} obs={{ scenes: obs?.scenes ?? [], sources: obs?.sources ?? [] }} watchdog={settings.overlayWatchdog} />}
      {tab === 'chat' && <ChatBucks chat={settings.chat} check={await readLedgerCheck()} when={timeAgo} />}
      {tab === 'commands' &&<CommandsPanel initial={await getCommands()} stats={await getCommandStats()} webhookUrl={`${SITE_URL}/api/webhooks/command`} secret={(await getWebhookSettings()).incomingSecret} pack={packSetup(SITE_URL, (await getWebhookSettings()).incomingSecret)} />}
      {tab === 'streamdeck' && <StreamDeckTab buffs={await getBuffDefs()} url={`${SITE_URL}/api/webhooks/buff`} secret={(await getWebhookSettings()).incomingSecret} />}
      {tab === 'events' && <EventsTab rewards={settings.eventRewards} buffs={await getBuffDefs()} url={`${SITE_URL}/api/webhooks/pull`} secret={(await getWebhookSettings()).incomingSecret} />}
      {tab === 'log' &&<MixItUpLog log={await mergedLog()} filter={pickLogFilter(filter)} now={now} />}
    </div>
  );
}
