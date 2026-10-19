import type { ReactNode } from 'react';
import Link from 'next/link';
import { CHANNEL_NAME, CHANNEL_URL } from '@/lib/site';
import { Section, Q } from '../parts';

export function StartSection({ title = 'Getting started', extra }: { title?: string; extra?: ReactNode } = {}) {
  return (
    <Section id="start" title={title} icon="cheese">
      <Q q="What is The Cheesy TCG?" open>
        A collectible card game played live on {CHANNEL_NAME}&rsquo;s Twitch channel. Packs are opened on stream, the cards you pull go into your collection, and you can hunt for rare versions, upgrade your duplicates and climb
        the leaderboard. It&rsquo;s a fan-made community game and isn&rsquo;t affiliated with Twitch.
      </Q>
      <Q q="Are the cards NFTs or worth real money?" id="not-nfts">
        No. The cards are <strong className="text-white">virtual trading cards for fun</strong>: entries in this game&rsquo;s own database, not NFTs, tokens, crypto or anything on a blockchain. They aren&rsquo;t assets or property, have no cash value,
        and can&rsquo;t be bought, sold or cashed out, here or anywhere else. Edition numbers and rarities are just part of the game. If anyone offers to sell you our cards, or to &ldquo;mint&rdquo; them, it isn&rsquo;t us. See the{' '}
        <Link href="/terms" className="text-yellow-400 hover:text-yellow-300">Terms</Link>.
      </Q>
      <Q q="Where can I play?">
        Only on <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:text-yellow-300 underline">{CHANNEL_NAME}&rsquo;s Twitch channel</a>. It doesn&rsquo;t run anywhere else. Packs are opened live there,
        and the Twitch extension is only available on that channel. This website just lets you look at your collection and, when you&rsquo;re logged in, upgrade your cards.
      </Q>
      <Q q="Is there an app?" id="app">
        There&rsquo;s no app store version, but you can add the website to your home screen on iPhone, Android or a computer so it opens full screen from its own icon. Step-by-step instructions are on the{' '}
        <Link href="/install" className="text-yellow-400 hover:text-yellow-300">Get the app</Link> page. On iPhone you&rsquo;ll need to log in with Twitch once inside the home-screen app.
      </Q>
      <Q q="How do I get cards?">
        <p>
          Packs are opened live on {CHANNEL_NAME}&rsquo;s stream. When one is opened for you, your name appears on screen with the card you pulled, and it&rsquo;s added to your collection straight away.
          In short:
        </p>
        <ul className="list-disc pl-5 space-y-1 marker:text-gray-600 mt-2">
          <li><strong className="text-white">Follow</strong>, <strong className="text-white">subscribe</strong>, or <strong className="text-white">gift subs</strong>: each is a way to earn packs.</li>
        </ul>
        <p className="mt-2">
          The chat commands, including how to ask for a pack, are under <a href="#commands" className="text-yellow-400 hover:text-yellow-300">Chat commands</a>.
        </p>
        <p className="mt-2">
          Exactly how many packs each of these gives can change from season to season and stream to stream, so watch the channel (and its chat commands) for what is running right now.
        </p>
      </Q>
      <Q q="Is there a limit to how many cards I can get per stream?">
        There is no limit on paid pulls until staff set one. They can set a limit for regular viewers, subscribers, VIPs, moderators and the broadcaster, and a personal limit for you that replaces yours. They can also add extra pulls for everyone for the current stream, and grant you a personal bonus. A limit of 0 means no limit, and a bonus does not change that. A gifted sub earns a pack. It does not raise your pull limit.
      </Q>
      <Q q="Where can I see my cards?">
        <ul className="list-disc pl-5 space-y-1 marker:text-gray-600">
          <li>On the website: every collector has a public profile with their collection. Use <Link href="/collection" className="text-yellow-400 hover:text-yellow-300">Collectors</Link> or the search box at the top (press <kbd className="kbd">/</kbd>) to find anyone.</li>
          <li>Logged in, <strong className="text-white">My profile</strong> and <strong className="text-white">My stats</strong> are in the menu at the top right.</li>
          <li>In Twitch, under the stream, with the extension (see <a href="#extension" className="text-yellow-400 hover:text-yellow-300">Twitch extension</a>).</li>
        </ul>
      </Q>
      <Q q="Do I need an account?">
        Not to browse. Collections, the leaderboard, season stats and the card dex are open to everyone. <strong className="text-white">Log in with Twitch</strong> to see your own stats and to upgrade
        cards on the website, trade, customise your profile and change your settings. Logging in only shares your basic public Twitch profile (we ask for no extra permissions).
      </Q>
      <Q q="I can&rsquo;t find my collection">
        A collection appears once you&rsquo;ve pulled at least one card this season. Check the spelling of your Twitch username (capitals don&rsquo;t matter). If you&rsquo;ve just pulled something, refresh the page.
      </Q>
      {extra}
    </Section>
  );
}
