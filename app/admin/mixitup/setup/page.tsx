import Link from 'next/link';
import { staffPage } from '@/lib/staff-guard';
import { Icon } from '@/app/components/Icon';
import { PendingButton } from '@/app/components/PendingButton';
import { PageHeader, Panel, selectClass } from '../../components/ui';
import { getMixItUpSettings } from '@/lib/mixitup';
import { readMixItUpHealth } from '@/lib/mixitup-health';
import { statusCards } from '@/lib/mixitup-page';
import { incomingSetup, packSetup } from '@/lib/mixitup-setup';
import { STEPS, pickStep, stepsDone, type StepId } from '@/lib/mixitup-wizard';
import { listBridges, readBridge, readObs } from '@/lib/bridge';
import { bridgeAccount, isStaffPc } from '@/lib/bridge-core';
import { getWebhookSettings } from '@/lib/webhooks';
import { twitchHandlesEvent } from '@/lib/twitch-eventsub';
import { CHAT_EVENT, CHAT_VIA_BRIDGE } from '@/lib/twitch-chat-core';
import { SITE_URL } from '@/lib/site';
import { timeAgo } from '@/lib/site-data';
import { BridgeCard } from '../BridgeCard';
import { Card } from '../Overview';
import { Quick } from '../OverviewActions';
import { PaidPullFields } from '../PaidPullFields';
import { saveConnectionAction, saveMixItUpAction } from '../mixitup-actions';
import { testBalanceAction } from '../overview-actions';
import { AutoRefresh, CopyCard } from './SetupClient';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata = { title: 'Mix It Up setup · Admin', robots: { index: false } };

const RETURN = <input type="hidden" name="returnTo" value="setup" />;
const help = 'text-[11px] text-gray-500 leading-relaxed';

/** Mix It Up → Set up (ROADMAP 55.1): one step per screen. The saved settings and the health data are the state, so every step can be revisited and reopening lands on the first step not done. */
export default async function MixItUpSetupPage({ searchParams }: { searchParams: Promise<{ step?: string; note?: string; error?: string }> }) {
  await staffPage('admin');
  const { step: stepParam, note, error } = await searchParams;
  const [settings, bridge, bridges, health, obs, secret] = await Promise.all([
    getMixItUpSettings(), readBridge(), listBridges(), readMixItUpHealth(), readObs(), getWebhookSettings().then(w => w.incomingSecret),
  ]);
  const now = Date.now();
  const cards = statusCards({ health, settings, bridge, paired: bridges.length, obs, now, ago: timeAgo });
  const done = stepsDone(cards, health, settings.enabled);
  const step = pickStep(stepParam, done);
  const at = STEPS.findIndex(s => s.id === step);
  const go = (i: number) => `/admin/mixitup/setup?step=${STEPS[i].id}`;
  const [incoming, outgoing, obsCard] = cards;
  const bridgeMode = settings.connection === 'bridge';
  const pack = packSetup(SITE_URL, secret);
  const viaBridge = await twitchHandlesEvent(CHAT_EVENT);

  return (
    <div className="space-y-6">
      <PageHeader title="Set up Mix It Up" subtitle="One step at a time. Your saved settings are the progress, so you can leave and come back." back={{ href: '/admin/mixitup', label: 'Mix It Up' }} />

      <nav aria-label="Steps" className="flex gap-2 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <Link key={s.id} href={go(i)} aria-current={s.id === step ? 'step' : undefined}
            className={`btn btn-sm shrink-0 gap-1.5 ${s.id === step ? 'btn-primary' : 'btn-ghost'}`}>
            {done[s.id] ? <Icon name="checkCircle" className="text-green-400" /> : <span className="font-bold">{i + 1}</span>}
            {s.label}
          </Link>
        ))}
      </nav>

      {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-2.5 text-sm text-red-300">Not saved: {error}</div>}
      {note && <div role="status" className="rounded-lg border border-green-500/30 bg-green-950/30 px-4 py-2.5 text-sm text-green-300">{note}</div>}

      {step === 'need' && (
        <Panel title="What you need" icon="list">
          <ul className="list-disc pl-5 space-y-2 text-sm text-gray-300">
            <li>Mix It Up running on the stream PC.</li>
            <li>For paid pulls and Brie Bucks: <strong>TCG Bridge</strong>, a small app on the same PC. The site reaches Mix It Up through it, so you need no public address. (Direct public https addresses still exist under Advanced on the Connection tab.)</li>
            <li>For the Stream Deck: the Mix It Up plugin from the Elgato store, and Mix It Up&rsquo;s Developer API service switched on. The buttons are on the <Link href="/admin/mixitup?tab=streamdeck" className="link">Stream Deck tab</Link>.</li>
          </ul>
        </Panel>
      )}

      {step === 'incoming' && (
        <>
          {viaBridge && <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-4 py-2.5 text-sm text-emerald-300">{CHAT_VIA_BRIDGE} This step is optional.</p>}
          <Panel title={viaBridge ? 'Make the !pack command (optional)' : 'Make the !pack command'} icon="chat" hint="Mix It Up tells the site when someone types !pack. The secret is already made for you and sits in the body below.">
            <ol className="list-decimal pl-5 space-y-1 text-xs text-gray-400">
              <li>In Mix It Up make a Chat Command <strong>!pack</strong> and add a <strong>Web Request</strong> action: method POST, content type JSON.</li>
              <li>Paste the address and the body below. <code>$allargs</code> is what the viewer typed after !pack (<code>!pack Base</code> opens the Base pack); empty means the usual random pack. <code>requestId</code> is a new number on every run, so a retried request never opens a second pack.</li>
              <li>In the Web Request action set the response to <strong>JSON to special identifiers</strong> and map <code>message</code> to <code>reply</code>, then add a <strong>Chat Message</strong> that says <code>$reply</code> (<code>left</code> and <code>balance</code> can be mapped the same way when known).</li>
            </ol>
            <p className={help}>Or skip the steps: download the finished command and import it in Mix It Up.</p>
            <CopyCard title="!pack" url={pack.url} body={pack.body} download={pack.preset} />
          </Panel>
          <Card card={incoming} />
          <p role="status" className="text-sm text-gray-200">
            {incoming.tone === 'ok' ? 'Mix It Up reached the site. This step is done.'
              : incoming.tone === 'warn' ? 'Mix It Up reached the site but the secret did not match. Copy the body above into the command again.'
              : viaBridge ? 'Optional: chat commands already come through TCG Bridge.' : 'Type !pack in chat now.'}
          </p>
          {incoming.tone !== 'ok' && !viaBridge && <AutoRefresh />}
        </>
      )}

      {step === 'outgoing' && (
        <>
          {bridgeMode ? (
            <>
              <BridgeCard version={bridge.appVersion} bridges={bridges.map(b => ({ id: b.id, name: b.name, paired: timeAgo(b.createdAt), seen: b.lastSeen ? timeAgo(b.lastSeen) : 'never', staff: isStaffPc(b), account: bridgeAccount(b), by: b.by ?? '' }))} />
              <Card card={outgoing} />
              {outgoing.tone !== 'ok' && <AutoRefresh />}
              {bridge.currencies.length > 0 && (
                <form action={saveConnectionAction}>
                  {RETURN}
                  <input type="hidden" name="connection" value="bridge" />
                  <Panel title="Currency" icon="coins" hint="The Mix It Up currency viewers pay with. The list comes from TCG Bridge.">
                    <fieldset className="fieldset sm:max-w-sm">
                      <legend className="fieldset-legend"><label htmlFor="wz-currency">Currency</label></legend>
                      <select id="wz-currency" name="currencyId" defaultValue={settings.currencyId} className={`${selectClass} w-full`}>
                        <option value="">Choose a currency</option>
                        {bridge.currencies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </fieldset>
                    <PendingButton type="submit" className="btn btn-primary btn-sm self-start">Save currency</PendingButton>
                  </Panel>
                </form>
              )}
            </>
          ) : (
            <Panel title="Direct addresses" icon="link" hint="You use direct addresses instead of TCG Bridge.">
              <Card card={outgoing} />
              <Link href="/admin/mixitup?tab=connection" className="link link-primary text-sm font-semibold">Change them on the Connection tab</Link>
            </Panel>
          )}
          <Panel title="Test it" icon="zap">
            <Quick title="Test a balance check" text="Asks Mix It Up for the streamer's balance. Nothing is charged." icon="coins" label="Check my balance" pendingLabel="Asking…" run={testBalanceAction} />
          </Panel>
          <Panel title="OBS" icon="eye" hint="TCG Bridge watches OBS and can refresh the overlay. Optional.">
            <Card card={obsCard} />
            <p className={help}>In TCG Bridge switch on &ldquo;Talk to OBS&rdquo; and type the OBS WebSocket password (OBS: Tools, WebSocket Server Settings). The overlay should then show as visible here.</p>
          </Panel>
        </>
      )}

      {step === 'rules' && (
        <form action={saveMixItUpAction} className="space-y-6">
          {RETURN}
          <Panel title="Pull rules" icon="coins" hint="Skip this if viewers pull for free: leave the switch off.">
            <label className="flex items-center gap-2 text-sm text-white font-semibold">
              <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="toggle toggle-sm toggle-primary" />
              Charge for pulls
            </label>
          </Panel>
          <PaidPullFields settings={settings} />
          <PendingButton type="submit" className="btn btn-primary btn-sm self-start">Save pull rules</PendingButton>
        </form>
      )}

      {step === 'events' && (
        <Panel title="Stream start and end" icon="radio" hint="Optional. Tells the site the stream is live straight away instead of a minute or two later. Add a Web Request action to each of Mix It Up's Stream Start and Stream End events (POST, JSON).">
          {([['Stream start', 'live'], ['Stream end', 'offline']] as const).map(([title, event]) => (
            <CopyCard key={event} title={title} {...incomingSetup(`${SITE_URL}/api/webhooks/stream`, secret, { event })}
              download={{ kind: 'event', name: title, path: 'stream', fields: { event }, event }} />
          ))}
          <p className={help}>{done.events ? 'The site has heard from the stream events.' : 'Nothing has come in from these yet.'} Stream Deck buttons are on the <Link href="/admin/mixitup?tab=streamdeck" className="link">Stream Deck tab</Link>.</p>
        </Panel>
      )}

      {step === 'done' && (
        <Panel title="What is connected" icon="checkCircle">
          <ul className="space-y-2 text-sm">
            {([
              ['incoming', 'Mix It Up reaches the site', done.incoming],
              ['outgoing', 'The site reaches Mix It Up', done.outgoing],
              ['outgoing', 'OBS and the overlay', obsCard.tone === 'ok'],
              ['rules', 'Paid pulls are on', done.rules],
              ['events', 'Stream start and end', done.events],
            ] as [StepId, string, boolean][]).map(([id, label, ok]) => (
              <li key={label} className="flex flex-wrap items-center gap-2">
                <Icon name={ok ? 'checkCircle' : 'info'} className={ok ? 'text-green-400' : 'text-gray-500'} />
                <span className={ok ? 'text-white' : 'text-gray-400'}>{label}</span>
                {!ok && <Link href={`/admin/mixitup/setup?step=${id}`} className="link link-primary text-xs font-semibold">Set up</Link>}
              </li>
            ))}
          </ul>
          <p className={help}>Optional ones (OBS, paid pulls, stream events) can stay empty.</p>
          <Link href="/admin/mixitup" className="btn btn-primary btn-sm self-start">Back to Mix It Up</Link>
        </Panel>
      )}

      <div className="flex justify-between gap-3">
        {at > 0 ? <Link href={go(at - 1)} className="btn btn-sm btn-outline"><Icon name="chevronLeft" />Back</Link> : <span />}
        {at < STEPS.length - 1 && <Link href={go(at + 1)} className="btn btn-sm btn-primary">Next<Icon name="chevronRight" /></Link>}
      </div>
    </div>
  );
}
