import { Icon } from '@/app/components/Icon';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { IconName } from '@/app/components/Icon';
import { getActive, getSeasonOverview } from '@/lib/site-data';
import { collectionBonuses } from '@/lib/leaderboard';
import { DEFAULT_SCORING } from '@/lib/scoring';
import { DEFAULT_UPGRADE_COSTS, DEFAULT_VARIANT_WEIGHTS, VARIANTS, VARIANT_LABELS, effectiveWeights } from '@/lib/variants';
import { RARITIES } from '@/lib/rarity';
import { cardThumbUrl } from '@/lib/card-art';
import { CONTACT_EMAIL, OPERATOR } from '@/lib/legal';
import { CHANNEL_NAME, CHANNEL_URL } from '@/lib/site';
import { getTradeSettings } from '@/lib/trades';
import { SHOWOFF_COOLDOWN_S } from '@/lib/showoff-prepare';
import { OpenOnHash } from '@/app/components/site/OpenOnHash';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'FAQ',
  description: 'How The Cheesy TCG works: packs, variants, upgrades, points and the leaderboard.',
};

const VARIANT_SHORT: Record<string, string> = { reverse: 'RH', full: 'FA', shiny: 'SH' };

const SECTIONS = [
  { id: 'start', label: 'Getting started' },
  { id: 'cards', label: 'Cards & versions' },
  { id: 'upgrades', label: 'Upgrading' },
  { id: 'trading', label: 'Trading' },
  { id: 'profile', label: 'Your profile' },
  { id: 'show', label: 'Showing off' },
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
      <OpenOnHash />
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
      <Section id="start" title="Getting started" icon="cheese">
        <Q q="What is The Cheesy TCG?" open>
          A collectible card game played live on {CHANNEL_NAME}&rsquo;s Twitch channel. Packs are opened on stream, the cards you pull go into your collection, and you can hunt for rare versions, upgrade your duplicates and climb
          the leaderboard. It&rsquo;s a fan-made community game and isn&rsquo;t affiliated with Twitch.
        </Q>
        <Q q="Are the cards NFTs or worth real money?" id="not-nfts">
          No. The cards are <strong className="text-white">virtual trading cards for fun</strong>: entries in this game&rsquo;s own database, not NFTs, tokens, crypto or anything on a blockchain. They aren&rsquo;t assets or property, have no cash value,
          and can&rsquo;t be bought, sold or cashed out, here or anywhere else. Edition numbers and rarities are just part of the game. If anyone offers to sell you our cards, or to &ldquo;mint&rdquo; them, it isn&rsquo;t us. See the{' '}
          <Link href="/terms" className="text-yellow-400 hover:text-yellow-300">Terms</Link>.
        </Q>
        <Q q="Where can I play?">
          Only on <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:text-yellow-300 underline">{CHANNEL_NAME}&rsquo;s Twitch channel</a>. It doesn&rsquo;t run anywhere else. Packs are opened live there,
          and the Twitch extension is only available on that channel. This website just lets you look at your collection and, when you&rsquo;re logged in, upgrade your cards.
        </Q>
        <Q q="Is there an app?" id="app">
          There&rsquo;s no app store version, but you can add the website to your home screen on iPhone, Android or a computer so it opens full screen from its own icon. Step-by-step instructions are on the{' '}
          <Link href="/install" className="text-yellow-400 hover:text-yellow-300">Get the app</Link> page. On iPhone you&rsquo;ll need to log in with Twitch once inside the home-screen app.
        </Q>
        <Q q="How do I get cards?">
          <p>
            Packs are opened live on {CHANNEL_NAME}&rsquo;s stream. When one is opened for you, your name appears on screen with the card you pulled, and it&rsquo;s added to your collection straight away.
            In short:
          </p>
          <ul className="list-disc pl-5 space-y-1 marker:text-gray-600 mt-2">
            <li><strong className="text-white">Follow</strong> and <strong className="text-white">subscribe</strong> to the channel: both are ways to earn packs.</li>
            <li><strong className="text-white">Use the <code className="text-yellow-300">!pack</code> command</strong> in chat to get a pack opened on stream for you.</li>
          </ul>
          <p className="mt-2">
            Exactly how many packs each of these gives can change from season to season and stream to stream, so watch the channel (and its chat commands) for what is running right now.
          </p>
        </Q>
        <Q q="Where can I see my cards?">
          <ul className="list-disc pl-5 space-y-1 marker:text-gray-600">
            <li>On the website: every collector has a public profile with their collection. Use <Link href="/collection" className="text-yellow-400 hover:text-yellow-300">Collectors</Link> or the search box at the top (press <kbd className="kbd">/</kbd>) to find anyone.</li>
            <li>Logged in, <strong className="text-white">My profile</strong> and <strong className="text-white">My stats</strong> are in the menu at the top right.</li>
            <li>In Twitch, under the stream, with the extension (see <a href="#extension" className="text-yellow-400 hover:text-yellow-300">Twitch extension</a>).</li>
          </ul>
        </Q>
        <Q q="Do I need an account?">
          Not to browse. Collections, the leaderboard, season stats and the card dex are open to everyone. <strong className="text-white">Log in with Twitch</strong> to see your own stats and to upgrade
          cards on the website, trade, customise your profile and change your settings. Logging in only shares your basic public Twitch profile (we ask for no extra permissions).
        </Q>
        <Q q="I can&rsquo;t find my collection">
          A collection appears once you&rsquo;ve pulled at least one card this season. Check the spelling of your Twitch username (capitals don&rsquo;t matter). If you&rsquo;ve just pulled something, refresh the page.
        </Q>
      </Section>

      {/* ── Cards & versions ── */}
      <Section id="cards" title="Cards & versions" icon="cards">
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
                <li><strong className="text-white">Regular</strong>: the standard card.</li>
                <li><strong className="text-fuchsia-300">Reverse Holo</strong>: the regular art with a holographic shimmer.</li>
                <li><strong className="text-sky-300">Full Art</strong>: a bolder full-art version of the card.</li>
                <li><strong className="text-amber-300">Shiny Full Art</strong>: the full art with the holographic shimmer, and it gently rocks on screen. The rarest of all.</li>
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
          Yes. The <Link href="/cards" className="text-yellow-400 hover:text-yellow-300">Card dex</Link> lists every card in the season. On your own collection page, cards you haven&rsquo;t pulled yet show as a <strong className="text-white">?</strong>.
        </Q>
        <Q q="What are prints, print numbers and editions?" id="serials" open>
          <span id="prints" />Every card you own is a <strong className="text-white">print</strong>, and every print has two numbers. Its <strong className="text-white">print number</strong> (like Print #1023381) is different for every print in the whole game and is how you refer to it: type it in the search box or open <code className="text-yellow-300">/p/1023381</code>. Its <strong className="text-white">edition number</strong> is counted per card and per version of that card, and is the one that earns the points bonus. For example, your Shiny Gouda Goat edition #3 is the third Shiny Gouda Goat drawn. Open a card in your collection to see your prints,
          and press one to see its page and its journey: who pulled it, who has held it and for how long, and where it has been traded or forged in an upgrade. Prints that existed before editions were numbered were numbered afterwards, so their order is an estimate (shown with a ~). On a print&rsquo;s page and in your card details the card can be turned over: move the pointer over it to tilt it, then tap it or press <em>Flip</em> to see the engraved back with the print number and the date.
          When you upgrade, the spent prints are retired and the new print remembers what it was made from.
        </Q>
      </Section>

      {/* ── Upgrading ── */}
      <Section id="upgrades" title="Upgrading" icon="arrowUp">
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
                That&rsquo;s {costs.reverse} Regulars for a Reverse Holo, {costs.reverse * costs.full} for a Full Art and {costs.reverse * costs.full * costs.shiny} for a Shiny, counted from Regular prints alone.
              </p>
            </Q>
            <Q q="Where do I upgrade?">
              On the website, log in and open <strong className="text-white">My stats</strong> (it lists what you can upgrade right now), or open one of your cards on your own collection page and use the Upgrade column.
              You can also upgrade from the Twitch extension.
            </Q>
            <Q q="What are the rules?">
              <ul className="list-disc pl-5 space-y-1 marker:text-gray-600">
                <li>Only one step at a time. No skipping from Regular straight to Shiny.</li>
                <li>Only prints of the <strong className="text-white">same card and the same version</strong> can be combined.</li>
                <li>Upgrades are <strong className="text-white">permanent</strong>. The prints you spend are destroyed, so the Upgrade button asks you to tap twice (the first tap says &ldquo;Sure?&rdquo;).</li>
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
          Yes. See <a href="#trading" className="text-yellow-400 hover:text-yellow-300">Trading</a>. You can also trade duplicates for the version you&rsquo;re missing instead of upgrading them.
        </Q>
      </Section>

      {/* ── Trading ── */}
      <Section id="trading" title="Trading" icon="trade">
        <Q q="How does trading work?" open>
          <p>
            Open the <Link href="/trade" className="text-yellow-400 hover:text-yellow-300">Trade</Link> page (you need to be logged in with Twitch) and make an offer: pick the cards you give and the cards you want back. Any print of any version can be traded.
            There are two kinds of offer:
          </p>
          <ul className="list-disc pl-5 space-y-1 marker:text-gray-600 mt-2">
            <li><strong className="text-white">To one person</strong>: only they can accept, decline or counter it. You can start one from the &ldquo;Trade with…&rdquo; button on their profile.</li>
            <li><strong className="text-white">On the open board</strong>: a listing anyone can take, as long as they own what you ask for.</li>
          </ul>
          <p className="mt-2">When someone accepts, the swap happens instantly and both collections update. There are no fees and no randomness. Accept, Take this trade, Decline and Cancel each ask for a second tap (&ldquo;Sure?&rdquo;) before they do anything, so a stray tap can&rsquo;t swap your cards.</p>
        </Q>
        <Q q="What is escrow? Where do my cards go while an offer is open?">
          When you send an offer, the card you are trading leaves your collection and is <strong className="text-white">held safely in escrow</strong>. That guarantees you really have it, so nobody can accept an offer you can&rsquo;t
          honour. It comes straight back to you if the offer is declined, cancelled, countered or runs out of time, and goes to the other person if the offer is accepted. While a card is in escrow it doesn&rsquo;t count towards your points.
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
        <Q q="How will I know if someone answers my offer?">
          The bell in the top bar tells you when you get an offer or counter-offer, and when yours is accepted, declined, withdrawn or runs out. When someone accepts one of your offers you also get a short trade animation showing the swap (you can replay it from the bell).
        </Q>
        <Q q="How do I find a good trade?">
          The Trade page has three tabs: <em>Your trades</em>, <em>The board</em> and <em>History</em>. <strong className="text-white">Matches for you</strong> picks out board listings you can take that give a card you are
          looking for or do not have yet, or that only ask for your spare prints. On the board you can search, filter (for example &ldquo;I can take&rdquo;) and sort by points. When you make an offer to someone, quick picks show
          the cards they are looking for that you own and the cards you want that they have. Add cards to your own <em>Looking for</em> list from the Card Dex, My Stats or Settings.
        </Q>
        <Q q="Can I stop getting offers or notifications?">
          Yes. In <Link href="/settings" className="text-yellow-400 hover:text-yellow-300">Settings</Link> you can stop other collectors sending you direct offers (the open board and counters to your own offers still work) and switch off
          bell notices for new offers or for how your offers ended. Notices from an admin always come through. New notices appear within about ten seconds while the site is open, with a small pop-up, a count in the tab title, and an optional sound (off unless you switch it on in Settings).
        </Q>
        <Q q="How do I get alerts on my phone?">
          In <Link href="/settings#push" className="text-yellow-400 hover:text-yellow-300">Settings</Link>, under notifications, tap <em>Turn on alerts for this device</em> and allow notifications when your phone or browser asks. Then an offer, a counter or the result of your offer reaches you
          even when the site is closed. On an iPhone or iPad you first need to <Link href="/install" className="text-yellow-400 hover:text-yellow-300">add the app to your Home Screen</Link> and open it from there (iOS 16.4 or newer). You can choose which kinds of alert you want, send yourself a test, and remove a device
          at any time. If you blocked notifications by mistake, allow them again in your browser or phone settings for this site. The option only shows once the site has alerts set up.
        </Q>
        <Q q="Which of my prints get traded?">
          Unless you choose, trades move your <strong className="text-white">newest</strong> prints of a card first, so the low edition numbers you pulled earliest stay with you. If you hold more prints of a card than the trade needs, <strong className="text-white">Choose prints</strong> in the offer lets you tick exactly which ones to give (a warning appears for Edition #1 and prints that earn an edition bonus). You can ask for a specific print of someone&rsquo;s when you offer them a trade directly, and when you take a listing or accept an offer that asks for a card you have spares of, you pick which of yours to hand over before the final tap. See <a href="#serials" className="text-yellow-400 hover:text-yellow-300">prints and editions</a>.
        </Q>
        <Q q="Can I protect a print from being traded?">
          Yes. Press <strong className="text-white">Favourite</strong> on a print&rsquo;s page, or in the card details on your collection, to mark it (up to 50 prints). A favourite print can&rsquo;t be put in an offer, can&rsquo;t be taken when someone accepts your offer or takes your listing, and isn&rsquo;t spent when you upgrade duplicates. When a trade or an upgrade picks prints for you it skips your favourites, and if only favourites are left it stops and says so. Remove the mark whenever you want to trade it. Prints in an open offer can&rsquo;t be favourited until the offer ends.
        </Q>
        <Q q="Is a trade fair? How do I know what a card is worth?">
          Every offer shows the approximate points on each side, using today&rsquo;s card values (see <a href="#points" className="text-yellow-400 hover:text-yellow-300">Points &amp; leaderboard</a>). It&rsquo;s a guide, not a rule. You can
          trade anything for anything. Remember that a print’s edition number goes with it, so a low number is worth more to whoever holds it, and the person giving up a rare version may care about more than the points.
        </Q>
        <Q q="Can I be told when a card I want is listed?">
          Yes. Cards on your <strong className="text-white">Looking for</strong> list alert you for every version. For something more specific, add a <strong className="text-white">saved alert</strong> in <Link href="/settings#watches" className="text-yellow-400 hover:text-yellow-300">Settings</Link>, such as &ldquo;a Shiny Full Art Gouda&rdquo; (up to 10). When someone posts a matching card on the open board you get a notice in the bell, and in the Twitch extension the listing is tagged <em>On your list</em>. You can turn these notices off in Settings.
        </Q>
        <Q q="Trading seems to be switched off">
          Trading can be paused by the streamer, for example while something is being fixed. While it&rsquo;s paused nothing new can be offered or accepted, but you can still cancel your own offers to get your cards back.
        </Q>
        <Q q="Can I trade in the Twitch extension?">
          Yes. The extension has a Trades tab where you can accept, decline or <strong className="text-white">counter</strong> offers, take listings from the open board, cancel your own offers and make new ones (name a viewer, or leave the name empty to post on the board). Listings for cards on your Looking for list or saved alerts are tagged <em>On your list</em>, and the tab shows a dot when one appears. It works exactly like the website, so your offers and cards are the same in both places. The website also has extras such as matches and the full history.
        </Q>
      </Section>

      {/* ── Your profile ── */}
      <Section id="profile" title="Your profile" icon="user">
        <Q q="What is on a profile?" open>
          Every collector has a public profile with an <em>Overview</em>, their <em>Collection</em>, <em>Stats</em>, <em>Trades</em> and <em>Activity</em>. The Collection tab lets you search, filter by rarity or pack, sort, and (when you are
          logged in and looking at someone else) compare what you each have.
        </Q>
        <Q q="Can I change how my profile looks?">
          Yes. On your own profile press <strong className="text-white">Customize profile</strong>: drag widgets to rearrange them, drag a widget&rsquo;s edge (or use the arrows) to resize it, remove the ones you do not want
          and add others from the list, then Save. You can show your best cards, rarity progress, latest numbered prints, awards, a Looking for list and more. In <Link href="/settings" className="text-yellow-400 hover:text-yellow-300">Settings</Link> you can also add a short bio.
        </Q>
        <Q q="What are achievements?" id="achievements">
          Goals for collecting. They show on your profile and are earned per season, for example <strong className="text-white">Completed Season 1</strong> (one of every card), <strong className="text-white">All Common</strong>,
          <strong className="text-white"> All Rare</strong> and so on for each rarity, <strong className="text-white">All Reverse Holo</strong>, <strong className="text-white">All Full Art</strong>, <strong className="text-white">All Shiny</strong> and the
          <strong className="text-white"> Master set</strong> (every card in every version). There are goals about edition numbers too: <strong className="text-white">First edition</strong> (hold edition #1 of any card), <strong className="text-white">First shiny edition</strong>, <strong className="text-white">Five firsts</strong> (edition #1 of five different cards) and <strong className="text-white">Early bird</strong> (a print low enough to earn the edition bonus). Your profile also shows how close you are to the next ones. Once you earn an achievement it is yours to keep, even if you later trade cards away.
          They are different from <em>awards</em>, which are the prizes given for finishing high on a season&rsquo;s leaderboard.
        </Q>
        <Q q="Can I share my cards as an image?">
          Yes: the <em>Share</em> menu on a profile (and the <em>Share</em> tab on your own), <em>Share my stats</em> on My Stats and <em>Share this card</em> on a card or print page make a picture you can post or download.
        </Q>
        <Q q="Can I hide my profile?">
          In Settings, <em>Private profile</em> leaves you off the leaderboard, card owner lists and recent pulls and hides your profile page: anyone else who opens it sees only that it is private (you still see your own). Your cards still appear on stream when
          they are shown there.
        </Q>
        <Q q="What are the experimental features?">
          Early features you can switch on in Settings, such as keyboard shortcuts (press <kbd className="kbd">g</kbd> then a letter to jump between pages, or <kbd className="kbd">?</kbd> for the list) and a profile accent colour. They may change or go away.
        </Q>
      </Section>

      {/* ── Showing off ── */}
      <Section id="show" title="Showing off your cards" icon="image">
        <Q q="How do I show off my cards?" open>
          <ul className="list-disc pl-5 space-y-1 marker:text-gray-600">
            <li><strong className="text-white">Share</strong> on a profile has the link and a quick picture of that collector's best cards, with their version and edition number, plus rank and progress. On your own profile, the <strong className="text-white">Share</strong> tab lets you choose a theme, a post or story shape, a stats poster, and exactly which cards go in.</li>
            <li><strong className="text-white">Share my stats</strong> on My Stats makes a picture of your score and top cards.</li>
            <li><strong className="text-white">Share this card</strong> on a card in the Card Dex, or on a print&rsquo;s own page, makes a picture of that one card. On a print&rsquo;s page you can pick a theme and shape, and the picture carries a slim engraved plate with its print number and a QR code.</li>
            <li>The <strong className="text-white">Share</strong> button on your profile copies its link, so anyone can open it.</li>
          </ul>
        </Q>
        <Q q="Can I show a card on stream?">
          Yes, when {CHANNEL_NAME} is live you can use the show-off command in chat and your card appears on the stream with its version and edition number. Name the card (or its number) and, if you like, the version first,
          for example <em>shiny gouda goat</em>; with nothing after the command it shows your most valuable card. You can only show cards you own, and once every {SHOWOFF_COOLDOWN_S} seconds. If the card has more than one match, be a little more specific.
        </Q>
        <Q q="Can I download the pictures?">
          Yes. On a phone the share button opens your share sheet; on a computer it downloads the picture as a PNG you can post anywhere.
        </Q>
        <Q q="Can I see my collection as a binder?">
          Yes. On your profile&rsquo;s Collection tab, switch from <strong className="text-white">Grid</strong> to <strong className="text-white">Binder</strong>. Your cards sit in pockets, a pack at a time, with an empty pocket for each card you still need. Turn the pages with the buttons or the arrow keys, and click a card to see its details.
        </Q>
        <Q q="Can I customise my binder?" id="binder">
          Yes. On your own Collection tab, switch to the binder and press <strong className="text-white">Customise binder</strong>. You can name the cover and pick its colour, material and emblem, choose the page colour, pocket style and how cards you don&rsquo;t have yet look, and set how many pockets are on a page (2 to 4 across, 1 to 4 down).
          Pages can fill automatically (sorted by number, rarity or name, with or without a fresh page per pack, optionally leaving out cards you don&rsquo;t have) or you can set <strong className="text-white">Placed by hand</strong>: add, rename, reorder and delete pages, then tap a pocket and a card to fill it, or drag cards in. Each pocket can show a particular version, and a pocket can hold a card you don&rsquo;t own yet as a goal.
          Everyone who visits your profile sees your binder the way you set it, and <strong className="text-white">Share this page</strong> makes a picture of the cards on the pages in view.
        </Q>
        <Q q="How is the print of the week chosen?">
          Every Sunday evening the game looks through the active season&rsquo;s prints and features the one with the most interesting journey on the home page. A print earns points for each different collector who has held it, each completed trade it went through, being edition #1, being a Shiny or Full Art, its age (up to 8 weeks) and being forged in an upgrade. The highest score wins, a print is not picked again for 8 weeks, and prints sitting in a trade offer are skipped. Press <em>See its journey</em> to read the whole story. If the featured print is spent in an upgrade or removed, the section disappears until the next pick.
        </Q>
        <Q q="Can I show off one special print on my profile?">
          Yes. Open one of your prints (click its number in your card details) and press <strong className="text-white">Pin to my profile</strong>. It appears as a card on your profile that visitors can flip over to see its engraved print number, and you can share a picture of it. If you trade the print away it stops being shown.
        </Q>
        <Q q="Can I make my profile look the way I want?">
          Yes, see <a href="#profile" className="text-yellow-400 hover:text-yellow-300">Your profile</a>: arrange the widgets, show your best cards, and add a bio.
        </Q>
      </Section>

      {/* ── Points & leaderboard ── */}
      <Section id="points" title="Points & leaderboard" icon="trophy">
        <Q q="How are points worked out?" open>
          <p>
            Your score is the value of <strong className="text-white">every card you own</strong>, duplicates included. Each print is worth:
          </p>
          <p className="font-display text-xl font-bold text-yellow-300 my-2">{scoring.baseScore} × rarity{upgradesOn ? ' × version' : ''} × edition bonus</p>
          <ul className="space-y-2">
            <li>
              <strong className="text-white">Rarity</strong>: how hard the card is to pull compared with an average card. A card that comes up half as often is worth twice as much.
            </li>
            <li>
              <strong className="text-white">Edition bonus</strong>: {scoring.serialBonusCutoff > 0 ? (
                <>every print has an <a href="#serials" className="text-yellow-400 hover:text-yellow-300">edition number</a>, and the first prints ever made of a card (in each version) are worth extra. Edition #1 is worth{' '}
                <strong className="text-white">{scoring.serialBonusMax}×</strong>, and the bonus fades in a straight line until it is gone after #{scoring.serialBonusCutoff}. The bonus belongs to the print, so it moves with it if you trade it.</>
              ) : 'switched off in this game, so every print of a version is worth the same.'}
            </li>
            {upgradesOn && (
              <li>
                <strong className="text-white">Version</strong>: Reverse Holo, Full Art and Shiny Full Art prints are worth far more than a Regular. An upgraded card is normally worth more than the prints you spend to
                make it, though the edition bonus on the prints you spend can change that.
              </li>
            )}
          </ul>
          <p className="mt-2">
            Add up all your prints, then add the <a href="#bonuses" className="text-yellow-400 hover:text-yellow-300">collection bonuses</a> below, and that&rsquo;s your score on the{' '}
            <Link href="/leaderboard" className="text-yellow-400 hover:text-yellow-300">leaderboard</Link>.
          </p>
        </Q>
        <Q q="What are the collection bonuses?">
          <p id="bonuses">
            Collecting more of the set pays off, on top of what your individual cards are worth. There are two bonuses, both measured against the <strong className="text-white">set value</strong>: what one
            Regular print of every card in the season is worth right now{overview ? <> (currently <strong className="text-white">{overview.values.setValue.toLocaleString()}</strong> points)</> : null}:
          </p>
          <ul className="list-disc pl-5 space-y-1 marker:text-gray-600 mt-2">
            <li>
              <strong className="text-white">Progress bonus</strong> (it used to be called the completion bonus): grows with the share of the set you own, up to{' '}
              <strong className="text-white">{scoring.completionBonusPct}%</strong> of the set value
              {bonusAtFull ? <> (about <strong className="text-white">{bonusAtFull.completion.toLocaleString()}</strong> points at 100%)</> : null}. Every new card you find adds its own points <em>and</em> raises this.
            </li>
            <li>
              <strong className="text-white">Full set bonus</strong> (it used to be called the complete collection bonus): own at least one of <em>every</em> card in the season and you earn an extra{' '}
              <strong className="text-white">{scoring.completeSetBonusPct}%</strong> of the set value
              {bonusAtFull ? <> (about <strong className="text-white">{bonusAtFull.set.toLocaleString()}</strong> points)</> : null}, and a <strong className="text-white"><Icon name="cheese" className="mr-1" />Complete</strong> badge on the leaderboard.
            </li>
          </ul>
          <p className="mt-2">
            Duplicates and rarer versions don&rsquo;t count towards completeness. Only having at least one print of each card does. The bonuses move with the set value, so they stay in proportion as card values shift. You can see your own
            breakdown on <Link href="/account" className="text-yellow-400 hover:text-yellow-300">My stats</Link>.
          </p>
        </Q>
        <Q q="Can I see the exact maths for a card?">
          <p>
            Yes. Click any card on the <Link href="/cards" className="text-yellow-400 hover:text-yellow-300">card dex</Link> or in a collection to open its details, then open{' '}
            <strong className="text-white"><Icon name="nerd" className="mr-1" />Advanced information (for nerds)</strong>. It shows every step with the real numbers filled in, for each version: the pull chance, rarity, the version multiplier
            and the final rounding, plus the pull odds, how many packs you&rsquo;d expect to need, and what the edition bonus is worth at different numbers. In short:
          </p>
          <p className="font-mono text-[12px] text-gray-300 my-2 leading-relaxed">
            points = max(1, round( {scoring.baseScore} × rarity × version × edition bonus ))<br />
            rarity = (1 ÷ (pull chance × cards in the season)) ^ {scoring.rarityExponent}<br />
            edition bonus = 1 + ({scoring.serialBonusMax} − 1) × (1 − (edition − 1) ÷ {scoring.serialBonusCutoff}) for edition 1 to {scoring.serialBonusCutoff}, otherwise 1<br />
            version = max( Regular weight ÷ version weight, previous version × upgrade cost × {scoring.upgradeMargin} )
          </p>
          <p>
            The {scoring.baseScore}, the limits and the margin are settings the streamer can change, so the numbers above are today&rsquo;s. Cards sitting in an open trade (escrow) aren&rsquo;t counted as prints in anyone&rsquo;s collection.
          </p>
        </Q>
        <Q q="Why did my points change?">
          A print’s own points only change if the streamer edits the scoring settings or the card’s pull odds change. What moves most is your rank, because other collectors keep pulling and the completion bonus is measured against the set value. An edition bonus never changes: it is fixed by the edition number on the print.
        </Q>
        <Q q="Does upgrading raise my score?">
          {upgradesOn ? (
            <>
              Usually, yes. A higher version is worth much more. But upgrades <strong className="text-white">use cards up</strong>: the prints you spend are destroyed (the newest edition numbers go first, so your lowest numbers are the last to go), and the new print gets the next free edition of its version, which is only worth a bonus while it is still early in that version’s count. <Link href="/account" className="text-yellow-400 hover:text-yellow-300">My stats</Link>{' '}
              shows a projected change for each upgrade with all of this included, so occasionally it can be negative.
            </>
          ) : (
            <>Upgrades only exist in seasons with variants. When they do, My stats shows the projected points change for each upgrade before you commit.</>
          )}
        </Q>
        <Q q="Is there a leaderboard for each season?">
          Yes. Every season has its own leaderboard, and past seasons stay available. When a season ends, its leaderboard shows the final standings saved at that moment, with the season&rsquo;s awards. Use the season buttons at the top of the <Link href="/leaderboard" className="text-yellow-400 hover:text-yellow-300">leaderboard</Link>,{' '}
          <Link href="/stats" className="text-yellow-400 hover:text-yellow-300">stats</Link> and <Link href="/cards" className="text-yellow-400 hover:text-yellow-300">card dex</Link> pages.
        </Q>
        {valueRows.length > 0 && (
          <Q q={`What is each card worth right now? (${season?.name})`}>
            <p className="mb-3">Points per print at this moment. These update as cards are pulled and upgraded.</p>
            <div className="overflow-x-auto rounded-lg border border-gray-800">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 text-left bg-gray-950/50">
                    <th className="py-2 px-3 font-medium">Card</th>
                    <th className="py-2 px-2 font-medium text-right">Prints</th>
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
                        <td key={x} className="py-1.5 px-2 text-right tabular-nums text-gray-400">{upgradable ? v!.values[x] : '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {upgradesOn && <p className="text-[11px] text-gray-600 mt-2">RH = Reverse Holo · FA = Full Art · SH = Shiny Full Art.</p>}
          </Q>
        )}
      </Section>

      {/* ── Seasons ── */}
      <Section id="seasons" title="Seasons" icon="calendar">
        <Q q="What is a season?" open>
          The game runs in seasons. Each season has its own set of cards and packs, its own collections and its own leaderboard, so everyone starts fresh and the rules (like version odds and upgrade costs) can change between them.
          Your collection page shows the current season. Cards you collected in an earlier season stay with that season.
        </Q>
        <Q q="Can I see old seasons?">
          Yes. The leaderboard, season stats and card dex all have season buttons at the top so you can look back.
        </Q>
      </Section>

      {/* ── Extension ── */}
      <Section id="extension" title="Twitch extension" icon="tv">
        <Q q="How do I use the extension?" open>
          Open {CHANNEL_NAME}&rsquo;s stream on Twitch and look under the video for the card collection panel (on mobile it&rsquo;s in the extensions tab, and on desktop it can also appear on the video). Press
          <strong className="text-white"> Login with Twitch</strong> and allow Twitch&rsquo;s &ldquo;share your identity&rdquo; prompt. Your collection appears, with the same cards as on the website.
        </Q>
        <Q q="The extension doesn&rsquo;t show my cards">
          Make sure you pressed Login and accepted Twitch&rsquo;s prompt. Use the refresh button in the panel after a pull. If it still looks wrong, log out and back in.
        </Q>
      </Section>

      {/* ── Privacy ── */}
      <Section id="privacy" title="Privacy & data" icon="lock">
        <Q q="What can other people see?" open>
          Collections, the leaderboard, season stats, recent pulls and each print&rsquo;s history are public, and your username appears on stream when your cards are shown. A private profile hides you from the boards and feeds. The full details are in the{' '}
          <Link href="/privacy" className="text-yellow-400 hover:text-yellow-300">Privacy Policy</Link>; the rules of the game are in the <Link href="/terms" className="text-yellow-400 hover:text-yellow-300">Terms</Link>.
        </Q>
        <Q q="What do you store about me?">
          Your Twitch username and ID, your cards and score, and a short log of recent game events. Logging in on the website uses a login cookie; the Twitch access token isn&rsquo;t kept.
        </Q>
        <Q q="Can I download my data?">
          Yes: <Link href="/settings" className="text-yellow-400 hover:text-yellow-300">Settings</Link> has a <em>Download my data</em> button that gives you your profile, settings, collections, trade offers, notices and alert devices as a file.
        </Q>
        <Q q="How do I get my data deleted?">
          Ask the person who runs the game:{' '}
          {CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`} className="text-yellow-400 hover:text-yellow-300 underline">{CONTACT_EMAIL}</a> : <>contact {OPERATOR} through the stream&rsquo;s Twitch channel</>}
          . Logging out only ends your session; it doesn&rsquo;t delete your collection.
        </Q>
      </Section>

      {/* ── Help ── */}
      <Section id="help" title="Something not working?" icon="wrench">
        <Q q="I can&rsquo;t log in on the website" open>
          Try again. The sign-in link only lasts a few minutes and must finish in the same browser. If you pressed <em>Cancel</em> on Twitch&rsquo;s page we can&rsquo;t log you in. Make sure cookies are allowed for this site.
        </Q>
        <Q q="Why am I asked for a &ldquo;quick check&rdquo; when I trade or upgrade?" id="captcha">
          To stop bots from spamming trades and upgrades. It&rsquo;s a short Cloudflare check that usually passes on its own; if it does ask you to tick a box, do that and your trade or upgrade carries on.
          After you pass you won&rsquo;t be asked again for about 15 minutes. If it keeps failing, turn off any VPN or tracker-blocking extension for this site, or try another browser. The Twitch panel doesn&rsquo;t use it.
        </Q>
        <Q q="How do I find things quickly?">
          Press <kbd className="kbd">/</kbd> (or Ctrl/⌘ + K) anywhere to search for a collector, a card or a page. The leaderboard can be searched and ranked by points, different cards, prints or shinies, and shows who moved up or down since you last looked.
        </Q>
        <Q q="A card or my score looks wrong">
          Refresh first. Scores are recalculated whenever anyone pulls or upgrades, so they can move even when you haven&rsquo;t done anything. If something still looks wrong, tell the streamer in chat.
        </Q>
      </Section>
    </div>
  );
}

function Section({ id, title, icon, children }: { id: string; title: string; icon: IconName; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
        <span aria-hidden className="w-10 h-10 rounded-full bg-yellow-500/15 flex items-center justify-center text-xl"><Icon name={icon} className="w-5 h-5 text-yellow-400" /></span>
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Q({ q, open, id, children }: { q: string; open?: boolean; id?: string; children: ReactNode }) {
  return (
    <details id={id} open={open} className="group rind rounded-xl overflow-hidden">
      <summary className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-white">{q}</span>
        <span aria-hidden className="text-yellow-500 text-lg leading-none transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="px-4 pb-4 text-sm text-gray-300 leading-relaxed">{children}</div>
    </details>
  );
}
