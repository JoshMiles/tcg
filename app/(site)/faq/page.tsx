import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getActive, getSeasonOverview } from '@/lib/site-data';
import { collectionBonuses } from '@/lib/leaderboard';
import { DEFAULT_SCORING } from '@/lib/scoring';
import { DEFAULT_UPGRADE_COSTS, DEFAULT_VARIANT_WEIGHTS, VARIANTS, VARIANT_LABELS, effectiveWeights } from '@/lib/variants';
import { RARITIES } from '@/lib/rarity';
import { cardThumbUrl } from '@/lib/card-art';
import { CONTACT_EMAIL, OPERATOR } from '@/lib/legal';
import { CHANNEL_NAME, CHANNEL_URL } from '@/lib/site';
import { getTradeSettings } from '@/lib/trades';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'FAQ',
  description: 'How The Cheesy TCG works: packs, variants, upgrades, points and the leaderboard.',
};

const VARIANT_SHORT: Record<string, string> = { reverse: 'RH', full: 'FA', shiny: '✨' };

const SECTIONS = [
  { id: 'start', label: 'Getting started' },
  { id: 'cards', label: 'Cards & versions' },
  { id: 'upgrades', label: 'Upgrading' },
  { id: 'trading', label: 'Trading' },
  { id: 'points', label: 'Points & leaderboard' },
  { id: 'seasons', label: 'Seasons' },
  { id: 'extension', label: 'Twitch extension' },
  { id: 'privacy', label: 'Privacy & data' },
  { id: 'help', label: 'Something not working?' },
];

export default async function FaqPage() {
  const { season } = await getActive();
  const overview = season ? await getSeasonOverview(season) : null;
  const trade = await getTradeSettings();

  // Live numbers from the current season where we have them; sensible defaults otherwise.
  const upgradePack = overview?.cards.find(c => c.pack.upgradesEnabled)?.pack ?? null;
  const costs = upgradePack?.upgradeCosts ?? DEFAULT_UPGRADE_COSTS;
  const weights = upgradePack ? effectiveWeights(upgradePack) : DEFAULT_VARIANT_WEIGHTS;
  const wTotal = VARIANTS.reduce((s, v) => s + Math.max(0, weights[v]), 0) || 1;
  const pct = (v: (typeof VARIANTS)[number]) => {
    const p = (Math.max(0, weights[v]) / wTotal) * 100;
    return p >= 10 ? p.toFixed(0) : p.toFixed(1);
  };
  const upgradesOn = !!upgradePack;

  // Live numbers for the collection bonuses.
  const bonusAtFull = overview ? collectionBonuses(overview.values, overview.values.totalCards) : null;
  const scoring = overview?.values.settings ?? DEFAULT_SCORING;

  const valueRows = overview
    ? overview.cards
        .map(c => ({ card: c, v: overview.values.cards.get(c.number), upgradable: c.pack.upgradesEnabled && c.upgradesEnabled !== false }))
        .filter(x => x.v)
        .sort((a, b) => b.v!.values.regular - a.v!.values.regular)
    : [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-10">
      <header className="space-y-3">
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-white">Frequently asked questions</h1>
        <p className="text-gray-400 leading-relaxed max-w-2xl">
          Everything about collecting cards on The Cheesy TCG: how to get them, what the versions mean, how upgrades work and how your points are worked out.
        </p>
        <nav aria-label="FAQ sections" className="flex flex-wrap gap-2 pt-1">
          {SECTIONS.map(s => (
            <a key={s.id} href={`#${s.id}`} className="px-3 py-1 rounded-full text-xs font-semibold border border-gray-700 text-gray-300 hover:text-yellow-300 hover:border-yellow-500/50 transition-colors">
              {s.label}
            </a>
          ))}
        </nav>
      </header>

      {/* ── Getting started ── */}
      <Section id="start" title="Getting started" icon="🧀">
        <Q q="What is The Cheesy TCG?" open>
          A collectible card game played live on {CHANNEL_NAME}&rsquo;s Twitch channel. Packs are opened on stream, the cards you pull go into your collection, and you can hunt for rare versions, upgrade your duplicates and climb
          the leaderboard. It&rsquo;s a fan-made community game and isn&rsquo;t affiliated with Twitch.
        </Q>
        <Q q="Where can I play?">
          Only on <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:text-yellow-300 underline">{CHANNEL_NAME}&rsquo;s Twitch channel</a> — it doesn&rsquo;t run anywhere else. Packs are opened live there,
          and the Twitch extension is only available on that channel. This website just lets you look at your collection and, when you&rsquo;re logged in, upgrade your cards.
        </Q>
        <Q q="How do I get cards?">
          Packs are opened live on {CHANNEL_NAME}&rsquo;s stream. When one is opened for you, your name appears on screen with the card you pulled, and it&rsquo;s added to your collection straight away. How packs are earned
          (for example channel rewards or special events) is up to the streamer and can change from stream to stream, so watch the channel for what&rsquo;s currently running.
        </Q>
        <Q q="Where can I see my cards?">
          <ul className="list-disc pl-5 space-y-1 marker:text-gray-600">
            <li>On the website: <Link href="/collection" className="text-yellow-400 hover:text-yellow-300">Collections</Link>, then type any Twitch username. Collections are public.</li>
            <li>Logged in, <strong className="text-white">My collection</strong> and <strong className="text-white">My stats</strong> are in the menu at the top right.</li>
            <li>In Twitch, under the stream, with the extension (see <a href="#extension" className="text-yellow-400 hover:text-yellow-300">Twitch extension</a>).</li>
          </ul>
        </Q>
        <Q q="Do I need an account?">
          Not to browse. Collections, the leaderboard, season stats and the card dex are open to everyone. <strong className="text-white">Log in with Twitch</strong> to see your own stats and to upgrade
          cards on the website. Logging in only shares your basic public Twitch profile (we ask for no extra permissions).
        </Q>
        <Q q="I can&rsquo;t find my collection">
          A collection appears once you&rsquo;ve pulled at least one card this season. Check the spelling of your Twitch username (capitals don&rsquo;t matter). If you&rsquo;ve just pulled something, refresh the page.
        </Q>
      </Section>

      {/* ── Cards & versions ── */}
      <Section id="cards" title="Cards & versions" icon="🃏">
        <Q q="What do the stars mean?" open>
          Each card has a rarity from one to five stars:{' '}
          {[...RARITIES].reverse().map((r, i, arr) => (
            <span key={r.stars}><strong style={{ color: r.hex }}>{'★'.repeat(r.stars)} {r.label}</strong>{i < arr.length - 1 ? ', ' : '.'} </span>
          ))}
          Rarer cards are pulled less often and are worth more points. The <Link href="/cards" className="text-yellow-400 hover:text-yellow-300">Card dex</Link> shows every card with its exact pull chance (for example &ldquo;1 in 12 pulls&rdquo;).
        </Q>
        <Q q="What are the different versions of a card?">
          {upgradesOn ? (
            <>
              <p>In seasons with variants, every card can be pulled in four versions. The art is the same card with more or less flair:</p>
              <ul className="list-disc pl-5 space-y-1 marker:text-gray-600 mt-2">
                <li><strong className="text-white">Regular</strong> — the standard card.</li>
                <li><strong className="text-fuchsia-300">Reverse Holo</strong> — the regular art with a holographic shimmer.</li>
                <li><strong className="text-sky-300">Full Art</strong> — a bolder full-art version of the card.</li>
                <li><strong className="text-amber-300">Shiny Full Art</strong> — the full art with the holographic shimmer, and it gently rocks on screen. The rarest of all.</li>
              </ul>
            </>
          ) : (
            <p>
              Some seasons add Reverse Holo, Full Art and Shiny Full Art versions of every card. The current season has a single version of each card, but if variants come back they&rsquo;ll be explained here.
            </p>
          )}
        </Q>
        {upgradesOn && (
          <Q q="How likely is each version?">
            First a card is picked, then its version is rolled. In the current season that works out to roughly{' '}
            <strong className="text-white">{pct('regular')}%</strong> Regular, <strong className="text-fuchsia-300">{pct('reverse')}%</strong> Reverse Holo,{' '}
            <strong className="text-sky-300">{pct('full')}%</strong> Full Art and <strong className="text-amber-300">{pct('shiny')}%</strong> Shiny Full Art. These numbers can change between seasons.
          </Q>
        )}
        <Q q="Can I see cards I haven&rsquo;t found yet?">
          Yes — the <Link href="/cards" className="text-yellow-400 hover:text-yellow-300">Card dex</Link> lists every card in the season. On your own collection page, cards you haven&rsquo;t pulled yet show as a <strong className="text-white">?</strong>.
        </Q>
      </Section>

      {/* ── Upgrading ── */}
      <Section id="upgrades" title="Upgrading" icon="⬆️">
        {upgradesOn ? (
          <>
            <Q q="How do upgrades work?" open>
              Collect duplicates of the same card in the same version, then trade them up one step:
              <ul className="list-disc pl-5 space-y-1 marker:text-gray-600 mt-2">
                <li><strong className="text-white">{costs.reverse}</strong> Regular → 1 <strong className="text-fuchsia-300">Reverse Holo</strong></li>
                <li><strong className="text-white">{costs.full}</strong> Reverse Holo → 1 <strong className="text-sky-300">Full Art</strong></li>
                <li><strong className="text-white">{costs.shiny}</strong> Full Art → 1 <strong className="text-amber-300">Shiny Full Art</strong></li>
              </ul>
              <p className="mt-2">
                That&rsquo;s {costs.reverse} Regulars for a Reverse Holo, {costs.reverse * costs.full} for a Full Art and {costs.reverse * costs.full * costs.shiny} for a Shiny, counted from Regular copies alone.
              </p>
            </Q>
            <Q q="Where do I upgrade?">
              On the website, log in and open <strong className="text-white">My stats</strong> (it lists what you can upgrade right now), or open one of your cards on your own collection page and use the Upgrade column.
              You can also upgrade from the Twitch extension.
            </Q>
            <Q q="What are the rules?">
              <ul className="list-disc pl-5 space-y-1 marker:text-gray-600">
                <li>Only one step at a time — no skipping from Regular straight to Shiny.</li>
                <li>Only copies of the <strong className="text-white">same card and the same version</strong> can be combined.</li>
                <li>Upgrades are <strong className="text-white">permanent</strong>. The copies you spend are destroyed.</li>
                <li>Only the current season can be upgraded.</li>
                <li>Some cards or packs can have upgrades turned off.</li>
              </ul>
            </Q>
          </>
        ) : (
          <Q q="Can I upgrade cards?" open>
            In seasons with variants you can combine duplicates to create rarer versions. The current season doesn&rsquo;t use variants, so there&rsquo;s nothing to upgrade right now. When it&rsquo;s available, this section lists the exact costs.
          </Q>
        )}
        <Q q="Can I trade cards with other people?">
          Yes — see <a href="#trading" className="text-yellow-400 hover:text-yellow-300">Trading</a>. You can also trade duplicates for the version you&rsquo;re missing instead of upgrading them.
        </Q>
      </Section>

      {/* ── Trading ── */}
      <Section id="trading" title="Trading" icon="🔁">
        <Q q="How does trading work?" open>
          <p>
            Open the <Link href="/trade" className="text-yellow-400 hover:text-yellow-300">Trade</Link> page (you need to be logged in with Twitch) and make an offer: pick the cards you give and the cards you want back. Any copy of any version can be traded.
            There are two kinds of offer:
          </p>
          <ul className="list-disc pl-5 space-y-1 marker:text-gray-600 mt-2">
            <li><strong className="text-white">To one person</strong> — only they can accept, decline or counter it. You can start one from the &ldquo;Trade with…&rdquo; button on their collection page.</li>
            <li><strong className="text-white">On the open board</strong> — a listing anyone can take, as long as they own what you ask for.</li>
          </ul>
          <p className="mt-2">When someone accepts, the swap happens instantly and both collections update. There are no fees and no randomness.</p>
        </Q>
        <Q q="What is escrow? Where do my cards go while an offer is open?">
          When you send an offer, the cards you&rsquo;re giving leave your collection and are <strong className="text-white">held safely in escrow</strong>. That guarantees you really have them, so nobody can accept an offer
          you can&rsquo;t honour. They come straight back to you if the offer is declined, cancelled, countered or runs out of time, and go to the other person if it&rsquo;s accepted. While they are in escrow they don&rsquo;t count
          towards your points (or towards how scarce a card is).
        </Q>
        <Q q="How long do offers last, and what are the limits?">
          <p>
            Offers last <strong className="text-white">{trade.expiryHours} hours</strong>. After that they end and your cards are returned (you may need to open the site once for the cards to reappear in your collection).
            To keep things fair and tidy, you can have up to <strong className="text-white">{trade.maxOpenPerUser}</strong> open offers at once, wait about <strong className="text-white">{trade.cooldownSeconds} seconds</strong> between offers,
            and each side of an offer can include up to <strong className="text-white">{trade.maxStacksPerSide}</strong> different card and version combinations. You can cancel an offer yourself whenever you like.
          </p>
        </Q>
        <Q q="What is a counter-offer?">
          If someone sends you an offer you almost like, press <em>Counter</em>. Their offer is closed and their cards go back to them; you pick a different swap, which is sent back to them to accept or counter in turn.
        </Q>
        <Q q="Is a trade fair? How do I know what a card is worth?">
          Every offer shows the approximate points on each side, using today&rsquo;s card values (see <a href="#points" className="text-yellow-400 hover:text-yellow-300">Points &amp; leaderboard</a>). It&rsquo;s a guide, not a rule — you can
          trade anything for anything. Remember that trading changes how scarce each version is, so values shift after a trade, and the person giving up a rare version may care about more than the points.
        </Q>
        <Q q="Trading seems to be switched off">
          Trading can be paused by the streamer, for example while something is being fixed. While it&rsquo;s paused nothing new can be offered or accepted, but you can still cancel your own offers to get your cards back.
        </Q>
        <Q q="Can I trade in the Twitch extension?">
          Not yet — trading is on the website for now. Your collection is the same in both places.
        </Q>
      </Section>

      {/* ── Points & leaderboard ── */}
      <Section id="points" title="Points & leaderboard" icon="🏆">
        <Q q="How are points worked out?" open>
          <p>
            Your score is the value of <strong className="text-white">every card you own</strong>, duplicates included. Each copy is worth:
          </p>
          <p className="font-display text-xl font-bold text-yellow-300 my-2">{scoring.baseScore} × rarity × scarcity{upgradesOn ? ' × version' : ''}</p>
          <ul className="space-y-2">
            <li>
              <strong className="text-white">Rarity</strong> — how hard the card is to pull compared with an average card. A card that comes up half as often is worth twice as much.
            </li>
            <li>
              <strong className="text-white">Scarcity</strong> — how few copies of that <em>exact version</em> exist across everyone this season (a Shiny is compared with other Shinies, a Regular with other
              Regulars). Fewer than average gives a bonus (up to {scoring.scarcityMax}×), more gives a penalty (down to {scoring.scarcityMin}×).
            </li>
            {upgradesOn && (
              <li>
                <strong className="text-white">Version</strong> — Reverse Holo, Full Art and Shiny Full Art copies are worth far more than a Regular. An upgraded card is normally worth more than the copies you spend to
                make it, though scarcity can shift that.
              </li>
            )}
          </ul>
          <p className="mt-2">
            Add up all your copies, then add the <a href="#bonuses" className="text-yellow-400 hover:text-yellow-300">collection bonuses</a> below, and that&rsquo;s your score on the{' '}
            <Link href="/leaderboard" className="text-yellow-400 hover:text-yellow-300">leaderboard</Link>.
          </p>
        </Q>
        <Q q="What are the collection bonuses?">
          <p id="bonuses">
            Collecting more of the set pays off, on top of what your individual cards are worth. There are two bonuses, both measured against the <strong className="text-white">set value</strong> — what one
            Regular copy of every card in the season is worth right now{overview ? <> (currently <strong className="text-white">{overview.values.setValue.toLocaleString()}</strong> points)</> : null}:
          </p>
          <ul className="list-disc pl-5 space-y-1 marker:text-gray-600 mt-2">
            <li>
              <strong className="text-white">Completion bonus</strong> — grows with the share of the set you own, up to{' '}
              <strong className="text-white">{scoring.completionBonusPct}%</strong> of the set value
              {bonusAtFull ? <> (about <strong className="text-white">{bonusAtFull.completion.toLocaleString()}</strong> points at 100%)</> : null}. Every new card you find adds its own points <em>and</em> raises this.
            </li>
            <li>
              <strong className="text-white">Complete collection bonus</strong> — own at least one of <em>every</em> card in the season and you earn an extra{' '}
              <strong className="text-white">{scoring.completeSetBonusPct}%</strong> of the set value
              {bonusAtFull ? <> (about <strong className="text-white">{bonusAtFull.set.toLocaleString()}</strong> points)</> : null}, and a <strong className="text-white">🧀 Complete</strong> badge on the leaderboard.
            </li>
          </ul>
          <p className="mt-2">
            Duplicates and rarer versions don&rsquo;t count towards completeness — only having at least one copy of each card does. The bonuses move with the set value, so they stay in proportion as card values shift. You can see your own
            breakdown on <Link href="/account" className="text-yellow-400 hover:text-yellow-300">My stats</Link>.
          </p>
        </Q>
        <Q q="Can I see the exact maths for a card?">
          <p>
            Yes. Click any card on the <Link href="/cards" className="text-yellow-400 hover:text-yellow-300">card dex</Link> or in a collection to open its details, then open{' '}
            <strong className="text-white">🤓 Advanced information (for nerds)</strong>. It shows every step with the real numbers filled in, for each version: the pull chance, rarity, scarcity, the version multiplier
            and the final rounding, plus the pull odds, how many packs you&rsquo;d expect to need, and what one more or one fewer copy would do to the value. In short:
          </p>
          <p className="font-mono text-[12px] text-gray-300 my-2 leading-relaxed">
            points = max(1, round( {scoring.baseScore} × rarity × scarcity × version ))<br />
            rarity = (1 ÷ (pull chance × cards in the season)) ^ {scoring.rarityExponent}<br />
            scarcity = clamp( (average copies per card of that version + {scoring.scarcitySmoothing}) ÷ (copies of this card&rsquo;s version + {scoring.scarcitySmoothing}), {scoring.scarcityMin}, {scoring.scarcityMax} )<br />
            version = max( Regular weight ÷ version weight, previous version × upgrade cost × {scoring.upgradeMargin} )
          </p>
          <p>
            The {scoring.baseScore}, the limits and the margin are settings the streamer can change, so the numbers above are today&rsquo;s. Cards sitting in an open trade (escrow) aren&rsquo;t counted as copies in anyone&rsquo;s collection.
          </p>
        </Q>
        <Q q="Why did my points change?">
          Values aren&rsquo;t fixed. Scarcity depends on how many copies of each version exist, so as other people pull and upgrade cards, what your copies are worth moves up and down. Early in a season, when there are
          few cards around, the swings are bigger.
        </Q>
        <Q q="Does upgrading raise my score?">
          {upgradesOn ? (
            <>
              Usually, yes — a higher version is worth much more. But upgrades <strong className="text-white">use cards up</strong>: the copies you spend are destroyed, so fewer of that version exist and it becomes
              scarcer, which can raise what the copies you keep are worth. The new, higher version adds to its own count, so it can become a little less scarce. <Link href="/account" className="text-yellow-400 hover:text-yellow-300">My stats</Link>{' '}
              shows a projected change for each upgrade with all of this included, so occasionally it can be negative.
            </>
          ) : (
            <>Upgrades only exist in seasons with variants. When they do, My stats shows the projected points change for each upgrade before you commit.</>
          )}
        </Q>
        <Q q="Is there a leaderboard for each season?">
          Yes. Every season has its own leaderboard, and past seasons stay available — use the season buttons at the top of the <Link href="/leaderboard" className="text-yellow-400 hover:text-yellow-300">leaderboard</Link>,{' '}
          <Link href="/stats" className="text-yellow-400 hover:text-yellow-300">stats</Link> and <Link href="/cards" className="text-yellow-400 hover:text-yellow-300">card dex</Link> pages.
        </Q>
        {valueRows.length > 0 && (
          <Q q={`What is each card worth right now? (${season?.name})`}>
            <p className="mb-3">Points per copy at this moment. These update as cards are pulled and upgraded.</p>
            <div className="overflow-x-auto rounded-lg border border-gray-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 text-left bg-gray-950/50">
                    <th className="py-2 px-3 font-medium">Card</th>
                    <th className="py-2 px-2 font-medium text-right">Copies</th>
                    <th className="py-2 px-2 font-medium text-right">Regular</th>
                    {upgradesOn && VARIANTS.filter(v => v !== 'regular').map(v => (
                      <th key={v} className="py-2 px-2 font-medium text-right" title={VARIANT_LABELS[v]}>{VARIANT_SHORT[v]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {valueRows.map(({ card, v, upgradable }) => (
                    <tr key={card.id} className="text-gray-300">
                      <td className="py-1.5 px-3">
                        <span className="flex items-center gap-2">
                          {card.imageUrl && <img src={cardThumbUrl(card.imageUrl)} alt="" loading="lazy" className="w-5 h-7 object-cover rounded-sm" />}
                          <span className="truncate">{card.name}</span>
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-gray-500">{v!.copies}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{v!.values.regular}</td>
                      {upgradesOn && VARIANTS.filter(x => x !== 'regular').map(x => (
                        <td key={x} className="py-1.5 px-2 text-right tabular-nums text-gray-400">{upgradable ? v!.values[x] : '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {upgradesOn && <p className="text-[11px] text-gray-600 mt-2">RH = Reverse Holo · FA = Full Art · ✨ = Shiny Full Art.</p>}
          </Q>
        )}
      </Section>

      {/* ── Seasons ── */}
      <Section id="seasons" title="Seasons" icon="📅">
        <Q q="What is a season?" open>
          The game runs in seasons. Each season has its own set of cards and packs, its own collections and its own leaderboard, so everyone starts fresh and the rules (like version odds and upgrade costs) can change between them.
          Your collection page shows the current season. Cards you collected in an earlier season stay with that season.
        </Q>
        <Q q="Can I see old seasons?">
          Yes — the leaderboard, season stats and card dex all have season buttons at the top so you can look back.
        </Q>
      </Section>

      {/* ── Extension ── */}
      <Section id="extension" title="Twitch extension" icon="📺">
        <Q q="How do I use the extension?" open>
          Open {CHANNEL_NAME}&rsquo;s stream on Twitch and look under the video for the card collection panel (on mobile it&rsquo;s in the extensions tab, and on desktop it can also appear on the video). Press
          <strong className="text-white"> Login with Twitch</strong> and allow Twitch&rsquo;s &ldquo;share your identity&rdquo; prompt. Your collection appears, with the same cards as on the website.
        </Q>
        <Q q="The extension doesn&rsquo;t show my cards">
          Make sure you pressed Login and accepted Twitch&rsquo;s prompt. Use the refresh button in the panel after a pull. If it still looks wrong, log out and back in.
        </Q>
      </Section>

      {/* ── Privacy ── */}
      <Section id="privacy" title="Privacy & data" icon="🔒">
        <Q q="What can other people see?" open>
          Collections, the leaderboard, season stats and recent pulls are public, and your username appears on stream when your cards are shown. The full details are in the{' '}
          <Link href="/privacy" className="text-yellow-400 hover:text-yellow-300">Privacy Policy</Link>; the rules of the game are in the <Link href="/terms" className="text-yellow-400 hover:text-yellow-300">Terms</Link>.
        </Q>
        <Q q="What do you store about me?">
          Your Twitch username and ID, your cards and score, and a short log of recent game events. Logging in on the website uses a login cookie; the Twitch access token isn&rsquo;t kept.
        </Q>
        <Q q="How do I get my data deleted?">
          Ask the person who runs the game:{' '}
          {CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`} className="text-yellow-400 hover:text-yellow-300 underline">{CONTACT_EMAIL}</a> : <>contact {OPERATOR} through the stream&rsquo;s Twitch channel</>}
          . Logging out only ends your session; it doesn&rsquo;t delete your collection.
        </Q>
      </Section>

      {/* ── Help ── */}
      <Section id="help" title="Something not working?" icon="🛠️">
        <Q q="I can&rsquo;t log in on the website" open>
          Try again — the sign-in link only lasts a few minutes and must finish in the same browser. If you pressed <em>Cancel</em> on Twitch&rsquo;s page we can&rsquo;t log you in. Make sure cookies are allowed for this site.
        </Q>
        <Q q="A card or my score looks wrong">
          Refresh first. Scores are recalculated whenever anyone pulls or upgrades, so they can move even when you haven&rsquo;t done anything. If something still looks wrong, tell the streamer in chat.
        </Q>
      </Section>
    </div>
  );
}

function Section({ id, title, icon, children }: { id: string; title: string; icon: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
        <span aria-hidden className="w-10 h-10 rounded-full bg-yellow-500/15 flex items-center justify-center text-xl">{icon}</span>
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Q({ q, open, children }: { q: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group rind rounded-xl overflow-hidden">
      <summary className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-white">{q}</span>
        <span aria-hidden className="text-yellow-500 text-lg leading-none transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="px-4 pb-4 text-sm text-gray-300 leading-relaxed">{children}</div>
    </details>
  );
}
