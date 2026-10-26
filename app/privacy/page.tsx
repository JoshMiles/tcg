import type { Metadata } from 'next';
import { LegalPage, Section, List } from '@/app/components/LegalPage';
import { APP_NAME, CONTACT_EMAIL, OPERATOR } from '@/lib/legal';
import { CHANNEL_NAME } from '@/lib/site';

import { FEEDBACK_LIMITS } from '@/lib/feedback-core';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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
            <strong className="text-white">Your Twitch user ID and username (login name). Only if you choose to share your identity.</strong>{' '}
            The Extension shows the Twitch &ldquo;share your identity&rdquo; prompt when you press <em>Login with Twitch</em>. If you allow it, we use your
            Twitch user ID to look up your username through the Twitch API, and we store both so your cards can be tied to you. If you
            decline, the Extension still works for browsing but cannot show your collection. (If you are the channel owner, Twitch signs
            your role into the token instead, and we use your channel ID.)
          </li>
          <li>
            <strong className="text-white">When you use &ldquo;Log in with Twitch&rdquo; on the website</strong>, Twitch asks for your permission to share your basic public profile with us:
            your Twitch user ID, login name, display name and profile picture. We request <em>no extra permissions</em>: we cannot see your email address, chat, follows or
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
            <strong className="text-white">A history for every edition.</strong> Each edition of a card has a edition number, an serial number and a record of when it was created and who
            held, traded or spent it (kept with the usernames involved). It is shown on the card&rsquo;s public page.
          </li>
          <li>
            <strong className="text-white">Alert devices</strong> if you turn on alerts (push notifications): for each device up to five, the push address your browser gives us (a web address that lets
            us send that browser an alert, together with its encryption keys), a short device label such as &ldquo;Chrome on Android&rdquo;, and when it was added and last used. We delete it when you turn alerts off,
            remove the device in Settings, or the browser tells us the address no longer exists. It is included in your data download. If you report another collector from their profile, we keep your username, the person you reported, the reason, your details and any trade or edition link you added, so staff can look into it. Only staff see it: the person you reported is never told who reported them, and reports about you are not part of your data download.
          </li>
          <li>
            <strong className="text-white">Your Discord account</strong> only if you choose to link Discord for notifications: your Discord user ID and username, when you linked it, and your notification preferences. We request only the identify permission to verify your account, and revoke the access token immediately. We never store your token or have access to your server messages or servers. It is included in your data download, and you can unlink it in Settings at any time.
          </li>
          <li>
            <strong className="text-white">Your settings and profile choices</strong> if you set any: a short bio, the pronouns you chose to show (if any), your Looking for list, display and notification
            preferences, how you arranged your profile and binder, a card you pinned, the achievements you have earned, your newest bell notices (offers and how they ended), and a few samples of your score and rank (taken when you open My Stats) for the history chart.
          </li>
          <li>
            <strong className="text-white">The tester list</strong> while the website is in a closed alpha or beta: if you were invited as a tester, your Twitch login, whether you are an alpha or beta tester, who added you and when, and an optional short note. It is only used to decide who may open the website, and to give you the tester achievement. It is included in your data download.
          </li>
          <li>
            <strong className="text-white">Feedback you send</strong> through the Feedback page (a suggestion or problem report): your username, what you wrote, when you sent it, its status and any reply from staff. A problem report can also include your browser details, screen size and the site version, only if you leave that box ticked. It is included in your data download.
          </li>
          <li>
            <strong className="text-white">A profile record</strong> (username, display name, Twitch user ID, creation time, and an optional note, labels or restrictions, such as being left off the public boards or not trading, that the channel owner or a moderator may add).
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
            <strong className="text-white">An access cookie</strong> (&ldquo;tcg_access&rdquo;) while the website is closed to testers: a signed token that says you are a tester or staff, lasts an hour and is only used to let you in.{' '}
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
          <li>
            <strong className="text-white">A few preferences and bits of state in your browser&rsquo;s local storage</strong> on the website (for example the collection layout you chose, the
            leaderboard ranks used to show who moved, and which trade animations you have already seen). They hold no personal details and stay on your device.
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
            <strong className="text-white">The home page shows recent pulls and gifted cards</strong> (username, card, and when), the top collectors, and season statistics that are built from everyone&rsquo;s collections.
          </li>
          <li>
            <strong className="text-white">Every edition has a public history.</strong> Each edition of a card has a edition number, an serial number and a page showing when it was created and who has held it, traded it or spent it in an upgrade.
            Collectors with a private profile are shown as &ldquo;a private collector&rdquo; there.
          </li>
          <li>
            <strong className="text-white">You can step back from the public boards.</strong> Signed in with Twitch, <em>Settings</em> lets you add a short public bio, make your profile private
            (you are left off the leaderboard, owner lists and recent pulls, and your profile page shows only that it is private to anyone but you), switch off trade notices or direct offers, and download everything we hold about you.
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
          <li><strong className="text-white">Twitch</strong>: the Extension runs inside Twitch, and we call the Twitch API to resolve usernames and profile pictures. Twitch&rsquo;s own privacy notice applies to what Twitch collects.</li>
          <li><strong className="text-white">Your browser&rsquo;s push service</strong> (for example Google, Apple or Mozilla), only if you turn on alerts: it carries the alert from our server to your device. The alert contains the short notice text (such as &ldquo;@name offered you a trade&rdquo;). That service&rsquo;s own privacy notice applies.</li>
          <li><strong className="text-white">pr.alejo.io</strong> (the Twitch pronouns service), only if you choose <em>Use the ones I set on pr.alejo.io</em> for your pronouns: when your profile is opened we send your Twitch login name to ask which pronouns you set there, and keep the answer (or that you have none) for a day. Nothing is sent for anyone who has not chosen that option. Their own privacy notice applies.</li>
          <li><strong className="text-white">Vercel</strong>: hosting, logs, analytics and performance measurement, plus the database (Vercel KV, Redis) and file storage (Vercel Blob) where the data above is kept. These services may store data in the United States and other countries.</li>
          <li>
            <strong className="text-white">Cloudflare Turnstile</strong>: when you trade or upgrade cards on the website we may ask you to pass a short bot check. Cloudflare loads a script in your browser and
            receives your IP address and some browser and device signals to decide whether you are a person; we receive only the pass or fail result and remember your pass for about 15 minutes. It is not used for advertising.
            Cloudflare&rsquo;s own privacy notice applies. It is not used in the Twitch panel.
          </li>
          <li>
            <strong className="text-white">Discord</strong> and <strong className="text-white">other streaming tools</strong>: <em>only if the streamer has connected them</em>. The streamer can
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
          <li>The activity log keeps only the latest 500 events. Cached profile pictures refresh weekly. Bell notices keep only your newest 30, and score samples your newest 120 per season.</li>
          <li>The tester list entry is kept until a tester is removed or deletes their account (the tester achievement on a profile stays unless the account is deleted).</li>
          <li>Feedback and user reports are kept until they have been dealt with and for {FEEDBACK_LIMITS.keepDaysAfterResolved} days after that, then deleted. You can send {FEEDBACK_LIMITS.perDay} a day, and up to {FEEDBACK_LIMITS.reportsPerDay} reports a day.</li>
          <li>Before a moderator or the channel owner resets, merges or deletes a viewer&rsquo;s cards, a restore point of that viewer&rsquo;s collection is kept for 14 days so a mistake can be undone.</li>
          <li>An encrypted backup of the game data is made every night so it can be recovered after a mistake or an outage. Backups are kept for up to 14 days, so deleted data can remain in them for that long.</li>
          <li>Hosting logs and analytics are kept for the period set by our hosting provider.</li>
        </List>
      </Section>

      <Section title="6. Security">
        <p>
          Requests from the Extension are authenticated with Twitch-signed tokens, administration is limited to staff who sign in with their Twitch account (with an emergency password as a fallback), and data is stored with reputable
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
            <strong className="text-white">Access, correct or delete your data.</strong> To delete your account, press <em>Request deletion</em> at the bottom of Settings (it asks for your login name to confirm); the request reaches us in the feedback inbox and we delete your collection, profile, settings, notices, alert devices and feedback, cancel your open trade offers and retire the editions you held (they show as a removed collector in an edition&rsquo;s history), normally within a month. We keep the request itself as a record, for the same period as other feedback. You can cancel it until it is handled. For the other requests, or if you cannot use Settings, contact us (below) and we will provide a copy of the data we hold about you, correct it, or delete your collection,
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
