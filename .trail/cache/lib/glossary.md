# lib/glossary.ts

- TermId · type · L5-L7 — type TermId = | 'progressBonus' | 'fullSetBonus' | 'editionBonus' | 'edition' | 'printNumber' | 'points' | 'pullChance' | 'score' | 'rank' | 'fairness' | 'escrow' | 'reverseHolo' | 'fullArt' | 'shiny' | 'upgrade';
- GlossaryEntry · type · L9-L14 — type GlossaryEntry = { title: string; body: string; /** The FAQ anchor (without the #) that explains it in full; adds a "More in the FAQ" link. */ faq?: string; };
