// "What's new" for players, newest first. Hand-written: a player-facing change adds or extends an entry here in the same PR
// (CLAUDE.md Conventions). Write for players, not developers: say what they can now do, say "print" for a card copy, no em dashes.

export type ChangeTag = 'new' | 'improved' | 'fixed';

export interface ChangelogEntry {
  /** YYYY-MM-DD. */
  date: string;
  title: string;
  items: string[];
  tags?: ChangeTag[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-10-17',
    title: 'Card backs with their own look',
    tags: ['new'],
    items: [
      'Each pack can now have its own design for the back of a print: its own colours, pattern, logo and a custom line of text, with the print number and the rest in the size and place the pack wants.',
      'You see it when you flip a print on its page, in your collection and binder, on the home page and in the share picture of a print. Packs without a new design look the same as before.',
    ],
  },
  {
    date: '2026-10-17',
    title: 'Report a collector',
    tags: ['new'],
    items: [
      'You can now report another collector from their profile: press Share, then Report. Choose a reason, add details and an optional link to a trade or print.',
      'Only staff see reports, and the person you report is never told it was you. You get a notice when staff have looked at it.',
    ],
  },
  {
    date: '2026-10-16',
    title: 'Staff badges',
    tags: ['new'],
    items: [
      'The streamer, admins and mods now have a purple Streamer, Admin or Mod badge next to their name on their profile, on the leaderboard and on trades, so you know who you are dealing with.',
      'Staff who also play as a normal collector can hide their badge in Settings.',
    ],
  },
  {
    date: '2026-10-16',
    title: 'Alpha and beta notice',
    tags: ['new'],
    items: [
      'While the Cheesy TCG is in alpha or beta, a thin notice sits at the top of every page and the logo shows an ALPHA or BETA tag. The notice has a Report a problem link and can be closed for the rest of your visit.',
    ],
  },
  {
    date: '2026-10-16',
    title: 'Closed alpha and beta testing',
    tags: ['new'],
    items: [
      'While the Cheesy TCG is being tested, the website can be limited to invited testers. If you are not on the list yet you will see a "closed" page; log in with Twitch and ask in the Discord to be added. Privacy and Terms stay open, and the Twitch panel keeps working.',
      'Testers earn a permanent Alpha tester or Beta tester achievement, shown first on their profile.',
    ],
  },
  {
    date: '2026-10-16',
    title: 'Open your most valuable prints',
    tags: ['improved'],
    items: ['Each row in Most valuable prints, on My Stats and on profiles, now opens that print. A row that groups several prints of a card opens the card in the card dex.'],
  },
  {
    date: '2026-10-16',
    title: 'A wider "live now" banner on the home page',
    tags: ['improved'],
    items: ['When Cheesygidds is streaming, the live banner now spans the top of the home page with the stream title, viewer count and a Watch on Twitch button.'],
  },
  {
    date: '2026-10-16',
    title: 'The app icon only shows where it helps',
    tags: ['improved'],
    items: ['The install icon in the top bar now only appears on phones and tablets. On a computer you can still find the install guide in the footer and the site menu.'],
  },
  {
    date: '2026-10-16',
    title: 'The cheese is back in your browser tab',
    tags: ['fixed'],
    items: ['The site icon shows in the browser tab and in bookmarks again.'],
  },
  {
    date: '2026-10-16',
    title: 'Little "i" buttons explain the terms',
    tags: ['new'],
    items: [
      'Tap or hover the new "i" next to a term such as Progress bonus, Edition, Print number, Pull chance or the trade fairness label to see a short explanation.',
      'You will find them on your stats, profiles, the leaderboard, the card dex, print pages and the trade screen. Each one links to the full answer in the FAQ.',
    ],
  },
  {
    date: '2026-10-16',
    title: 'Send feedback, and delete your account yourself',
    tags: ['new'],
    items: [
      'The new Feedback page lets you suggest something or report a problem. If we answer, you get a notice in the bell.',
      'Find it in the footer, the bell menu and the FAQ, and on the error page as Report this.',
      'At the bottom of Settings, Request deletion asks the team to delete your account and data. You can cancel the request until it is handled.',
    ],
  },
  {
    date: '2026-10-16',
    title: 'Print of the week, wanted counts and a weekly digest',
    tags: ['new'],
    items: [
      'The home page now features a Print of the week: one standout print, picked each week.',
      'Trade listings show how many collectors want that card, so you can spot the popular ones.',
      'When you make an offer you can choose exactly which print of a card to trade.',
      'The Discord server gets a weekly digest of the best of the week.',
    ],
  },
  {
    date: '2026-10-16',
    title: 'Alerts you will not miss',
    tags: ['new', 'improved'],
    items: [
      'Notices arrive within seconds and the bell is hard to miss.',
      'There is a full Notifications page with everything you have been sent.',
      'Turn on phone and desktop alerts in Settings to hear about trades even when the site is closed.',
    ],
  },
  {
    date: '2026-10-16',
    title: 'Every card copy is a print',
    tags: ['improved'],
    items: [
      'A single card you own is now called a print, with its own print number.',
      'Recent pulls and the activity feeds open the exact print that was pulled.',
      'Your profile’s Recent pulls lists your latest pulls with the edition and print number.',
      'The card dialog shows the prints first, then the details of one print.',
      'Every offer now has its own trade page you can share.',
    ],
  },
  {
    date: '2026-10-16',
    title: 'Stream and Discord extras',
    tags: ['new'],
    items: [
      'A recap of the stream is posted to Discord when it ends.',
      'New trade listings are posted to a Discord channel with a link to the trade.',
      'The overlay can show the print number on a reveal.',
    ],
  },
  {
    date: '2026-10-15',
    title: 'A polish pass across the site',
    tags: ['improved', 'fixed'],
    items: [
      'Accepting, taking, declining and cancelling a trade now needs a second tap, so a stray tap cannot do it.',
      'Upgrading a print on My stats also asks for a second tap.',
      'Private profiles hide their page, and unknown cards and prints show a proper not-found page.',
      'Fixes for phone layouts, keyboard use and screen readers on most pages.',
      'The home screen icon on iPhone is fixed, and your rarest cards animate when you hover over them.',
    ],
  },
];

/** The date of the newest entry (empty when there are none). */
export function newestChangelogDate(entries: ChangelogEntry[] = CHANGELOG): string {
  return entries.reduce((max, e) => (e.date > max ? e.date : max), '');
}

/** Whether the viewer has something new to read: their last seen date is missing or older than the newest entry. */
export function hasUnseenChanges(seen: string | null | undefined, newest: string = newestChangelogDate()): boolean {
  return !!newest && (!seen || seen < newest);
}

export const CHANGELOG_SEEN_KEY = 'tcg_changelog_seen';
