import Link from 'next/link';
import { FEEDBACK_LIMITS } from '@/lib/feedback-core';
import { CHANNEL_NAME, CHANNEL_URL, reportProblemUrl } from '@/lib/site';
import { Section, Q } from '../parts';

export function HelpSection() {
  return (
    <Section id="help" title="Something not working?" icon="wrench">
      <Q q="Why can&rsquo;t I get in?" id="closed">
        While the Cheesy TCG is in a closed alpha or beta, only invited testers can open the website. If you see the closed page, log in with Twitch; if your name is not on the tester list yet, ask in the {CHANNEL_NAME} Discord. The Privacy Policy and the Terms stay open to everyone; this FAQ is for testers too. Playing on stream is not affected: packs are still opened live on the{' '}
        <a href={CHANNEL_URL} className="text-yellow-400 hover:text-yellow-300" target="_blank" rel="noopener noreferrer">{CHANNEL_NAME} channel</a>, and the Twitch panel keeps working.
      </Q>
      <Q q="I can&rsquo;t log in on the website" open>
        Try again. The sign-in link only lasts a few minutes and must finish in the same browser. If you pressed <em>Cancel</em> on Twitch&rsquo;s page we can&rsquo;t log you in. Make sure cookies are allowed for this site.
      </Q>
      <Q q="Why am I asked for a &ldquo;quick check&rdquo; when I trade or upgrade?" id="captcha">
        To stop bots from spamming trades and upgrades. It&rsquo;s a short Cloudflare check that usually passes on its own; if it does ask you to tick a box, do that and your trade or upgrade carries on.
        After you pass you won&rsquo;t be asked again for about 15 minutes. If it keeps failing, turn off any VPN or tracker-blocking extension for this site, or try another browser. The Twitch panel doesn&rsquo;t use it.
      </Q>
      <Q q="How do I find things quickly?">
        Press <kbd className="kbd">/</kbd> (or Ctrl/⌘ + K) anywhere to search for a collector, a card or a page. The leaderboard can be searched and ranked by points, different cards, prints or shinies, and shows who moved up or down since you last looked.
      </Q>
      <Q q="I have an idea, or something is broken. Where do I say?" id="feedback">
        For an idea, use <Link href="/feedback" className="text-yellow-400 hover:text-yellow-300">Feedback</Link> (also in the footer and the bell), log in with Twitch and send it. You can send {FEEDBACK_LIMITS.perDay} a day. If we answer, you get a notice in the bell, and you can see your sent items and our replies on the same page. If something is broken, <a href={reportProblemUrl()} target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:text-yellow-300">report a problem on GitHub</a> (also in the footer). You need a free GitHub account, there is no limit, and the report is public, so leave out anything private. We keep a suggestion until it is dealt with and for {FEEDBACK_LIMITS.keepDaysAfterResolved} days after, then delete it.
      </Q>
      <Q q="How do I report someone?" id="report">
        Open their profile, press <em>Share</em> and choose <em>Report</em>. Pick a reason (an offensive name, bio or picture, cheating or abuse, a scam or unfair trade, or something else), add details and, if it helps, a link to the trade or print. You must be logged in, you can send {FEEDBACK_LIMITS.reportsPerDay} reports a day and one open report per person. Only staff see it, along with who sent it. The person you report is never told it was you, and you get a notice when staff have looked at it. Reports are kept like other feedback: until they are dealt with and for {FEEDBACK_LIMITS.keepDaysAfterResolved} days after, then deleted.
      </Q>
      <Q q="A card or my score looks wrong">
        Refresh first. Scores are recalculated whenever anyone pulls or upgrades, so they can move even when you haven&rsquo;t done anything. If something still looks wrong, tell the streamer in chat.
      </Q>
    </Section>
  );
}
