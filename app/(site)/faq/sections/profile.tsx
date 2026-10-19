import Link from 'next/link';
import { Section, Q } from '../parts';

export function ProfileSection() {
  return (
    <Section id="profile" title="Your profile" icon="user">
      <Q q="What is on a profile?" open>
        Every collector has a public profile with an <em>Overview</em>, their <em>Collection</em>, <em>Stats</em>, <em>Trades</em> and <em>Activity</em>. The Collection tab lets you search, filter by rarity or pack, sort, and (when you are
        logged in and looking at someone else) compare what you each have.
      </Q>
      <Q q="Can I change how my profile looks?">
        Yes. On your own profile press <strong className="text-white">Customize profile</strong>: drag widgets to rearrange them, drag a widget&rsquo;s edge (or use the arrows) to resize it, remove the ones you do not want
        and add others from the list, then Save. You can show your best cards, rarity progress, latest numbered editions, awards, a Looking for list and more. In <Link href="/settings" className="text-yellow-400 hover:text-yellow-300">Settings</Link> you can also add a short bio.
      </Q>
      <Q q="Can I show my pronouns?">
        Yes, in <Link href="/settings" className="text-yellow-400 hover:text-yellow-300">Settings</Link> or with <strong className="text-white">Edit profile</strong> on your own profile. They are off until you choose: pick one from a short list, or use the ones you set on pr.alejo.io for Twitch chat (we then look up your login there and remember the answer for a day). They show after your name on your profile.
      </Q>
      <Q q="What are achievements?" id="achievements">
        Goals for collecting. They show on your profile and are earned per season, for example <strong className="text-white">Completed Season 1</strong> (one of every card), <strong className="text-white">All Common</strong>,
        <strong className="text-white"> All Rare</strong> and so on for each rarity, <strong className="text-white">All Reverse Holo</strong>, <strong className="text-white">All Full Art</strong>, <strong className="text-white">All Shiny</strong> and the
        <strong className="text-white"> Master set</strong> (every card in every version). There are goals about print numbers too: <strong className="text-white">First print</strong> (hold print #1 of any card), <strong className="text-white">First shiny print</strong>, <strong className="text-white">Five firsts</strong> (print #1 of five different cards) and <strong className="text-white">Early bird</strong> (an edition with a low enough print number to earn the print bonus). Your profile also shows how close you are to the next ones. Once you earn an achievement it is yours to keep, even if you later trade cards away.
        They are different from <em>awards</em>, which are the prizes given for finishing high on a season&rsquo;s leaderboard.
      </Q>
      <Q q="Can I share my cards as an image?">
        Yes: the <em>Share</em> menu on a profile (and the <em>Share</em> tab on your own), <em>Share my stats</em> on My Stats and <em>Share this card</em> on a card or edition page make a picture you can post or download.
      </Q>
      <Q q="Can I hide my profile?">
        In Settings, <em>Private profile</em> leaves you off the leaderboard, card owner lists and recent pulls and hides your profile page: anyone else who opens it sees only that it is private (you still see your own). Your cards still appear on stream when
        they are shown there.
      </Q>
      <Q q="What are the experimental features?">
        Early features you can switch on in Settings, such as keyboard shortcuts (press <kbd className="kbd">g</kbd> then a letter to jump between pages, or <kbd className="kbd">?</kbd> for the list) and a profile accent colour. They may change or go away.
      </Q>
    </Section>
  );
}
