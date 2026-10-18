import Link from 'next/link';
import { CONTACT_EMAIL, OPERATOR } from '@/lib/legal';
import { Section, Q } from '../parts';

export function PrivacySection() {
  return (
    <Section id="privacy" title="Privacy & data" icon="lock">
      <Q q="What can other people see?" open>
        Collections, the leaderboard, season stats, recent pulls and each print&rsquo;s history are public, and your username appears on stream when your cards are shown. A private profile hides you from the boards and feeds. The full details are in the{' '}
        <Link href="/privacy" className="text-yellow-400 hover:text-yellow-300">Privacy Policy</Link>; the rules of the game are in the <Link href="/terms" className="text-yellow-400 hover:text-yellow-300">Terms</Link>.
      </Q>
      <Q q="What do you store about me?">
        Your Twitch username and ID, your cards and score, and a short log of recent game events. Logging in on the website uses a login cookie; the Twitch access token isn&rsquo;t kept.
      </Q>
      <Q q="Can I download my data?">
        Yes: <Link href="/settings" className="text-yellow-400 hover:text-yellow-300">Settings</Link> has a <em>Download my data</em> button that gives you your profile, settings, collections, trade offers, notices, alert devices and email address as a file.
      </Q>
      <Q q="How do I get my data deleted?">
        Go to <Link href="/settings#delete-account" className="text-yellow-400 hover:text-yellow-300">Settings</Link> and press <em>Request deletion</em> at the bottom (you type your login name to confirm). The team deletes your account, usually within about a month: your collection, settings, notices, alert devices and email address are removed, the prints you held are retired, and your open trade offers are cancelled. It cannot be undone. A restore point is kept for 14 days only so a mistake can be fixed. Until it is handled you can cancel the request there.
        You can also ask the person who runs the game:{' '}
        {CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`} className="text-yellow-400 hover:text-yellow-300 underline">{CONTACT_EMAIL}</a> : <>contact {OPERATOR} through the stream&rsquo;s Twitch channel</>}
        . Logging out only ends your session; it doesn&rsquo;t delete your collection.
      </Q>
    </Section>
  );
}
