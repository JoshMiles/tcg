// The FAQ's built-in questions, as data. Staff can override a question's wording or hide it (lib/faq-core.ts `overrides`); the text here
// stays the default, so a copy fix made here reaches every question nobody has edited.
// Answers use the custom-answer syntax: paragraphs, "- " lists, **bold**, *italic*, `key`, [text](href), plus {placeholders} for live
// values (lib/faq-core.ts `fillFaqPlaceholders`, values built in app/(site)/faq/context.ts) and a line holding only {{block_name}} for
// a live block (app/(site)/faq/blocks.tsx). Ids double as page anchors (/faq#not-nfts), so never rename one that is linked.

export type FaqWhen = 'upgrades' | 'no_upgrades' | 'values';

export interface FaqBuiltin {
  id: string;
  sectionId: string;
  question: string;
  answer: string;
  /** Starts expanded. */
  open?: boolean;
  /** Only shown when the live data says so: this season has upgrades, has none, or has card values to list. */
  when?: FaqWhen;
  /** Extra anchor ids that land on this question (old links). */
  anchors?: string[];
}

export const FAQ_BUILTINS: FaqBuiltin[] = [
  // ---- Getting started ----
  {
    id: 'what-is-tcg', sectionId: 'start', open: true,
    question: 'What is The Cheesy TCG?',
    answer: `A collectible card game played live on {channel}’s Twitch channel. Packs are opened on stream, the cards you pull go into your collection, and you can hunt for rare versions, upgrade your duplicates and climb the leaderboard. It’s a fan-made community game and isn’t affiliated with Twitch.`,
  },
  {
    id: 'not-nfts', sectionId: 'start',
    question: 'Are the cards NFTs or worth real money?',
    answer: `No. The cards are **virtual trading cards for fun**: entries in this game’s own database, not NFTs, tokens, crypto or anything on a blockchain. They aren’t assets or property, have no cash value, and can’t be bought, sold or cashed out, here or anywhere else. Serial numbers and rarities are just part of the game. If anyone offers to sell you our cards, or to “mint” them, it isn’t us. See the [Terms](/terms).`,
  },
  {
    id: 'where-to-play', sectionId: 'start',
    question: 'Where can I play?',
    answer: `Only on [{channel}’s Twitch channel]({channel_url}). It doesn’t run anywhere else. Packs are opened live there, and the Twitch extension is only available on that channel. This website just lets you look at your collection and, when you’re logged in, upgrade your cards.`,
  },
  {
    id: 'app', sectionId: 'start',
    question: 'Is there an app?',
    answer: `There’s no app store version, but you can add the website to your home screen on iPhone, Android or a computer so it opens full screen from its own icon. Step-by-step instructions are on the [Get the app](/install) page. On iPhone you’ll need to log in with Twitch once inside the home-screen app.`,
  },
  {
    id: 'get-cards', sectionId: 'start',
    question: 'How do I get cards?',
    answer: `Packs are opened live on {channel}’s stream. When one is opened for you, your name appears on screen with the card you pulled, and it’s added to your collection straight away. In short:

- **Follow**, **subscribe**, or **gift subs**: each is a way to earn packs.

The chat commands, including how to ask for a pack, are under [Chat commands](#commands).

Exactly how many packs each of these gives can change from season to season and stream to stream, so watch the channel (and its chat commands) for what is running right now.`,
  },
  {
    id: 'pull-limit', sectionId: 'start',
    question: 'Is there a limit to how many cards I can get per stream?',
    answer: `There is no limit on paid pulls until staff set one. They can set a limit for regular viewers, subscribers, VIPs, moderators and the broadcaster, and a personal limit for you that replaces yours. They can also add extra pulls for everyone for the current stream, and grant you a personal bonus. A limit of 0 means no limit, and a bonus does not change that. A gifted sub earns a pack. It does not raise your pull limit.`,
  },
  {
    id: 'see-cards', sectionId: 'start',
    question: 'Where can I see my cards?',
    answer: `- On the website: every collector has a public profile with their collection. Use [Collectors](/collection) or the search box at the top (press \`/\`) to find anyone.
- Logged in, **My profile** and **My stats** are in the menu at the top right.
- In Twitch, under the stream, with the extension (see [Twitch extension](#extension)).`,
  },
  {
    id: 'need-account', sectionId: 'start',
    question: 'Do I need an account?',
    answer: `Not to browse. Collections, the leaderboard, season stats and the card dex are open to everyone. **Log in with Twitch** to see your own stats and to upgrade cards on the website, trade, customise your profile and change your settings. Logging in only shares your basic public Twitch profile (we ask for no extra permissions).`,
  },
  {
    id: 'cant-find-collection', sectionId: 'start',
    question: 'I can’t find my collection',
    answer: `A collection appears once you’ve pulled at least one card this season. Check the spelling of your Twitch username (capitals don’t matter). If you’ve just pulled something, refresh the page.`,
  },

  // ---- Chat commands ----
  {
    id: 'chat-commands', sectionId: 'commands',
    question: 'Which commands can I type in chat?',
    answer: `These work in {channel}’s chat while the stream is on:

{{chat_commands}}`,
  },

  // ---- Cards & versions ----
  {
    id: 'stars', sectionId: 'cards', open: true,
    question: 'What do the stars mean?',
    answer: `Each card has a rarity from one to five stars:

{{rarities}}

Rarer cards are pulled less often and are worth more points. The [Card dex](/cards) shows every card with its exact pull chance (for example “1 in 12 pulls”).`,
  },
  {
    id: 'versions', sectionId: 'cards', when: 'upgrades',
    question: 'What are the different versions of a card?',
    answer: `In seasons with variants, every card can be pulled in rarer versions. The art is the same card with more or less flair:

- **Regular**: the standard card.
- **Reverse Holo**: the regular art with a holographic shimmer.
- **Full Art**: a bolder full-art version of the card.
- **Full Art Holo**: the full art with the holographic shimmer, and it gently rocks on screen.
- **Golden**: a golden full-art version of the card, the rarest of all when enabled in a pack.`,
  },
  {
    id: 'versions-none', sectionId: 'cards', when: 'no_upgrades',
    question: 'What are the different versions of a card?',
    answer: `Some seasons add Reverse Holo, Full Art, Full Art Holo and Golden versions of every card. The current season has a single version of each card, but if variants come back they’ll be explained here.`,
  },
  {
    id: 'version-odds', sectionId: 'cards', when: 'upgrades',
    question: 'How likely is each version?',
    answer: `First a card is picked, then its version is rolled. In the current season that works out to roughly **{pct_regular}%** Regular, **{pct_reverse}%** Reverse Holo, **{pct_full}%** Full Art and **{pct_shiny}%** Full Art Holo{golden_clause}. These numbers can change between seasons.`,
  },
  {
    id: 'unseen-cards', sectionId: 'cards',
    question: 'Can I see cards I haven’t found yet?',
    answer: `Yes. The [Card dex](/cards) lists every card in the season. On your own collection page, cards you haven’t pulled yet show as a **?**.`,
  },
  {
    id: 'serials', sectionId: 'cards', open: true, anchors: ['prints'],
    question: 'What are editions and serial numbers?',
    answer: `Every card you own is an **edition**, and every edition has two numbers. Its **serial number** (like Serial #1023381) is different for every edition in the whole game and is how you refer to it: type it in the search box or open \`/p/1023381\`. Its **edition number** is counted per card and per version of that card, and is the one that earns the edition bonus. For example, your Full Art Holo Gouda Goat edition #3 is the third Full Art Holo Gouda Goat drawn. Open a card in your collection to see your editions, and press one to see its page and its journey: who pulled it, who has held it and for how long, and where it has been traded or forged in an upgrade. Editions that existed before editions were numbered were numbered afterwards, so their order is an estimate (shown with a ~). On an edition’s page and in your card details the card can be turned over: move the pointer over it to tilt it, then tap it or press *Flip* to see the engraved back with the serial number and the date. When you upgrade, the spent editions are retired and the new edition remembers what it was made from.`,
  },
  {
    id: 'trainer-cards', sectionId: 'cards',
    question: 'What is a trainer card?',
    answer: `Trainer cards are special cards that grant a temporary buff when used, such as an extra card pack, bonus points or special perks. When you own a Regular edition of a trainer card, open its card details in your collection and tap **Use trainer card** (then tap again to confirm). Using the card activates its buff and consumes one Regular edition of the card.`,
  },

  // ---- Trading ----
  {
    id: 'how-trading-works', sectionId: 'trading', open: true,
    question: 'How does trading work?',
    answer: `Open the [Trade](/trade) page (you need to be logged in with Twitch) and make an offer: pick the cards you give and the cards you want back. Any edition of any version can be traded. There are two kinds of offer:

- **To one person**: only they can accept, decline or counter it. You can start one from the “Trade with…” button on their profile.
- **On the open board**: a listing anyone can take, as long as they own what you ask for.

When someone accepts, the swap happens instantly and both collections update. There are no fees and no randomness. Accept, Take this trade, Decline and Cancel each ask for a second tap (“Sure?”) before they do anything, so a stray tap can’t swap your cards.`,
  },
  {
    id: 'escrow', sectionId: 'trading',
    question: 'What is escrow? Where do my cards go while an offer is open?',
    answer: `When you send an offer, the card you are trading leaves your collection and is **held safely in escrow**. That guarantees you really have it, so nobody can accept an offer you can’t honour. It comes straight back to you if the offer is declined, cancelled, countered or runs out of time, and goes to the other person if the offer is accepted. While a card is in escrow it doesn’t count towards your points.`,
  },
  {
    id: 'offer-limits', sectionId: 'trading',
    question: 'How long do offers last, and what are the limits?',
    answer: `Offers last **{trade_expiry_hours} hours**. After that they end and your cards are returned (you may need to open the site once for the cards to reappear in your collection). To keep things fair and tidy, you can have up to **{trade_max_open}** open offers at once, wait about **{trade_cooldown_seconds} seconds** between offers, and each side of an offer can include up to **{trade_max_stacks}** different card and version combinations. You can cancel an offer yourself whenever you like.`,
  },
  {
    id: 'counter-offer', sectionId: 'trading',
    question: 'What is a counter-offer?',
    answer: `If someone sends you an offer you almost like, press *Counter*. Their offer is closed and their cards go back to them; you pick a different swap, which is sent back to them to accept or counter in turn.`,
  },
  {
    id: 'offer-answers', sectionId: 'trading',
    question: 'How will I know if someone answers my offer?',
    answer: `The bell in the top bar tells you when you get an offer or counter-offer, and when yours is accepted, declined, withdrawn or runs out. When someone accepts one of your offers you also get a short trade animation showing the swap (you can replay it from the bell).`,
  },
  {
    id: 'find-trade', sectionId: 'trading',
    question: 'How do I find a good trade?',
    answer: `The Trade page has three tabs: *Your trades*, *The board* and *History*. **Matches for you** picks out board listings you can take that give a card you are looking for or do not have yet, or that only ask for your spare editions. On the board you can search, filter (for example “I can take”) and sort by points. When you make an offer to someone, quick picks show the cards they are looking for that you own and the cards you want that they have. Add cards to your own *Looking for* list from the Card Dex, My Stats or Settings.`,
  },
  {
    id: 'offer-settings', sectionId: 'trading',
    question: 'Can I stop getting offers or notifications?',
    answer: `Yes. In [Settings](/settings) you can stop other collectors sending you direct offers (the open board and counters to your own offers still work) and switch off bell notices for new offers or for how your offers ended. Notices from an admin always come through. New notices appear within about ten seconds while the site is open, with a small pop-up, a count in the tab title, and an optional sound (off unless you switch it on in Settings).`,
  },
  {
    id: 'phone-alerts', sectionId: 'trading',
    question: 'How do I get alerts on my phone?',
    answer: `In [Settings](/settings#push), under notifications, tap *Turn on alerts for this device* and allow notifications when your phone or browser asks. Then an offer, a counter or the result of your offer reaches you even when the site is closed. On an iPhone or iPad you first need to [add the app to your Home Screen](/install) and open it from there (iOS 16.4 or newer). You can choose which kinds of alert you want, send yourself a test, and remove a device at any time. If you blocked notifications by mistake, allow them again in your browser or phone settings for this site. The option only shows once the site has alerts set up.`,
  },
  {
    id: 'which-editions', sectionId: 'trading',
    question: 'Which of my editions get traded?',
    answer: `Unless you choose, trades move your **newest** editions of a card first, so the low edition numbers you pulled earliest stay with you. If you hold more editions of a card than the trade needs, **Choose editions** in the offer lets you tick exactly which ones to give (a warning appears for Edition #1 and editions that earn a edition bonus). You can ask for a specific edition of someone’s when you offer them a trade directly, and when you take a listing or accept an offer that asks for a card you have spares of, you pick which of yours to hand over before the final tap. See [editions and prints](#serials).`,
  },
  {
    id: 'protect-edition', sectionId: 'trading',
    question: 'Can I protect an edition from being traded?',
    answer: `Yes. Press **Favourite** on an edition’s page, or in the card details on your collection, to mark it (up to 50 editions). A favourite edition can’t be put in an offer, can’t be taken when someone accepts your offer or takes your listing, and isn’t spent when you upgrade duplicates. When a trade or an upgrade picks editions for you it skips your favourites, and if only favourites are left it stops and says so. Remove the mark whenever you want to trade it. Editions in an open offer can’t be favourited until the offer ends.`,
  },
  {
    id: 'fair-trade', sectionId: 'trading',
    question: 'Is a trade fair? How do I know what a card is worth?',
    answer: `Every offer shows the approximate points on each side, using today’s card values (see [Points & leaderboard](#points)). It’s a guide, not a rule. You can trade anything for anything. Remember that an edition’s edition number goes with it, so a low number is worth more to whoever holds it, and the person giving up a rare version may care about more than the points.`,
  },
  {
    id: 'listing-alerts', sectionId: 'trading',
    question: 'Can I be told when a card I want is listed?',
    answer: `Yes. Cards on your **Looking for** list alert you for every version. For something more specific, add a **saved alert** in [Settings](/settings#watches), such as “a Full Art Holo Gouda” (up to 10). When someone posts a matching card on the open board you get a notice in the bell, and in the Twitch extension the listing is tagged *On your list*. You can turn these notices off in Settings.`,
  },
  {
    id: 'trading-off', sectionId: 'trading',
    question: 'Trading seems to be switched off',
    answer: `Trading can be paused by the streamer, for example while something is being fixed. While it’s paused nothing new can be offered or accepted, but you can still cancel your own offers to get your cards back.`,
  },
  {
    id: 'trade-extension', sectionId: 'trading',
    question: 'Can I trade in the Twitch extension?',
    answer: `Yes. The extension has a Trades tab where you can accept, decline or **counter** offers, take listings from the open board, cancel your own offers and make new ones (name a viewer, or leave the name empty to post on the board). Listings for cards on your Looking for list or saved alerts are tagged *On your list*, and the tab shows a dot when one appears. It works exactly like the website, so your offers and cards are the same in both places. The website also has extras such as matches and the full history.`,
  },

  // ---- Upgrading ----
  {
    id: 'how-upgrades-work', sectionId: 'upgrades', open: true, when: 'upgrades',
    question: 'How do upgrades work?',
    answer: `Collect duplicates of the same card in the same version, then trade them up one step:

- **{cost_reverse}** Regular → 1 **Reverse Holo**
- **{cost_full}** Reverse Holo → 1 **Full Art**
- **{cost_shiny}** Full Art → 1 **Full Art Holo**

That’s {cost_reverse} Regulars for a Reverse Holo, {regulars_for_full} for a Full Art and {regulars_for_shiny} for a Full Art Holo, counted from Regular editions alone.`,
  },
  {
    id: 'where-to-upgrade', sectionId: 'upgrades', when: 'upgrades',
    question: 'Where do I upgrade?',
    answer: `On the website, log in and open **My stats** (it lists what you can upgrade right now), or open one of your cards on your own collection page and use the Upgrade column. You can also upgrade from the Twitch extension.`,
  },
  {
    id: 'upgrade-rules', sectionId: 'upgrades', when: 'upgrades',
    question: 'What are the rules?',
    answer: `- Only one step at a time. No skipping from Regular straight to Full Art Holo.
- Only editions of the **same card and the same version** can be combined.
- Upgrades are **permanent**. The editions you spend are destroyed, so the Upgrade button asks you to tap twice (the first tap says “Sure?”).
- Only the current season can be upgraded.
- Some cards or packs can have upgrades turned off.`,
  },
  {
    id: 'upgrades-none', sectionId: 'upgrades', open: true, when: 'no_upgrades',
    question: 'Can I upgrade cards?',
    answer: `In seasons with variants you can combine duplicates to create rarer versions. The current season doesn’t use variants, so there’s nothing to upgrade right now. When it’s available, this section lists the exact costs.`,
  },
  {
    id: 'trade-instead', sectionId: 'upgrades',
    question: 'Can I trade cards with other people?',
    answer: `Yes. See [Trading](#trading). You can also trade duplicates for the version you’re missing instead of upgrading them.`,
  },
  {
    id: 'trade-upgraded', sectionId: 'upgrades',
    question: 'Can I trade upgraded cards?',
    answer: `Yes. Any edition of any version can be traded, including an upgraded one. A favourite, or an edition already in an offer, cannot. See [Trading](#trading).`,
  },

  // ---- Your profile ----
  {
    id: 'profile-contents', sectionId: 'profile', open: true,
    question: 'What is on a profile?',
    answer: `Every collector has a public profile with an *Overview*, their *Collection*, *Stats*, *Trades* and *Activity*. The Collection tab lets you search, filter by rarity or pack, sort, and (when you are logged in and looking at someone else) compare what you each have.`,
  },
  {
    id: 'customize-profile', sectionId: 'profile',
    question: 'Can I change how my profile looks?',
    answer: `Yes. On your own profile press **Customize profile**: drag widgets to rearrange them, drag a widget’s edge (or use the arrows) to resize it, remove the ones you do not want and add others from the list, then Save. You can show your best cards, rarity progress, latest numbered editions, awards, a Looking for list and more. In [Settings](/settings) you can also add a short bio.`,
  },
  {
    id: 'pronouns', sectionId: 'profile',
    question: 'Can I show my pronouns?',
    answer: `Yes, in [Settings](/settings) or with **Edit profile** on your own profile. They are off until you choose: pick one from a short list, or use the ones you set on pr.alejo.io for Twitch chat (we then look up your login there and remember the answer for a day). They show after your name on your profile.`,
  },
  {
    id: 'achievements', sectionId: 'profile',
    question: 'What are achievements?',
    answer: `Goals for collecting. They show on your profile and are earned per season, for example **Completed Season 1** (one of every card), **All Common**, **All Rare** and so on for each rarity, **All Reverse Holo**, **All Full Art**, **All Full Art Holo** and the **Master set** (every card in every version). There are goals about edition numbers too: **First edition** (hold edition #1 of any card), **First shiny edition**, **Five firsts** (edition #1 of five different cards) and **Early bird** (an edition with a low enough edition number to earn the edition bonus). Your profile also shows how close you are to the next ones. Once you earn an achievement it is yours to keep, even if you later trade cards away. They are different from *awards*, which are the prizes given for finishing high on a season’s leaderboard.`,
  },
  {
    id: 'share-image', sectionId: 'profile',
    question: 'Can I share my cards as an image?',
    answer: `Yes: the *Share* menu on a profile (and the *Share* tab on your own), *Share my stats* on My Stats and *Share this card* on a card or edition page make a picture you can post or download.`,
  },
  {
    id: 'hide-profile', sectionId: 'profile',
    question: 'Can I hide my profile?',
    answer: `In Settings, *Private profile* leaves you off the leaderboard, card owner lists and recent pulls and hides your profile page: anyone else who opens it sees only that it is private (you still see your own). Your cards still appear on stream when they are shown there.`,
  },
  {
    id: 'experimental', sectionId: 'profile',
    question: 'What are the experimental features?',
    answer: `Early features you can switch on in Settings, such as keyboard shortcuts (press \`g\` then a letter to jump between pages, or \`?\` for the list) and a profile accent colour. They may change or go away.`,
  },

  // ---- Showing off ----
  {
    id: 'show-off-cards', sectionId: 'show', open: true,
    question: 'How do I show off my cards?',
    answer: `- **Share** on a profile has the link and a quick picture of that collector's best cards, with their version and edition number, plus rank and progress. On your own profile, the **Share** tab lets you choose a theme, a post or story shape, a stats poster, and exactly which cards go in.
- **Share my stats** on My Stats makes a picture of your rank and score, a few key figures (collected, pulls, best edition, rarest edition, trades) and your three most valuable editions.
- **Share this card** on a card in the Card Dex, or on an edition’s own page, makes a picture of that one card. On an edition’s page you can pick a theme and shape, and the picture carries a slim engraved plate with its serial number and a QR code.
- The **Share** button on your profile copies its link, so anyone can open it.`,
  },
  {
    id: 'show-on-stream', sectionId: 'show',
    question: 'Can I show a card on stream?',
    answer: `Yes, when {channel} is live you can use the show-off command in chat and your card appears on the stream with its version and edition number. Name the card (or its number) and, if you like, the version first, for example *shiny gouda goat*; with nothing after the command it shows your most valuable card. You can only show cards you own, and once every {showoff_cooldown} seconds. If the card has more than one match, be a little more specific.`,
  },
  {
    id: 'download-pictures', sectionId: 'show',
    question: 'Can I download the pictures?',
    answer: `Yes. On a phone the share button opens your share sheet; on a computer it downloads the picture as a PNG you can post anywhere.`,
  },
  {
    id: 'binder-view', sectionId: 'show',
    question: 'Can I see my collection as a binder?',
    answer: `Yes. On your profile’s Collection tab, switch from **Grid** to **Binder**. Your cards sit in pockets, a pack at a time, with an empty pocket for each card you still need. Turn the pages with the buttons or the arrow keys, and click a card to see its details.`,
  },
  {
    id: 'binder', sectionId: 'show',
    question: 'Can I customise my binder?',
    answer: `Yes. On your own Collection tab, switch to the binder and press **Customise binder**. You can name the cover and pick its colour, material and emblem, choose the page colour, pocket style and how cards you don’t have yet look, and set how many pockets are on a page (2 to 4 across, 1 to 4 down). Pages can fill automatically (sorted by number, rarity or name, with or without a fresh page per pack, optionally leaving out cards you don’t have) or you can set **Placed by hand**: add, rename, reorder and delete pages, then tap a pocket and a card to fill it, or drag cards in. Each pocket can show a particular version, and a pocket can hold a card you don’t own yet as a goal. Everyone who visits your profile sees your binder the way you set it, and **Share this page** makes a picture of the cards on the pages in view.`,
  },
  {
    id: 'card-of-the-week', sectionId: 'show',
    question: 'How is the card of the week chosen?',
    answer: `Every Sunday evening the game looks through the active season’s editions and features the one with the most interesting journey on the home page. An edition earns points for each different collector who has held it, each completed trade it went through, being edition #1, being a Full Art Holo or Full Art, its age (up to 8 weeks) and being forged in an upgrade. The highest score wins, an edition is not picked again for 8 weeks, and editions sitting in a trade offer are skipped. Press *See its journey* to read the whole story. If the featured edition is spent in an upgrade or removed, the section disappears until the next pick.`,
  },
  {
    id: 'pin-edition', sectionId: 'show',
    question: 'Can I show off one special edition on my profile?',
    answer: `Yes. Open one of your editions (click its number in your card details) and press **Pin to my profile**. It appears as a card on your profile that visitors can flip over to see its engraved serial number, and you can share a picture of it. If you trade the edition away it stops being shown.`,
  },
  {
    id: 'profile-look', sectionId: 'show',
    question: 'Can I make my profile look the way I want?',
    answer: `Yes, see [Your profile](#profile): arrange the widgets, show your best cards, and add a bio.`,
  },

  // ---- Points & leaderboard ----
  {
    id: 'how-points', sectionId: 'points', open: true,
    question: 'How are points worked out?',
    answer: `Your score is the value of **every card you own**, duplicates included. Each edition is worth:

**{score_formula}**

- **Rarity**: how hard the card is to pull compared with an average card. A card that comes up half as often is worth twice as much.
- **Edition bonus**: {print_bonus_text}
{version_point}

Add up all your editions, then add the [collection bonuses](#bonuses) below, and that’s your score on the [leaderboard](/leaderboard).`,
  },
  {
    id: 'bonuses', sectionId: 'points',
    question: 'What are the collection bonuses?',
    answer: `Collecting more of the set pays off, on top of what your individual cards are worth. There are two bonuses, both measured against the **set value**: what one Regular edition of every card in the season is worth right now{set_value_clause}:

- **Progress bonus** (it used to be called the completion bonus): grows with the share of the set you own, up to **{completion_bonus_pct}%** of the set value{completion_at_full_clause}. Every new card you find adds its own points *and* raises this.
- **Full set bonus** (it used to be called the complete collection bonus): own at least one of *every* card in the season and you earn an extra **{set_bonus_pct}%** of the set value{set_at_full_clause}, and a **Complete** badge on the leaderboard.

Duplicates and rarer versions don’t count towards completeness. Only having at least one edition of each card does. The bonuses move with the set value, so they stay in proportion as card values shift. You can see your own breakdown on [My stats](/account).`,
  },
  {
    id: 'card-maths', sectionId: 'points',
    question: 'Can I see the exact maths for a card?',
    answer: `Yes. Click any card on the [card dex](/cards) or in a collection to open its details, then open **Advanced information (for nerds)**. It shows every step with the real numbers filled in, for each version: the pull chance, rarity, the version multiplier and the final rounding, plus the pull odds, how many packs you’d expect to need, and what the edition bonus is worth at different numbers. In short:

{{points_formula}}

The {base_score}, the limits and the margin are settings the streamer can change, so the numbers above are today’s. Cards sitting in an open trade (escrow) aren’t counted as editions in anyone’s collection.`,
  },
  {
    id: 'points-changed', sectionId: 'points',
    question: 'Why did my points change?',
    answer: `An edition’s own points only change if the streamer edits the scoring settings or the card’s pull odds change. What moves most is your rank, because other collectors keep pulling and the completion bonus is measured against the set value. A edition bonus never changes: it is fixed by the edition number on the edition.`,
  },
  {
    id: 'upgrade-score', sectionId: 'points', when: 'upgrades',
    question: 'Does upgrading raise my score?',
    answer: `Usually, yes. A higher version is worth much more. But upgrades **use cards up**: the editions you spend are destroyed (the newest edition numbers go first, so your lowest numbers are the last to go), and the new edition gets the next free edition number of its version, which is only worth a bonus while it is still early in that version’s count. [My stats](/account) shows a projected change for each upgrade with all of this included, so occasionally it can be negative.`,
  },
  {
    id: 'upgrade-score-none', sectionId: 'points', when: 'no_upgrades',
    question: 'Does upgrading raise my score?',
    answer: `Upgrades only exist in seasons with variants. When they do, My stats shows the projected points change for each upgrade before you commit.`,
  },
  {
    id: 'season-leaderboard', sectionId: 'points',
    question: 'Is there a leaderboard for each season?',
    answer: `Yes. Every season has its own leaderboard, and past seasons stay available. When a season ends, its leaderboard shows the final standings saved at that moment, with the season’s awards. Use the season buttons at the top of the [leaderboard](/leaderboard), [stats](/stats) and [card dex](/cards) pages.`,
  },
  {
    id: 'card-values', sectionId: 'points', when: 'values',
    question: 'What is each card worth right now? ({season})',
    answer: `Points per edition at this moment. These update as cards are pulled and upgraded.

{{card_values}}`,
  },

  // ---- Seasons ----
  {
    id: 'what-is-season', sectionId: 'seasons', open: true,
    question: 'What is a season?',
    answer: `The game runs in seasons. Each season has its own set of cards and packs, its own collections and its own leaderboard, so everyone starts fresh and the rules (like version odds and upgrade costs) can change between them. Your collection page shows the current season. Cards you collected in an earlier season stay with that season.`,
  },
  {
    id: 'old-seasons', sectionId: 'seasons',
    question: 'Can I see old seasons?',
    answer: `Yes. The leaderboard, season stats and card dex all have season buttons at the top so you can look back.`,
  },

  // ---- Twitch extension ----
  {
    id: 'use-extension', sectionId: 'extension', open: true,
    question: 'How do I use the extension?',
    answer: `Open {channel}’s stream on Twitch and look under the video for the card collection panel (on mobile it’s in the extensions tab, and on desktop it can also appear on the video). Press **Login with Twitch** and allow Twitch’s “share your identity” prompt. Your collection appears, with the same cards as on the website.`,
  },
  {
    id: 'extension-no-cards', sectionId: 'extension',
    question: 'The extension doesn’t show my cards',
    answer: `Make sure you pressed Login and accepted Twitch’s prompt. Use the refresh button in the panel after a pull. If it still looks wrong, log out and back in.`,
  },

  // ---- Privacy & data ----
  {
    id: 'what-others-see', sectionId: 'privacy', open: true,
    question: 'What can other people see?',
    answer: `Collections, the leaderboard, season stats, recent pulls and each edition’s history are public, and your username appears on stream when your cards are shown. A private profile hides you from the boards and feeds. The full details are in the [Privacy Policy](/privacy); the rules of the game are in the [Terms](/terms).`,
  },
  {
    id: 'what-we-store', sectionId: 'privacy',
    question: 'What do you store about me?',
    answer: `Your Twitch username and ID, your cards and score, and a short log of recent game events. Logging in on the website uses a login cookie; the Twitch access token isn’t kept.`,
  },
  {
    id: 'download-data', sectionId: 'privacy',
    question: 'Can I download my data?',
    answer: `Yes: [Settings](/settings) has a *Download my data* button that gives you your profile, settings, collections, trade offers, notices, alert devices as a file.`,
  },
  {
    id: 'delete-data', sectionId: 'privacy',
    question: 'How do I get my data deleted?',
    answer: `Go to [Settings](/settings#delete-account) and press *Request deletion* at the bottom (you type your login name to confirm). The team deletes your account, usually within about a month: your collection, settings, notices, alert devices are removed, the editions you held are retired, and your open trade offers are cancelled. It cannot be undone. A restore point is kept for 14 days only so a mistake can be fixed. Until it is handled you can cancel the request there. You can also ask the person who runs the game: {contact}. Logging out only ends your session; it doesn’t delete your collection.`,
  },

  // ---- Something not working? ----
  {
    id: 'closed', sectionId: 'help',
    question: 'Why can’t I get in?',
    answer: `While the Cheesy TCG is in a closed alpha or beta, only invited testers can open the website. If you see the closed page, log in with Twitch; if your name is not on the tester list yet, ask in the {channel} Discord. The Privacy Policy and the Terms stay open to everyone; this FAQ is for testers too. Playing on stream is not affected: packs are still opened live on the [{channel} channel]({channel_url}), and the Twitch panel keeps working.`,
  },
  {
    id: 'cant-login', sectionId: 'help', open: true,
    question: 'I can’t log in on the website',
    answer: `Try again. The sign-in link only lasts a few minutes and must finish in the same browser. If you pressed *Cancel* on Twitch’s page we can’t log you in. Make sure cookies are allowed for this site.`,
  },
  {
    id: 'captcha', sectionId: 'help',
    question: 'Why am I asked for a “quick check” when I trade or upgrade?',
    answer: `To stop bots from spamming trades and upgrades. It’s a short Cloudflare check that usually passes on its own; if it does ask you to tick a box, do that and your trade or upgrade carries on. After you pass you won’t be asked again for about 15 minutes. If it keeps failing, turn off any VPN or tracker-blocking extension for this site, or try another browser. The Twitch panel doesn’t use it.`,
  },
  {
    id: 'find-things', sectionId: 'help',
    question: 'How do I find things quickly?',
    answer: `Press \`/\` (or Ctrl/⌘ + K) anywhere to search for a collector, a card or a page. The leaderboard can be searched and ranked by points, cards collected, pulls or shinies, and shows who moved up or down since you last looked.`,
  },
  {
    id: 'feedback', sectionId: 'help',
    question: 'I have an idea, or something is broken. Where do I say?',
    answer: `For an idea, use [Feedback](/feedback) (also in the footer and the bell), log in with Twitch and send it, or [open a feature request on GitHub]({feature_request_url}). You can send {feedback_per_day} a day in the app. If we answer, you get a notice in the bell, and you can see your sent items and our replies on the same page. If something is broken, [report a problem on GitHub]({report_problem_url}) (also in the footer). You need a free GitHub account, there is no limit, and the report is public, so leave out anything private. We keep a suggestion until it is dealt with and for {feedback_keep_days} days after, then delete it.`,
  },
  {
    id: 'report', sectionId: 'help',
    question: 'How do I report someone?',
    answer: `Open their profile, press *Share* and choose *Report*. Pick a reason (an offensive name, bio or picture, cheating or abuse, a scam or unfair trade, or something else), add details and, if it helps, a link to the trade or edition. You must be logged in, you can send {reports_per_day} reports a day and one open report per person. Only staff see it, along with who sent it. The person you report is never told it was you, and you get a notice when staff have looked at it. Reports are kept like other feedback: until they are dealt with and for {feedback_keep_days} days after, then deleted.`,
  },
  {
    id: 'looks-wrong', sectionId: 'help',
    question: 'A card or my score looks wrong',
    answer: `Refresh first. Scores are recalculated whenever anyone pulls or upgrades, so they can move even when you haven’t done anything. If something still looks wrong, tell the streamer in chat.`,
  },
];

export function getFaqBuiltin(id: string): FaqBuiltin | undefined {
  return FAQ_BUILTINS.find(b => b.id === id);
}
