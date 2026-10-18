import Link from 'next/link';
import type { TradeSettings } from '@/lib/trade-core';
import { Section, Q } from '../parts';

export function TradingSection({ trade }: { trade: TradeSettings }) {
  return (
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
      <Q q="What is escrow? Where do my cards go while an offer is open?" id="escrow">
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
      <Q q="Can I get notifications by email?">
        Yes, once the site has email set up. In <Link href="/settings#email" className="text-yellow-400 hover:text-yellow-300">Settings</Link>, under notifications, type your address and press <em>Send confirmation</em>, then open the link we email you. Nothing else is sent until you do. By default you get trade offers, counters and how your offers ended; you can add listing alerts and messages from the admins. You get at most one email every 15 minutes: anything that happens in between is sent together in one email. Every email has a link to stop them with one click, and you can remove your address in Settings at any time. Your address is never shown to other collectors.
      </Q>
      <Q q="Which of my prints get traded?">
        Unless you choose, trades move your <strong className="text-white">newest</strong> prints of a card first, so the low edition numbers you pulled earliest stay with you. If you hold more prints of a card than the trade needs, <strong className="text-white">Choose prints</strong> in the offer lets you tick exactly which ones to give (a warning appears for Edition #1 and prints that earn an edition bonus). You can ask for a specific print of someone&rsquo;s when you offer them a trade directly, and when you take a listing or accept an offer that asks for a card you have spares of, you pick which of yours to hand over before the final tap. See <a href="#serials" className="text-yellow-400 hover:text-yellow-300">prints and editions</a>.
      </Q>
      <Q q="Can I protect a print from being traded?">
        Yes. Press <strong className="text-white">Favourite</strong> on a print&rsquo;s page, or in the card details on your collection, to mark it (up to 50 prints). A favourite print can&rsquo;t be put in an offer, can&rsquo;t be taken when someone accepts your offer or takes your listing, and isn&rsquo;t spent when you upgrade duplicates. When a trade or an upgrade picks prints for you it skips your favourites, and if only favourites are left it stops and says so. Remove the mark whenever you want to trade it. Prints in an open offer can&rsquo;t be favourited until the offer ends.
      </Q>
      <Q q="Is a trade fair? How do I know what a card is worth?" id="fair-trade">
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
  );
}
