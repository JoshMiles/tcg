// One place for the short explanations behind the little "i" buttons (<InfoTip term="..." />). Plain strings only, so the
// FAQ and the tooltips cannot drift apart: each term can point at its FAQ anchor, and scripts/check-words.mts checks the
// anchors exist and the wording follows the house rules. No numbers that the streamer can change in Scoring settings.

export type TermId =
  | 'progressBonus' | 'fullSetBonus' | 'editionBonus' | 'edition' | 'printNumber' | 'points' | 'pullChance' | 'score' | 'rank'
  | 'fairness' | 'escrow' | 'reverseHolo' | 'fullArt' | 'shiny' | 'upgrade';

export type GlossaryEntry = {
  title: string;
  body: string;
  /** The FAQ anchor (without the #) that explains it in full; adds a "More in the FAQ" link. */
  faq?: string;
};

export const GLOSSARY: Record<TermId, GlossaryEntry> = {
  progressBonus: {
    title: 'Progress bonus',
    body: 'Extra points that grow with the share of the set you own. Every different card you find adds its own points and also raises this bonus. Duplicates do not count towards it.',
    faq: 'bonuses',
  },
  fullSetBonus: {
    title: 'Full set bonus',
    body: 'A one-off extra for owning at least one print of every card in the season. You also get a Complete badge on the leaderboard.',
    faq: 'bonuses',
  },
  editionBonus: {
    title: 'Edition bonus',
    body: 'The first prints ever made of a card are worth extra. Edition #1 is worth the most, and the bonus fades away as the edition number goes up. It belongs to the print, so it moves with it if you trade it.',
    faq: 'points',
  },
  edition: {
    title: 'Edition',
    body: 'The count of a print among all prints of the same card and version. Your Shiny Gouda Goat edition #3 is the third Shiny Gouda Goat ever drawn. Low editions earn the edition bonus.',
    faq: 'serials',
  },
  printNumber: {
    title: 'Print number',
    body: 'A number that belongs to one print only, across the whole game. Use it to refer to a print: type it in the search box or open its page. It is not the same as the edition number.',
    faq: 'serials',
  },
  points: {
    title: 'Points',
    body: 'What a print is worth. Rarer cards, shinier versions and low edition numbers are worth more. Card values shift a little as cards are pulled, so the numbers are a guide.',
    faq: 'points',
  },
  pullChance: {
    title: 'Pull chance',
    body: 'How often this card turns up. "1 in 12" means about one pull in twelve gives you this card. The rarer a card, the more it is worth.',
    faq: 'cards',
  },
  score: {
    title: 'Score',
    body: 'The total of what every print you own is worth, plus the collection bonuses. It is what the leaderboard ranks by.',
    faq: 'points',
  },
  rank: {
    title: 'Rank',
    body: 'Your place on the leaderboard. It follows whichever measure the board is showing, and it does not change when you search for someone.',
    faq: 'points',
  },
  fairness: {
    title: 'Fairness label',
    body: 'A rough guide comparing the points on each side of the offer. It only looks at points, so a low edition number or a card you simply want can matter more to you. You are never stopped from making a lopsided offer, only asked to confirm it.',
    faq: 'fair-trade',
  },
  escrow: {
    title: 'Held for this offer',
    body: 'Cards in an offer leave your collection while it is open, so nobody can accept something you no longer have. They come back if the offer is declined, cancelled, countered or runs out, and go to the other person if it is accepted. Held cards do not count towards your points.',
    faq: 'escrow',
  },
  reverseHolo: {
    title: 'Reverse Holo',
    body: 'The regular art with a holographic shimmer. Worth more than a Regular.',
    faq: 'cards',
  },
  fullArt: {
    title: 'Full Art',
    body: 'A bolder, full-art version of the card. Worth more than a Reverse Holo.',
    faq: 'cards',
  },
  shiny: {
    title: 'Shiny Full Art',
    body: 'The full art with the holographic shimmer, and it gently rocks on screen. The rarest version, and worth the most.',
    faq: 'cards',
  },
  upgrade: {
    title: 'Upgrade',
    body: 'Spend several prints of a card to make one print of the next version up. The spent prints are retired and the new print remembers what it was made from.',
    faq: 'upgrades',
  },
};
