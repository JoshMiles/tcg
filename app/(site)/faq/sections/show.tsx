import { SHOWOFF_COOLDOWN_S } from '@/lib/showoff-prepare';
import { CHANNEL_NAME } from '@/lib/site';
import { Section, Q } from '../parts';

export function ShowSection() {
  return (
    <Section id="show" title="Showing off your cards" icon="image">
      <Q q="How do I show off my cards?" open>
        <ul className="list-disc pl-5 space-y-1 marker:text-gray-600">
          <li><strong className="text-white">Share</strong> on a profile has the link and a quick picture of that collector's best cards, with their version and edition number, plus rank and progress. On your own profile, the <strong className="text-white">Share</strong> tab lets you choose a theme, a post or story shape, a stats poster, and exactly which cards go in.</li>
          <li><strong className="text-white">Share my stats</strong> on My Stats makes a picture of your rank and score, a few key figures (cards, prints, best edition, rarest print, trades) and your three most valuable prints.</li>
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
  );
}
