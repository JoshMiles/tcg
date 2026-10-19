import { Icon, type IconName } from '@/app/components/Icon';
import { redirect } from 'next/navigation';
import { getActiveSeasonWithPacks } from '@/lib/kv';
import { CopyableUrl } from '../components/copyable-url';
import { PageTabs, pickTab, type PageTab } from '../components/PageTabs';
import { OverlayStatus } from '../components/OverlayStatus';
import { getBuildInfo } from '@/lib/version';
import { getOverlaySettings } from '@/lib/overlay-settings';
import { saveScoringSettingsAction, resetScoringSettingsAction, saveAchievementSettingsAction } from '../actions/settings';
import { getAchievementSettings } from '@/lib/achievement-settings';
import { AchievementsForm } from './AchievementsForm';
import { getScoringSettings, DEFAULT_SCORING, type ScoringSettings } from '@/lib/scoring';
import { DiscordConfig } from './DiscordConfig';
import { getOverlayKey, overlayUrl } from '@/lib/overlay-key';
import { ConfirmButton } from '../components/ConfirmButton';
import { regenerateOverlayKeyAction } from './overlay-key-actions';
import { WebhookConfig } from './WebhookConfig';
import { AccessConfig } from './AccessConfig';
import { getAccessLog, getAccessSettings, listTesters } from '@/lib/access';
import { ScoringForm, type ScoringGroupConfig } from './ScoringForm';
import { CopyBlock, LiveGates, OverlayTest } from './OverlayPanels';
import { getWebhookSettings } from '@/lib/webhooks';
import { getDiscordLog, getDiscordSettings } from '@/lib/discord';
import { ENV_GROUPS, checkEnv, readEnv, summarizeEnv } from '@/lib/env-health';
import { extensionChecklist } from '@/lib/twitch-setup';
import { SITE_URL } from '@/lib/site';
import { Chip, Panel, Tile, PageHeader } from '../components/ui';
import { SerialsPanel } from './SerialsPanel';
import { PreviewDataPanel } from './PreviewDataPanel';
import { BackupsPanel } from './BackupsPanel';
import { DataHealthPanel } from './DataHealthPanel';
import { isPreview } from '@/lib/db';

export const metadata = { title: 'Settings · Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';

const TABS: (PageTab & { hint: string })[] = [
  { id: 'overlay', label: 'OBS Overlay', icon: 'tv', hint: 'Browser source, connection and bot triggers' },
  { id: 'scoring', label: 'Scoring', icon: 'trophy', hint: 'Card values, bonuses and the leaderboard, with a live preview' },
  { id: 'achievements', label: 'Achievements', icon: 'award', hint: 'Switch built-in goals off, or replace their title and detail' },
  { id: 'webhooks', label: 'Webhooks', icon: 'link', hint: 'Discord feed, MixItUp integration: incoming triggers and outgoing events' },
  { id: 'access', label: 'Access', icon: 'lock', hint: 'Lock the site to testers during alpha / beta, label it, and manage the testers list' },
  { id: 'viewers', label: 'Twitch & viewers', icon: 'users', hint: 'The extension setup checklist and the collection page' },
  { id: 'environment', label: 'Environment', icon: 'shield', hint: 'Which secrets and keys are configured, and what each one unlocks' },
  { id: 'about', label: 'About', icon: 'info', hint: 'Build info and the active season' },
];

const SAVED_MESSAGES: Record<string, string> = {
  scoring: 'Scoring saved. The leaderboard and card values now use the new numbers.',
  achievements: 'Achievements saved. Switched-off goals are no longer earned. Ones already earned stay.',
  'scoring-reset': 'Scoring reset to the defaults.',
  serials: 'Done. Existing prints are numbered, and every print has a print number.',
  'preview-seeded': 'Copied the live setup into this preview.',
  'preview-wiped': 'Preview data wiped.',
  backup: 'Backup finished.',
  webhook: 'Webhook saved.',
  'overlay-key': 'New overlay key made. Paste the new address into every OBS browser source.',
  'webhook-secret': 'Incoming webhook secret regenerated. Update the URL in MixItUp.',
};

const SCORING_GROUPS: ScoringGroupConfig[] = [
  { title: 'Card values', fields: [
    { name: 'baseScore', label: 'Base score', help: 'Points one Regular print of an average card is worth. Scales every card value (and the bonuses, which are measured against card values).' },
    { name: 'rarityExponent', label: 'Rarity strength', help: 'How strongly rarity counts. 1 = a card half as likely is worth twice as much; below 1 flattens the gap between common and rare, above 1 widens it.' },
  ] },
  { title: 'Edition bonus (the first prints of a card are worth more)', fields: [
    { name: 'serialBonusMax', label: 'Edition #1 multiplier (×)', help: 'What the very first print ever made of a card (in each version) is worth compared with a normal print. 3 = triple. 1 = no bonus.' },
    { name: 'serialBonusCutoff', label: 'Editions that get a bonus', help: 'The bonus fades in a straight line from edition #1 down to nothing after this edition. 40 = editions #1 to #40 earn a bonus. 0 switches the bonus off.' },
  ] },
  { title: 'Upgrades', fields: [
    { name: 'upgradeMargin', label: 'Upgrade margin (×)', help: 'An upgraded print is worth at least this many times the prints spent to make it. 1.2 = 20% more.' },
  ] },
  { title: 'Set bonuses (% of the set value)', fields: [
    { name: 'completionBonusPct', label: 'Progress bonus (%)', help: 'Earned in proportion to how much of the set you own; this is the amount at 100%. 25 = a quarter of the set value.' },
    { name: 'completeSetBonusPct', label: 'Full set bonus (%)', help: 'Extra, for owning at least one of every card. 50 = half the set value.' },
  ] },
  { title: 'Leaderboard', fields: [
    { name: 'leaderboardSize', label: 'Collectors listed', help: 'How many collectors the leaderboard page and the Twitch panel show.' },
  ] },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; saved?: string; backupError?: string; error?: string; note?: string }> }) {
  const { tab: tabParam, saved, backupError, error, note, q } = await searchParams;
  // The overlay layout and look now live in the Overlay Editor (old links keep working).
  if (tabParam === 'mixitup') redirect('/admin/mixitup');
  if (tabParam === 'layout' || tabParam === 'look') redirect('/admin/overlay');
  const tab = pickTab(TABS, tabParam);

  const build = getBuildInfo();
  const env = checkEnv(readEnv());
  const envSummary = summarizeEnv(env);
  const envSet = (name: string) => env.find(e => e.name === name)?.set ?? false;
  const overlayKey = await getOverlayKey();
  const [overlay, scoring, webhookSettings, discordSettings, result] = await Promise.all([
    getOverlaySettings(), getScoringSettings(), getWebhookSettings(), getDiscordSettings(), getActiveSeasonWithPacks(),
  ]);
  const discordLogs = Object.fromEntries(await Promise.all(discordSettings.channels.map(async c => [c.id, await getDiscordLog(c.id)] as const)));
  const scoringChanged = (Object.keys(DEFAULT_SCORING) as (keyof ScoringSettings)[]).filter(k => scoring[k] !== DEFAULT_SCORING[k]).length;
  const outgoingOn = Object.values(webhookSettings.outgoing).filter(w => w.enabled && w.url).length;
  const discordOn = discordSettings.enabled && discordSettings.channels.some(c => c.enabled && !!c.url);
  const checklist = extensionChecklist(SITE_URL);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle={TABS.find(t => t.id === tab)?.hint} />

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <Tile icon="shield" label="Environment" value={envSummary.ready ? 'Ready' : `${envSummary.requiredMissing} required missing`} sub={envSummary.recommendedMissing > 0 ? `${envSummary.recommendedMissing} recommended not set` : 'everything set'} tone={!envSummary.ready ? 'red' : envSummary.recommendedMissing > 0 ? 'amber' : 'green'} />
        <Tile icon="tv" label="Twitch extension" value={envSet('TWITCH_EXTENSION_SECRET') ? 'Secret set' : 'No secret'} sub={envSet('TWITCH_CLIENT_ID') && envSet('TWITCH_CLIENT_SECRET') ? 'Twitch API keys set' : 'Twitch API keys missing'} tone={envSet('TWITCH_EXTENSION_SECRET') ? 'green' : 'red'} />
        <Tile icon="trophy" label="Scoring" value={scoringChanged === 0 ? 'Defaults' : `${scoringChanged} changed`} sub="applies to every season" tone={scoringChanged > 0 ? 'amber' : undefined} />
        <Tile icon="link" label="Webhooks" value={discordOn || outgoingOn > 0 ? 'Active' : 'Off'} sub={`Discord ${discordOn ? 'on' : 'off'} · ${outgoingOn} outgoing`} tone={discordOn || outgoingOn > 0 ? 'green' : undefined} />
        <Tile icon="info" label="Build" value={`v${build.version}`} sub={`${build.commit}${build.env !== 'production' ? ` · ${build.env}` : ''}`} />
      </div>

      <PageTabs tabs={TABS} active={tab} base="/admin/settings" label="Settings sections" />

      {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-2.5 text-sm text-red-300">Not saved: {error}</div>}
      {backupError && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-950/30 px-4 py-2.5 text-sm text-red-300">Backup failed: {backupError}</div>}
      {note && <div role="status" className="rounded-lg border border-green-500/30 bg-green-950/30 px-4 py-2.5 text-sm text-green-300">{note}</div>}
      {saved && SAVED_MESSAGES[saved] && (
        <div role="status" className="rounded-lg border border-green-500/30 bg-green-950/30 px-4 py-2.5 text-sm text-green-300 flex items-center gap-2">
          <Icon name="check" /> {SAVED_MESSAGES[saved]}
        </div>
      )}

      {/* OBS overlay */}
      {tab === 'overlay' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 items-start *:min-w-0">
          <div className="space-y-6">
            <Panel title="Browser source" icon="tv" hint={`Add this as a Browser Source in OBS, sized as recommended in the Overlay Editor (${overlay.layout.width} × ${overlay.layout.height}).`}>
              <CopyableUrl url={overlayUrl(SITE_URL, overlayKey)} />
              <p className="text-xs text-gray-600">The <code className="text-gray-500">key</code> in the address is what lets the overlay take pulls from the queue, so keep this address private. Append <code className="text-gray-500">&amp;dev</code> to show the on-screen test panel. After a deploy, right-click the source in OBS and choose Refresh cache of current page.</p>
              <form action={regenerateOverlayKeyAction} className="pt-1">
                <ConfirmButton title="Make a new overlay key?" message="The old address stops working at once. Paste the new address into every OBS browser source (and each scene's address from the Overlay Editor), or pulls will not play." confirmLabel="Make a new key" className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:border-gray-500">Make a new key</ConfirmButton>
              </form>
            </Panel>
            <Panel title="Connection" icon="radio" hint="The overlay checks in every 10 seconds, so this and the sidebar show whether it is open.">
              <OverlayStatus />
              <p className="text-xs text-gray-500 leading-relaxed">
                To also show when you&apos;re <strong className="text-gray-300">live</strong>, open the browser source&apos;s properties in OBS and set <strong className="text-gray-300">Page permissions</strong> to{' '}
                <em className="text-gray-300">“Read access to OBS status information”</em>. Without it the overlay still reports as connected, but its stream status stays unknown.
              </p>
              <div className="pt-1"><OverlayTest /></div>
            </Panel>
          </div>
          <div className="space-y-6">
            <Panel title="Only when live" icon="zap" hint="Saved as soon as you flip a switch.">
              <LiveGates packsOnly={overlay.livePacksOnly} collectionsOnly={overlay.liveCollectionsOnly} />
            </Panel>
            <Panel title="Bot / channel points" icon="chat" hint="Call these from your Twitch bot, or from the Browser Source's Custom JavaScript field in OBS.">
              <CopyBlock label="Custom JavaScript" code={`// Draw a card for a viewer\nqueueDraw('username');\n\n// Show a viewer's collection\nqueueCollection('username');\n\n// Show off a card (skips the ownership check, so use it for testing only)\nqueueShowCard('username', { cardNumber: 5, variant: 'shiny', serial: 3 });`} />
              <p className="text-xs text-gray-500 leading-relaxed pt-2">
                <strong className="text-gray-300">Show off a card from chat.</strong> Point a chat command (e.g. <code className="text-gray-300">!show shiny gouda</code>) at{' '}
                <code className="text-gray-300">POST /api/webhooks/show-card</code> with the JSON body <code className="text-gray-300">{'{ "secret": "…", "username": "viewer", "card": "shiny gouda" }'}</code>{' '}
                (same secret as the other incoming webhooks). The server checks the viewer owns the card; <code className="text-gray-300">card</code> can be a name, a number, with a version word first (shiny, full art, reverse holo), or empty for their most valuable card.
                The reply has a <code className="text-gray-300">message</code> your bot can say in chat. Each viewer can show off once every 15 seconds.
              </p>
            </Panel>
          </div>
        </div>
      )}

      {/* Webhooks & Discord */}
      {tab === 'webhooks' && (
        <div className="space-y-8">
          <DiscordConfig settings={discordSettings} logs={discordLogs} />
          <WebhookConfig settings={webhookSettings} base={SITE_URL} />
        </div>
      )}

      {tab === 'access' && <AccessConfig settings={await getAccessSettings()} testers={await listTesters()} log={await getAccessLog()} filter={q ?? ''} />}

      {/* Scoring */}
      {tab === 'scoring' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400 leading-relaxed max-w-4xl">
            Tune how cards are valued and how the leaderboard is scored. Changes apply <strong className="text-white">immediately to every season</strong>: the leaderboard, card values, My Stats and the FAQ all
            recompute from these numbers. The defaults match the original scoring, except the print-bonus cutoff, which starts at 40. A number already saved here is left as it is. The preview shows what the numbers you type would do before anything is saved.
          </p>
          <ScoringForm saved={scoring} groups={SCORING_GROUPS} save={saveScoringSettingsAction} reset={resetScoringSettingsAction} />
        </div>
      )}

      {tab === 'achievements' && <AchievementsForm settings={await getAchievementSettings()} save={saveAchievementSettingsAction} />}

      {/* Twitch & viewers */}
      {tab === 'viewers' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 items-start *:min-w-0">
          <div className="space-y-6">
            {(['Extension views', 'Policies', 'Allowlists'] as const).map(group => (
              <Panel key={group} title={group === 'Allowlists' ? 'Allowlist' : group === 'Policies' ? 'Policy links' : 'Extension views'} icon={group === 'Extension views' ? 'tv' : group === 'Policies' ? 'book' : 'lock'}
                hint={group === 'Extension views' ? <>Enter these in your extension on <a href="https://dev.twitch.tv/console/extensions" target="_blank" rel="noreferrer" className="text-purple-400 hover:text-purple-300">dev.twitch.tv</a>. Panel changes only reach viewers after a production deploy.</> : undefined}>
                {checklist.filter(i => i.group === group).map(i => (
                  <div key={i.id} className="space-y-1.5">
                    <p className="text-sm text-gray-200 font-medium">{i.label}</p>
                    <CopyableUrl url={i.value} />
                    <p className="text-xs text-gray-600">{i.hint}</p>
                  </div>
                ))}
              </Panel>
            ))}
          </div>
          <div className="space-y-6">
            <Panel title="Website login" icon="user" hint="“Log in with Twitch” on the website. Needs the Twitch API keys and a session secret.">
              {checklist.filter(i => i.group === 'Website login').map(i => (
                <div key={i.id} className="space-y-1.5">
                  <p className="text-sm text-gray-200 font-medium">{i.label}</p>
                  <CopyableUrl url={i.value} />
                  <p className="text-xs text-gray-600">{i.hint}</p>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 pt-1">
                {(['TWITCH_EXTENSION_SECRET', 'TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'SESSION_SECRET'] as const).map(n => (
                  <Chip key={n} tone={envSet(n) ? 'green' : 'red'}><Icon name={envSet(n) ? 'check' : 'x'} className="mr-1 w-3 h-3" />{n}</Chip>
                ))}
              </div>
              <p className="text-xs text-gray-600">Full detail on the Environment tab.</p>
            </Panel>
            <Panel title="Viewer collection page" icon="cards" hint="Share this so viewers can look up their collection. Append a username to go straight to their cards.">
              <CopyableUrl url={`${SITE_URL}/collection`} />
              <p className="text-xs text-gray-600">Direct link example: <code className="text-gray-500">{SITE_URL}/collection/username</code></p>
            </Panel>
            <SerialsPanel />
          </div>
        </div>
      )}

      {/* Environment */}
      {tab === 'environment' && (
        <div className="space-y-4">
          {isPreview() && <PreviewDataPanel />}
          <BackupsPanel />
          <DataHealthPanel />
          <div className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-3 ${envSummary.ready ? (envSummary.recommendedMissing > 0 || envSummary.weak > 0 ? 'border-amber-500/30 bg-amber-950/20 text-amber-200' : 'border-green-500/30 bg-green-950/20 text-green-300') : 'border-red-500/30 bg-red-950/20 text-red-300'}`}>
            <Icon name={envSummary.ready && envSummary.recommendedMissing === 0 && envSummary.weak === 0 ? 'checkCircle' : 'warning'} className="mt-0.5 shrink-0" />
            <p className="leading-relaxed">
              {!envSummary.ready ? <>{envSummary.requiredMissing} required variable{envSummary.requiredMissing === 1 ? ' is' : 's are'} missing, so parts of the app will not work.</>
                : envSummary.recommendedMissing > 0 ? <>Everything required is set. {envSummary.recommendedMissing} recommended variable{envSummary.recommendedMissing === 1 ? ' is' : 's are'} not set, so some features are switched off.</>
                : envSummary.weak > 0 ? <>Everything is set, but {envSummary.weak} secret{envSummary.weak === 1 ? ' looks' : 's look'} short. Use something longer.</>
                : <>Everything is configured.</>}
              {' '}Values are never shown here. Change them in Vercel → Project → Settings → Environment Variables, then <strong>redeploy</strong> (changes only apply to new deployments).
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 items-start *:min-w-0">
            {ENV_GROUPS.map(group => {
              const rows = env.filter(e => e.group === group);
              if (rows.length === 0) return null;
              return (
                <section key={group} className="card rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-800"><h2 className="font-semibold text-white">{group}</h2></div>
                  <ul className="divide-y divide-gray-800/60">
                    {rows.map(e => (
                      <li key={e.name} className="px-5 py-3 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="text-sm text-gray-100">{e.name}</code>
                          {e.set ? (e.weak ? <Chip tone="amber">set, short</Chip> : <Chip tone="green">set</Chip>) : <Chip tone={e.level === 'required' ? 'red' : e.level === 'recommended' ? 'amber' : 'gray'}>not set</Chip>}
                          <span className="text-[10px] uppercase tracking-wider text-gray-600 font-bold ml-auto">{e.level}</span>
                        </div>
                        <p className="text-xs text-gray-500 leading-relaxed">{e.unlocks}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* About */}
      {tab === 'about' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 items-start *:min-w-0">
          <Panel title="Build" icon="info">
            <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-gray-500">Version</dt><dd className="text-white font-mono">v{build.version}</dd>
              <dt className="text-gray-500">Commit</dt>
              <dd className="font-mono">{build.commitUrl ? <a href={build.commitUrl} target="_blank" rel="noreferrer" className="text-purple-400 hover:text-purple-300 transition-colors">{build.commit}</a> : <span className="text-gray-300">{build.commit}</span>}</dd>
              {build.branch && (<><dt className="text-gray-500">Branch</dt><dd className="text-gray-300 font-mono">{build.branch}</dd></>)}
              <dt className="text-gray-500">Environment</dt><dd className="text-gray-300">{build.env}</dd>
              {build.builtAt && (<><dt className="text-gray-500">Built</dt><dd className="text-gray-300">{new Date(build.builtAt).toLocaleString()}</dd></>)}
            </dl>
            <p className="text-xs text-gray-600">The same version shows on the Twitch panel, so you can confirm viewers are on the latest deploy. Bump the number in <code className="text-gray-500">package.json</code>; the commit updates automatically on every build.</p>
          </Panel>
          <Panel title="Active season" icon="trophy">
            {result ? (
              <div className="space-y-3">
                <div className="text-sm space-y-1">
                  <p className="text-white font-medium">{result.season.name}</p>
                  <p className="text-gray-400">Collection: <code className="text-gray-500">{result.season.collectionName}</code>{' · '}{result.packs.length} pack{result.packs.length !== 1 ? 's' : ''}{' · '}Max concurrent: {result.season.maxConcurrentPacks}</p>
                </div>
                {result.packs.length > 0 && (
                  <div className="divide-y divide-gray-800">
                    {result.packs.map(({ pack, cards }) => (
                      <div key={pack.id} className="flex items-center gap-2 text-sm py-2 first:pt-0 last:pb-0">
                        {pack.coverImageUrl && <img src={pack.coverImageUrl} alt={pack.name} loading="lazy" className="w-6 h-8 object-cover rounded-sm shrink-0" />}
                        <span className="text-gray-300 flex-1">{pack.name}</span>
                        <span className="text-gray-600">{cards.length} cards</span>
                        {!pack.active && <span className="text-xs text-gray-700">(inactive)</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : <p className="text-sm text-gray-500">No active season.</p>}
          </Panel>
        </div>
      )}
    </div>
  );
}
