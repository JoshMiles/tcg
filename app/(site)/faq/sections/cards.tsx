import Link from 'next/link';
import { RARITIES } from '@/lib/rarity';
import type { Variant } from '@/lib/types';
import { Section, Q } from '../parts';

export function CardsSection({ pct, upgradesOn }: { pct: (v: Variant) => string; upgradesOn: boolean }) {
  return (
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
            <p>In seasons with variants, every card can be pulled in rarer versions. The art is the same card with more or less flair:</p>
            <ul className="list-disc pl-5 space-y-1 marker:text-gray-600 mt-2">
              <li><strong className="text-white">Regular</strong>: the standard card.</li>
              <li><strong className="text-fuchsia-300">Reverse Holo</strong>: the regular art with a holographic shimmer.</li>
              <li><strong className="text-sky-300">Full Art</strong>: a bolder full-art version of the card.</li>
              <li><strong className="text-amber-300">Full Art Holo</strong>: the full art with the holographic shimmer, and it gently rocks on screen.</li>
              <li><strong className="text-yellow-300">Golden</strong>: a golden full-art version of the card, the rarest of all when enabled in a pack.</li>
            </ul>
          </>
        ) : (
          <p>
            Some seasons add Reverse Holo, Full Art, Full Art Holo and Golden versions of every card. The current season has a single version of each card, but if variants come back they&rsquo;ll be explained here.
          </p>
        )}
      </Q>
      {upgradesOn && (
        <Q q="How likely is each version?">
          First a card is picked, then its version is rolled. In the current season that works out to roughly{' '}
          <strong className="text-white">{pct('regular')}%</strong> Regular, <strong className="text-fuchsia-300">{pct('reverse')}%</strong> Reverse Holo,{' '}
          <strong className="text-sky-300">{pct('full')}%</strong> Full Art and <strong className="text-amber-300">{pct('shiny')}%</strong> Full Art Holo{Number(pct('golden')) > 0 ? <>, and <strong className="text-yellow-300">{pct('golden')}%</strong> Golden</> : null}. These numbers can change between seasons.
        </Q>
      )}
      <Q q="Can I see cards I haven&rsquo;t found yet?">
        Yes. The <Link href="/cards" className="text-yellow-400 hover:text-yellow-300">Card dex</Link> lists every card in the season. On your own collection page, cards you haven&rsquo;t pulled yet show as a <strong className="text-white">?</strong>.
      </Q>
      <Q q="What are editions, edition numbers and prints?" id="serials" open>
        <span id="prints" />Every card you own is an <strong className="text-white">edition</strong>, and every edition has two numbers. Its <strong className="text-white">edition number</strong> (like Edition #1023381) is different for every edition in the whole game and is how you refer to it: type it in the search box or open <code className="text-yellow-300">/p/1023381</code>. Its <strong className="text-white">print number</strong> is counted per card and per version of that card, and is the one that earns the print bonus. For example, your Full Art Holo Gouda Goat print #3 is the third Full Art Holo Gouda Goat drawn. Open a card in your collection to see your editions,
        and press one to see its page and its journey: who pulled it, who has held it and for how long, and where it has been traded or forged in an upgrade. Editions that existed before prints were numbered were numbered afterwards, so their order is an estimate (shown with a ~). On an edition&rsquo;s page and in your card details the card can be turned over: move the pointer over it to tilt it, then tap it or press <em>Flip</em> to see the engraved back with the edition number and the date.
        When you upgrade, the spent editions are retired and the new edition remembers what it was made from.
      </Q>
      <Q q="What is a trainer card?">
        <p>
          Trainer cards are special cards that grant a temporary buff when used, such as an extra card pack, bonus points or special perks. When you own a Regular edition of a trainer card, open its card details in your collection and tap <strong className="text-white">Use trainer card</strong> (then tap again to confirm). Using the card activates its buff and consumes one Regular edition of the card.
        </p>
      </Q>
    </Section>
  );
}
