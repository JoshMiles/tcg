import type { Metadata } from 'next';
import { LegalPage, Section, List } from '@/app/components/LegalPage';
import { APP_NAME, CONTACT_EMAIL, GOVERNING_LAW, OPERATOR } from '@/lib/legal';
import { CHANNEL_NAME } from '@/lib/site';

export const metadata: Metadata = { title: 'Terms of Use (EULA)', description: 'The rules for using The Cheesy TCG and its Twitch extension.' };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use (EULA)"
      intro={
        <>
          <p>
            This End User License Agreement (&ldquo;Terms&rdquo;) is between you and {OPERATOR} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) and covers your use of {APP_NAME}: the Twitch
            Extension (panel, mobile and video views), the stream overlay, and the companion website (together, the &ldquo;Service&rdquo;).
          </p>
          <p>
            By logging in to the Extension, or otherwise using the Service, you agree to these Terms and to our Privacy Policy. If you don&rsquo;t agree, please don&rsquo;t use the Service.
          </p>
        </>
      }
    >
      <Section title="1. What the Service is">
        <p>
          {APP_NAME} is a digital collectible card game that runs only on the {CHANNEL_NAME} Twitch channel (and on this website, which shows and manages your collection). Cards are earned live on stream (for example when a pack is opened for you), can be viewed in a
          collection, and, in seasons that enable it, can be upgraded into rarer variants. A leaderboard ranks collections for each season.
        </p>
        <p>
          It is a fan-made hobby project. It is not made, sponsored, or endorsed by Twitch Interactive, Inc. (&ldquo;Twitch&rdquo;), and Twitch has no responsibility for it. Your use of the
          Extension is also subject to Twitch&rsquo;s Terms of Service, Developer Services Agreement and Privacy Notice.
        </p>
      </Section>

      <Section title="2. Your licence">
        <p>
          We grant you a personal, non-exclusive, non-transferable, revocable licence to use the Service for your own non-commercial entertainment, on Twitch and through
          the website, subject to these Terms. All rights not expressly granted are reserved.
        </p>
        <p>You may not, and may not let others:</p>
        <List>
          <li>copy, modify, reverse engineer, or create derivative works of the Service or its code, except where the law gives you that right regardless;</li>
          <li>use bots, scripts, or other automation to interact with the Service, or to scrape it at a rate that burdens it;</li>
          <li>exploit bugs, tamper with requests, or otherwise try to gain cards, upgrades, or leaderboard score in a way the game doesn&rsquo;t intend;</li>
          <li>interfere with the Service&rsquo;s operation or security, or try to access other people&rsquo;s accounts or data or the administration tools;</li>
          <li>use the Service unlawfully, to harass others, or in breach of Twitch&rsquo;s rules.</li>
        </List>
      </Section>

      <Section title="3. Digital items have no real-world value">
        <List>
          <li>
            Cards, variants (such as Reverse Holo, Full Art, Full Art Holo and Golden), and leaderboard scores are <strong className="text-white">virtual items for fun</strong>. They have no cash or
            other monetary value, are not property or a financial asset, and can&rsquo;t be sold, bought, or exchanged for money, goods, or services, inside or outside the Service.
          </li>
          <li>
            The cards are <strong className="text-white">not NFTs</strong>, tokens, cryptocurrency or digital securities, and nothing about them is recorded on a blockchain. They are simply entries in
            this game&rsquo;s own database, like points in an arcade game. Any offer to buy, sell or &ldquo;mint&rdquo; them as NFTs or for real money is not from us.
          </li>
          <li>
            You receive a licence to display and use the items you earn within the Service. You don&rsquo;t own them, and they are not transferable except by features we provide
            (such as trading with other viewers on the website or in the Twitch Extension, where offered cards are held in escrow until the offer ends; an offer can be declined, cancelled or expire, and trading can be paused or changed at any time).
          </li>
          <li>
            Every edition of a card has an <strong className="text-white">edition number</strong>, a <strong className="text-white">print number</strong> and a history that is shown publicly. These numbers are a bit of fun: a low or special number gives no extra
            right, value or entitlement. Editions that existed before print numbers were introduced were numbered afterwards, so their order is an estimate, and we may correct or renumber editions if something goes wrong.
          </li>
          <li>
            We may add, change, rebalance, rename or remove cards, packs, variants, odds, upgrade costs, point values, and seasons at any time, and may reset or retire collections and leaderboards
            (for example at the end of a season), with or without notice.
          </li>
          <li>
            <strong className="text-white">Upgrades are final.</strong> Upgrading spends editions of a card to create one of the next variant. It can&rsquo;t be undone, and we can&rsquo;t restore spent editions except at our discretion.
          </li>
          <li>
            Pack contents are random. Odds are set by us, may differ between packs and seasons, and may change. There is no guarantee you will receive any particular card or variant.
          </li>
          <li>
            Packs are earned through activity on the stream or granted by the streamer. Any payments you make to a Twitch channel (for example subscriptions or Bits) are processed by
            Twitch under Twitch&rsquo;s terms, support the channel, and are not a purchase of cards or any particular outcome. They are not refundable by us.
          </li>
        </List>
      </Section>

      <Section title="4. Your Twitch identity and your data">
        <p>
          You choose whether to share your Twitch identity with the Extension. We handle that information as described in the Privacy Policy. You are responsible for activity done through your
          Twitch account. Collections and leaderboards are public, and your username appears on the stream when your cards are shown.
        </p>
        <p>
          If you give an email address to get notifications, we only use it to send the notices you chose and the confirmation link, and every email lets you stop them. You can remove the address at any time. Only add an address that is yours.
        </p>
      </Section>

      <Section title="5. Suspension and termination">
        <p>
          We may remove cards, adjust scores, restrict, suspend, or end your access at any time, especially if we think you have broken these Terms or the rules of the stream or Twitch. You can stop using
          the Service whenever you like, and can ask us to delete your account and data with the <em>Request deletion</em> button in Settings (see the Privacy Policy; deleting is permanent and the editions you held are retired). We may also change or discontinue the Service at any time. Sections that by their nature should
          continue (including 3, 6, 7 and 8) will survive termination.
        </p>
      </Section>

      <Section title="6. Disclaimers">
        <p className="uppercase text-xs tracking-wide leading-relaxed">
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, non-infringement, availability, or accuracy. We don&rsquo;t promise
          the Service will be uninterrupted, error-free, or that your collection, upgrades, or scores will never be lost, delayed, or miscalculated. It may be unavailable when the stream is offline.
        </p>
      </Section>

      <Section title="7. Limitation of liability">
        <p className="uppercase text-xs tracking-wide leading-relaxed">
          To the fullest extent permitted by law, we will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of virtual items, data, profits, or goodwill,
          arising out of or related to the Service. Our total liability for any claim relating to the Service is limited to the greater of the amount you paid us directly for the Service (which is expected to be zero) and
          fifty US dollars (US$50).
        </p>
        <p>
          Nothing in these Terms excludes or limits liability that cannot be excluded or limited by law, or any statutory rights you have as a consumer.
        </p>
      </Section>

      <Section title="8. General">
        <List>
          <li><strong className="text-white">Third-party rights.</strong> Twitch is a third-party beneficiary of these Terms only to the extent Twitch&rsquo;s Developer Agreement requires, and is not a party to them.</li>
          <li><strong className="text-white">Intellectual property.</strong> The Service, its code, card artwork, sounds, and branding belong to us or our licensors. Twitch and related marks belong to Twitch Interactive, Inc.</li>
          <li><strong className="text-white">Changes.</strong> We may update these Terms. The &ldquo;Last updated&rdquo; date shows the current version; continuing to use the Service after a change means you accept it.</li>
          <li><strong className="text-white">Entire agreement.</strong> These Terms and the Privacy Policy are our whole agreement with you about the Service. If part of them is unenforceable, the rest stays in effect, and our not enforcing a term is not a waiver.</li>
          <li>
            <strong className="text-white">Governing law.</strong>{' '}
            {GOVERNING_LAW
              ? <>These Terms are governed by {GOVERNING_LAW}, and the courts there have jurisdiction, except where the law of your country gives you the right to bring a claim where you live.</>
              : <>These Terms are governed by the laws of the place where the operator is based, except where the law of your country gives you the right to bring a claim where you live.</>}
          </li>
        </List>
      </Section>

      <Section title="9. Contact">
        <p>
          Questions about these Terms: {CONTACT_EMAIL ? (
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-yellow-400 hover:text-yellow-300 underline">{CONTACT_EMAIL}</a>
          ) : (
            <>contact {OPERATOR} through the stream&rsquo;s Twitch channel</>
          )}.
        </p>
      </Section>
    </LegalPage>
  );
}
