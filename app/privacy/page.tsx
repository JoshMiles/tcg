import type { Metadata } from 'next';
import { LegalPage, Section, List } from '@/app/components/LegalPage';
import { APP_NAME, CONTACT_EMAIL, OPERATOR } from '@/lib/legal';
import { CHANNEL_NAME } from '@/lib/site';

export const metadata: Metadata = { title: 'Privacy Policy', description: 'What The Cheesy TCG collects, how it is used and your choices.' };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <>
          <p>
            This policy explains what information {APP_NAME} (the &ldquo;Extension&rdquo; and its companion website) collects,
            why, who it is shared with, and the choices you have. It is operated by {OPERATOR} (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
          </p>
          <p>
            {APP_NAME} is a collectible card game played only on the {CHANNEL_NAME} Twitch channel: viewers get cards when packs are opened
            on stream, and can see their collection in a Twitch Extension and on this website. It is a hobby project made for the
            {CHANNEL_NAME} community; we do not sell your information and we do not run advertising.
          </p>
        </>
      }
    >
      <Section title="1. Information we collect">
        <p><strong className="text-white">From Twitch, when you use the Extension:</strong></p>
        <List>
          <li>
            <strong className="text-white">Your Twitch opaque user ID.</strong> Twitch gives every Extension an anonymous ID for each
            viewer. We store it so the Extension can recognise you when you come back.
          </li>
          <li>
            <strong className="text-white">Your Twitch user ID and username (login name) — only if you choose to share your identity.</strong>{' '}
            The Extension shows the Twitch &ldquo;share your identity&rdquo; prompt when you press <em>Login with Twitch</em>. If you allow it, we use your
            Twitch user ID to look up your username through the Twitch API, and we store both so your cards can be tied to you. If you
            decline, the Extension still works for browsing but cannot show your collection. (If you are the channel owner, Twitch signs
            your role into the token instead, and we use your channel ID.)
          </li>
          <li>
            <strong className="text-white">When you use &ldquo;Log in with Twitch&rdquo; on the website</strong>, Twitch asks for your permission to share your basic public profile with us:
            your Twitch user ID, login name, display name and profile picture. We request <em>no extra permissions</em> — we cannot see your email address, chat, follows or
            subscriptions, and we cannot act on your Twitch account. We use the Twitch access token only once, to read that profile, and then revoke it; we never store it.
          </li>
          <li>
            <strong className="text-white">Your public Twitch profile picture</strong>, fetched from Twitch&rsquo;s public API to
            show next to your collection and on the leaderboard. Profile pictures are cached for up to 7 days.
          </li>
        </List>
        <p><strong className="text-white">From playing:</strong></p>
        <List>
          <li>
            <strong className="text-white">Your collection</strong>: which cards you have pulled, granted, or upgraded, and in which season; and
            the resulting <strong className="text-white">leaderboard score</strong>, which is calculated from your collection.
          </li>
          <li>
            <strong className="text-white">An activity log</strong> of recent game events (pulls, grants, upgrades, trades, resets), each with your username and a
            timestamp. Only the most recent 500 events are kept.
          </li>
          <li>
            <strong className="text-white">Trade offers</strong> you make or receive (who, which cards, any note you write, and when), kept in a log of the latest 400 finished trades. Open offers on the Trade page, including the board, are visible to logged-in viewers.
          </li>
          <li>
            <strong className="text-white">A history for every card copy.</strong> Each copy of a card has a serial number and a record of when it was created and who
            held, traded or spent it (kept with the usernames involved). It is shown on the card&rsquo;s public page.
          </li>
          <li>
            <strong className="text-white">Your settings and profile choices</strong> if you set any: a short bio, your Looking for list, display and notification
            preferences, how you arranged your profile, and a few samples of your score and rank (taken when you open My Stats) for the history chart.
          </li>
          <li>
            <strong className="text-white">A profile record</strong> (username, display name, Twitch user ID, creation time, and an optional note the channel
            owner may add).
          </li>
          <li>
            When a viewer&rsquo;s name is sent to us by the streamer&rsquo;s own tools (for example a channel-point redemption that opens a pack), we
            receive that username so the pack can be opened for them.
          </li>
        </List>
        <p><strong className="text-white">Automatically:</strong></p>
        <List>
          <li>
            <strong className="text-white">Basic technical data</strong> (IP address, browser and device type, pages requested, timestamps) in our hosting provider&rsquo;s
            logs, and <strong className="text-white">privacy-friendly analytics and performance measurements</strong> (Vercel Web Analytics and Speed Insights)
            for the Extension and website. These do not use cookies and are not used to build a profile of you.
          </li>
          <li>
            <strong className="text-white">A login cookie</strong> (&ldquo;tcg_session&rdquo;) if you log in on the website. It is a signed token holding your Twitch login name, user ID and display name, so the site
            knows who you are when you view your stats or upgrade cards. It is strictly necessary for logging in, lasts up to 30 days, and is removed when you log out. A short-lived cookie
            (&ldquo;tcg_oauth&rdquo;, about 10 minutes) also protects the sign-in step itself.
          </li>
          <li>
            <strong className="text-white">Cookie notice.</strong> We only use the essential cookies above, so there is nothing to opt in to. Once you dismiss the cookie notice we remember that in your browser&rsquo;s
            local storage (&ldquo;tcg_cookie_notice&rdquo;); you can reopen it any time from &ldquo;Cookies&rdquo; in the footer. The same goes for dismissing the &ldquo;add to home screen&rdquo; hint
            (&ldquo;tcg_install_hint&rdquo;). If you add the site to your home screen, a small service worker keeps one offline page so you see a friendly message instead of a browser error when you have no signal; it stores no personal data.
          </li>
          <li>
            <strong className="text-white">One item of local storage</strong> in the Extension (&ldquo;tcg_panel_loggedout&rdquo;) that remembers you chose to log out, so it
            doesn&rsquo;t log you straight back in. It stays on your device.
          </li>
        </List>
        <p>
          We do <strong className="text-white">not</strong> collect your email address, real name, payment details, precise location, or your Twitch chat messages or follows. We do not
          ask for Twitch permissions beyond the optional identity share.
        </p>
      </Section>

      <Section title="2. How we use it">
        <List>
          <li>To show you your cards and let you upgrade them (in the Extension or, when you are logged in, on the website), and to record cards you earn on stream.</li>
          <li>To keep you logged in on the website and show your personal stats.</li>
          <li>To calculate and display leaderboards and card values for each season.</li>
          <li>To run the stream overlay and the website, keep them secure, prevent abuse, and fix problems.</li>
          <li>To understand, in aggregate, how the Extension and website perform.</li>
        </List>
        <p>We do not use your information for advertising, and we do not sell or rent it.</p>
      </Section>

      <Section title="3. What is public">
        <p>
          The game is social, so some information is visible to anyone who knows where to look:
        </p>
        <List>
          <li>
            <strong className="text-white">Collection pages and leaderboards are public.</strong> Anyone can open a collection page by typing a Twitch username, and
            the leaderboard lists usernames, profile pictures, scores and card counts for each season. They are not behind a login.
          </li>
          <li>
            <strong className="text-white">The home page shows recent pulls</strong> (username, card, and when), the top collectors, and season statistics that are built from everyone&rsquo;s collections.
          </li>
          <li>
            <strong className="text-white">Every card copy has a public history.</strong> Each copy of a card has a serial number and a page showing when it was created and who has held it, traded it or spent it in an upgrade.
            Collectors with a private profile are shown as &ldquo;a private collector&rdquo; there.
          </li>
          <li>
            <strong className="text-white">You can step back from the public boards.</strong> Signed in with Twitch, <em>Settings</em> lets you add a short public bio, make your profile private
            (you are left off the leaderboard, owner lists and recent pulls; your page still opens by link), switch off trade notices or direct offers, and download everything we hold about you.
            Those choices are stored with your username.
          </li>
          <li>
            Pack openings and collection displays are shown <strong className="text-white">live on the streamer&rsquo;s broadcast</strong> with your username, and may be
            saved in VODs and clips.
          </li>
        </List>
        <p>
          If you would rather not appear, don&rsquo;t log in to the Extension; you can ask us to remove your data at any time (see section 7).
        </p>
      </Section>

      <Section title="4. Who we share it with">
        <p>We use a few service providers to run the Extension. They process data on our behalf:</p>
        <List>
          <li><strong className="text-white">Twitch</strong> — the Extension runs inside Twitch, and we call the Twitch API to resolve usernames and profile pictures. Twitch&rsquo;s own privacy notice applies to what Twitch collects.</li>
          <li><strong className="text-white">Vercel</strong> — hosting, logs, analytics and performance measurement, plus the database (Vercel KV, Redis) and file storage (Vercel Blob) where the data above is kept. These services may store data in the United States and other countries.</li>
          <li>
            <strong className="text-white">Discord</strong> and <strong className="text-white">other streaming tools</strong> — <em>only if the streamer has connected them</em>. The streamer can
            have game events (for example &ldquo;{`<username>`} pulled a card&rdquo;) posted to their own Discord server, or sent to tools such as Mix It Up. Those messages
            contain your username and the card involved, and are then governed by those services&rsquo; policies and the streamer&rsquo;s settings.
          </li>
        </List>
        <p>
          We may disclose information if required by law or to protect the rights, safety, or security of our users or the service. If the project were ever
          transferred to someone else, this data would transfer with it, subject to this policy.
        </p>
      </Section>

      <Section title="5. How long we keep it">
        <List>
          <li>Collections, profiles and leaderboard data are kept until you ask us to delete them or the streamer removes them (for example when resetting a season).</li>
          <li>The activity log keeps only the latest 500 events. Cached profile pictures refresh weekly.</li>
          <li>Hosting logs and analytics are kept for the period set by our hosting provider.</li>
        </List>
      </Section>

      <Section title="6. Security">
        <p>
          Requests from the Extension are authenticated with Twitch-signed tokens, administration is behind a password, and data is stored with reputable
          providers over encrypted connections. No system is perfectly secure, so we can&rsquo;t guarantee absolute security. The data we hold is limited by design: it is
          mostly game data plus Twitch usernames and IDs.
        </p>
      </Section>

      <Section title="7. Your choices and rights">
        <List>
          <li><strong className="text-white">Don&rsquo;t share your identity.</strong> Decline Twitch&rsquo;s prompt, and we never learn your username or Twitch ID.</li>
          <li><strong className="text-white">Log out.</strong> The <em>logout</em> button in the Extension deletes the link between your Twitch opaque ID and your username. <em>Log out</em> on the website deletes your login cookie. Neither deletes your collection or profile.</li>
          <li><strong className="text-white">Disconnect from Twitch.</strong> You can remove this site&rsquo;s access from your Twitch account under Settings &rarr; Connections at any time; we hold no Twitch token, so there is nothing further to revoke on our side.</li>
          <li><strong className="text-white">Stop sharing your identity.</strong> You can stop sharing your Twitch identity with an Extension from Twitch itself (see Twitch&rsquo;s help pages on Extension permissions).</li>
          <li>
            <strong className="text-white">Access, correct or delete your data.</strong> Contact us (below) and we will provide a copy of the data we hold about you, correct it, or delete your collection,
            profile and activity entries. Depending on where you live (for example the EU/UK under GDPR, or California under the CCPA/CPRA) you may have additional rights, including to object to or
            restrict processing and to complain to your local data-protection authority. We will respond within the time required by applicable law.
          </li>
        </List>
        <p>
          Where the law requires a legal basis for processing, ours is to provide the game you asked to take part in (performance of a contract) and our legitimate interest in
          running and securing it. Your decision to share your Twitch identity is voluntary and you can withdraw it at any time.
        </p>
      </Section>

      <Section title="8. Children">
        <p>
          {APP_NAME} is intended for Twitch users, and Twitch requires users to be at least 13 (or the age of digital consent where they live, if higher). We do not knowingly
          collect information from anyone younger. If you believe a child has used the Extension, contact us and we will delete their data.
        </p>
      </Section>

      <Section title="9. Changes to this policy">
        <p>
          We may update this policy as the game changes. The &ldquo;Last updated&rdquo; date above shows the latest version, and we will make any significant change visible in the Extension or on the channel.
        </p>
      </Section>

      <Section title="10. Contact">
        <p>
          Questions or requests about your data: {CONTACT_EMAIL ? (
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-yellow-400 hover:text-yellow-300 underline">{CONTACT_EMAIL}</a>
          ) : (
            <>contact {OPERATOR} through the stream&rsquo;s Twitch channel (for example via a whisper or the channel&rsquo;s contact details), and mention that it is a privacy request</>
          )}.
        </p>
      </Section>
    </LegalPage>
  );
}
