import Link from 'next/link';
import { staffPage } from '@/lib/staff-guard';
import { Icon } from '@/app/components/Icon';
import { PageTabs } from '../components/PageTabs';
import { PageHeader, Panel } from '../components/ui';
import { kv } from '@/lib/db';
import { getActiveSeasonWithPacks } from '@/lib/kv';
import { currentStreamKey, getEventFeed, getMixItUpLog, getMixItUpSettings } from '@/lib/mixitup';
import { readMixItUpHealth } from '@/lib/mixitup-health';
import { pickLogFilter, statusCards, streamNumbers } from '@/lib/mixitup-page';
import { timeAgo } from '@/lib/site-data';
import { readQueue } from '@/lib/queue-control';
import { FEED_LIMIT, SECTIONS, SUB_TABS, filterFeed, mergeFeed, pickFeedFilter, resolveStream, statusStrip } from '@/lib/stream-page';
import { getStreamBuff } from '@/lib/pull-limit';
import { streamBuffAmount } from '@/lib/pull-limit-core';
import { getCommandLog, getCommands, getCommandStats } from '@/lib/commands';
import { getWebhookSettings } from '@/lib/webhooks';
import { CHANNEL_LOGIN, SITE_URL } from '@/lib/site';
import { listBridges, readBridge, readObs } from '@/lib/bridge';
import { bridgeAccount, isStaffPc } from '@/lib/bridge-core';
import { readWatchdogAt } from '@/lib/overlay-watchdog';
import { isPullsPaused, pauseChatOn, pauseReason } from '@/lib/pull-pause';
import { CommandsPanel } from './CommandsPanel';
import { ChannelPoints } from './ChannelPoints';
import { ConnectionTab } from './ConnectionTab';
import { channelConnectReady, readChannelStatus } from '@/lib/twitch-channel';
import { readEventSub, recentTwitchEvents } from '@/lib/twitch-events';
import { lineText, listeningLine } from '@/lib/twitch-events-core';
import { fetchRewards, readAwards } from '@/lib/twitch-awards';
import { chatScopesOk, testingLine } from '@/lib/twitch-channel-core';
import { getReplyAs, readBotStatus } from '@/lib/twitch-bot';
import { twitchHandlesEvent } from '@/lib/twitch-eventsub';
import { CHAT_EVENT, CHAT_VIA_BRIDGE } from '@/lib/twitch-chat-core';
import { awardsPaused } from '@/lib/twitch-awards';
import { MixItUpLog } from './MixItUpLog';
import { CommandsHelper } from './CommandsHelper';
import { CardFrame } from './CardFrame';
import { EventsCard, PacksCard, PaidCard, ShoutoutCard, StartEndCard, StreamDeckCard } from './ViewerCards';
import { BrieBucksSafetyPanel, LedgerCheckPanel, WatchdogPanel } from './SafetyPanels';
import { CARDS, cardHref, cardSummaries } from '@/lib/viewers-cards';
import { helperGroups } from '@/lib/viewers-helper';
import { describeBuffDef } from '@/lib/buffs-core';
import { Chip } from '../components/ui';
import { getBuffDefs } from '@/lib/buffs';
import { readCommandCheck } from '@/lib/mixitup-command-check';
import { errorDays, readErrors } from '@/lib/bridge-errors';
import { getHappyHour, happyHourWhat } from '@/lib/happyhour';
import { readPackGoal } from '@/lib/pack-goal';
import { Card, ChecklistPanel, UptimeStrip } from './StatusCards';
import { StatusStrip } from './StatusStrip';
import { Live } from './Live';
import { TestActions } from './OverviewActions';
import { TestPulls } from './TestPulls';
import { PullRules } from './PullRules';
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

export const metadata = { title: 'Stream · Admin', robots: { index: false } };

/** The connected Twitch channel (58.1) for the Connection tab; null when none. */
async function twitchView() {
  const c = await readChannelStatus();
  if (!c) return null;
  // 58.2: what TCG Bridge says about its EventSub connection, and the newest events it forwarded.
  const [sub, events, awardsOff] = await Promise.all([readEventSub(), recentTwitchEvents(8), awardsPaused()]);
  const listening = listeningLine(sub, events[0] ?? null, Date.now(), timeAgo);
  const off = sub && sub.state !== 'connected' ? sub.reason || (sub.state === 'off' ? 'TCG Bridge is not listening' : 'TCG Bridge is reconnecting to Twitch') : '';
  const [bot, replyAs, viaBridge] = await Promise.all([readBotStatus(), getReplyAs(), twitchHandlesEvent(CHAT_EVENT)]);
  return {
    chat: chatScopesOk(c.scopes), chatLine: viaBridge ? CHAT_VIA_BRIDGE : null, replyAs,
    bot: bot ? { login: bot.login, since: timeAgo(bot.connectedAt), by: bot.by } : null,
    login: c.login, scopes: c.scopes, since: timeAgo(c.connectedAt), by: c.by, testing: c.testing, testingLine: testingLine(c.login), awardsPaused: awardsOff,
    listening, problem: listening ? '' : off || (sub ? 'TCG Bridge has not reported lately' : 'TCG Bridge has not reported a Twitch connection yet'),
    events: events.map(e => ({ text: lineText(e), ago: timeAgo(e.at) })),
  };
}

async function happyHourView(now: number) {
  const h = await getHappyHour(now);
  return h ? { what: happyHourWhat(h), minutesLeft: Math.max(1, Math.ceil((h.endsAt - now) / 60_000)), by: h.by } : null;
}

const SECTION_HINT: Record<string, string> = {
  live: 'Run the stream: pause pulls, extra pulls, who is waiting and what just happened',
  viewers: 'What viewers get: one card for each thing a viewer can earn or do, with a summary of how it is set',
  connections: 'TCG Bridge, the currency viewers pay with and how the site reaches Mix It Up',
  test: 'Try a pull, a balance check or a chat message before you go live',
  history: 'The log of every request and how the bridge held up on past streams',
};
/** The community pack goal (57.5) for its box, and the community buffs it can give. */
async function packGoalView() {
  const [cur, defs] = await Promise.all([readPackGoal(), getBuffDefs()]);
  const buffs = defs.filter(b => b.scope === 'community' && b.type !== 'grant-achievement').map(b => ({ id: b.id, name: b.name }));
  const r = cur?.goal.reward;
  const reward = !r || r.type === 'none' ? 'none' : r.type === 'pulls' ? `${r.amount} extra pull${r.amount === 1 ? '' : 's'} each this stream` : `community buff ${buffs.find(b => b.id === r.buffId)?.name ?? '(missing)'}`;
  return { buffs, running: cur ? { label: cur.goal.label, target: cur.goal.target, count: cur.count, reward, by: cur.goal.by } : null };
}

export default async function StreamPage({ searchParams }: { searchParams: Promise<{ section?: string; tab?: string; card?: string; feed?: string; saved?: string; error?: string; note?: string; filter?: string }> }) {
  await staffPage('admin');
  const { section: sectionParam, tab: tabParam, card: cardParam, feed, saved, error, note, filter } = await searchParams;
  const { section, tab, card } = resolveStream(sectionParam, tabParam, cardParam);
  const settings = await getMixItUpSettings();
  const bridge = await readBridge();
  const health = await readMixItUpHealth();
  const obs = await readObs();
  const watchdogAt = await readWatchdogAt();
  const bridges = await listBridges();
  const now = Date.now();
  const setupLabel = bridges.length > 0 || Object.values(health.seen).some(s => s.okAt) ? 'Run setup again' : 'Set up Mix It Up';
  const cards = statusCards({ health, settings, bridge, paired: bridges.length, obs, now, ago: timeAgo, watchdogAt });
  const checklist = await readChecklist();
  const strip = statusStrip(cards, checklist, now);
  const subs = SUB_TABS[section];
  const live = async () => {
    const [log, cmdLog] = [await getMixItUpLog(), await getCommandLog()];
    const items = mergeFeed(log, cmdLog, await getEventFeed(), FEED_LIMIT);
    const f = pickFeedFilter(feed);
    return (
      <Live
        numbers={streamNumbers(log, cmdLog, (await kv.get<number>('twitch:live:since')) || null, now)}
        feed={filterFeed(items, f)} filter={f} feedTotal={items.length} now={now}
        pulls={{ streamExtra: streamBuffAmount(await getStreamBuff(), await currentStreamKey()), paused: await isPullsPaused(), pauseReason: await pauseReason(), pauseChat: await pauseChatOn(), awardsOff: await awardsPaused() }}
        happyHour={await happyHourView(now)} packGoal={await packGoalView()}
        queue={(await readQueue(now)).map(q => ({ id: q.id, kind: q.kind, username: q.username, pack: q.pack, waited: q.waitedS >= 60 ? `${Math.floor(q.waitedS / 60)} min` : `${q.waitedS} s` }))}
        blocks={(await listPullBlocks()).map(b => ({ username: b.username, by: b.by, scope: b.streamKey ? 'this stream' : 'until lifted' }))}
        obsPaired={bridges.length > 0}
      />
    );
  };
  const history = async () => {
    const uptime = await readUptime();
    return (
      <div className="space-y-6">
        <LedgerCheckPanel check={await readLedgerCheck()} when={timeAgo} />
        <MixItUpLog log={[...(await getMixItUpLog()), ...(await getCommandLog())].sort((a, b) => b.at - a.at)} filter={pickLogFilter(filter)} now={now} />
        {uptime.length > 0 && (
          <Panel title="Uptime" icon="activity" hint="TCG Bridge, Mix It Up and OBS during each of the last streams. Grey is a time nobody reported.">
            <div className="space-y-4">{[...uptime].reverse().map(u => <UptimeStrip key={u.from} s={u} now={now} />)}</div>
          </Panel>
        )}
      </div>
    );
  };
  const viewers = async () => {
    const [defs, season, commands, points, awards, hook, viaBridge] = await Promise.all([getBuffDefs(), getActiveSeasonWithPacks(), getCommands(), card === 'points' ? fetchRewards() : null, readAwards(), getWebhookSettings(), twitchHandlesEvent(CHAT_EVENT)]);
    const packs = (season?.packs ?? []).filter(p => p.cards.length > 0).map(p => ({ id: p.pack.id, name: p.pack.name, price: p.pack.price }));
    const deck = defs.filter(b => b.streamDeck);
    const summaries = cardSummaries({
      settings, packCount: packs.length, commands, deckBuffs: deck.map(b => b.name),
      rewardIds: !points ? null : points.ok ? points.rewards.map(r => r.id) : [], awardIds: Object.keys(awards),
    });
    const open = card && CARDS.find(c => c.id === card);
    return (
      <div className="space-y-6">
        <CommandsHelper address={`${SITE_URL}/api/webhooks`} secret={hook.incomingSecret}
          groups={helperGroups({ commands, deckBuffs: deck.map(b => ({ id: b.id, name: b.name, community: b.scope === 'community', note: describeBuffDef(b) })) })} />
        {!open ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="What viewers get">
            {CARDS.map(c => (
              <li key={c.id}>
                <Link href={cardHref(c.id)} className="card rounded-2xl p-5 h-full block space-y-2 hover:border-yellow-500/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-400">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white flex items-center gap-2"><Icon name={c.icon} className="text-yellow-400" />{c.label}</span>
                    <Chip tone={summaries[c.id].on ? 'green' : 'gray'}>{summaries[c.id].on ? 'On' : 'Off'}</Chip>
                  </span>
                  <span className="block text-sm text-gray-300">{summaries[c.id].text}</span>
                  <span className="block text-xs font-semibold text-yellow-400">Edit</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <>
            {card === 'paid' && <PaidCard settings={settings} />}
            {card === 'packs' && <PacksCard settings={settings} packs={packs} />}
            {card === 'events' && <EventsCard rewards={settings.eventRewards} buffs={defs} />}
            {card === 'shoutout' && <ShoutoutCard rewards={settings.eventRewards} />}
            {card === 'points' && points && <ChannelPoints list={points} awards={awards} buffs={defs} paused={await awardsPaused()} />}
            {card === 'startend' && <StartEndCard chat={settings.chat} />}
            {card === 'bigpulls' && <PullRules rules={settings.pullRules} commands={bridge.commands} obs={{ scenes: obs?.scenes ?? [], sources: obs?.sources ?? [] }} />}
            {card === 'commands' && (
              <CardFrame id="commands" how={<p>One webhook answers every command; the reply is built from the variables you add. Download a command from the Mix It Up commands box above and import it in Mix It Up (the saved command, not unsaved edits).</p>}>
                <CommandsPanel initial={commands} stats={await getCommandStats()} viaBridge={viaBridge} />
              </CardFrame>
            )}
            {card === 'streamdeck' && <StreamDeckCard buffs={defs} />}
          </>
        )}
      </div>
    );
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Stream" subtitle={SECTION_HINT[section]} />
      <StatusStrip strip={strip} />
      <PageTabs tabs={SECTIONS} active={section} base="/admin/stream" param="section" label="Stream sections" />
      {subs && <PageTabs tabs={subs} active={tab!} base="/admin/stream" keep={{ section }} label={`${SECTIONS.find(x => x.id === section)!.label} pages`} />}

      {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-2.5 text-sm text-red-300">Not saved: {error}</div>}
      {note && <div role="status" className="rounded-lg border border-green-500/30 bg-green-950/30 px-4 py-2.5 text-sm text-green-300">{note}</div>}
      {saved === 'mixitup' && (
        <div role="status" className="rounded-lg border border-green-500/30 bg-green-950/30 px-4 py-2.5 text-sm text-green-300 flex items-center gap-2">
          <Icon name="check" /> Mix It Up saved.
        </div>
      )}

      {section === 'live' && await live()}
      {section === 'connections' && (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">{cards.map(c => <Card key={c.id} card={c} />)}</div>
          <Link href="/admin/stream/setup" className="btn btn-primary btn-sm"><Icon name="wrench" />{setupLabel}</Link>
          <ConnectionTab settings={settings} bridge={bridge} bridges={bridges.map(b => ({ id: b.id, name: b.name, paired: timeAgo(b.createdAt), seen: b.lastSeen ? timeAgo(b.lastSeen) : 'never', staff: isStaffPc(b), account: bridgeAccount(b), by: b.by ?? '' }))} commandCheck={await readCommandCheck(await getBuffDefs())} errors={{ rows: (await readErrors()).map(e => ({ ...e, ago: timeAgo(e.at) })), days: await errorDays() }} twitch={await twitchView()} twitchReady={channelConnectReady()} />
          {tab === 'connection' && <div className="grid gap-6 lg:grid-cols-2"><WatchdogPanel on={settings.overlayWatchdog} /><BrieBucksSafetyPanel chat={settings.chat} /></div>}
        </div>
      )}
      {section === 'test' && (
        <div className="space-y-6">
          <Panel title="Test pulls" icon="flask" hint="Pretend a test viewer typed !pack in chat and watch every step: the balance check, the charge, the overlay, the save and the rules. The edition is kept apart from the real collection and counts nowhere. Test viewers are managed under Connections.">
            <TestPulls viewers={settings.testViewers} paidOn={settings.enabled} sandbox={await inSandbox()} recent={await recentTests()} />
          </Panel>
          <Panel title="Quick tests" icon="zap" hint="Each one shows its answer right here.">
            <TestActions login={CHANNEL_LOGIN} />
          </Panel>
          <ChecklistPanel checklist={checklist} now={now} />
        </div>
      )}
      {section === 'history' && await history()}
      {section === 'viewers' && await viewers()}
    </div>
  );
}
