'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArmedButton } from '@/app/components/ArmedButton';
import { Panel } from '../components/ui';
import { disconnectTwitchBotAction, disconnectTwitchChannelAction, setReplyAsAction } from './bridge-actions';

/** `listening`: "TCG Bridge listening on STREAM-PC since ..., last event ..." (58.2), null when the app is not; `problem` says why not; `events` are the newest forwarded events.
 *  58.5: `awardsPaused` = channel point awards are paused from TCG Bridge.
 *  58.6: `chat` = the channel allowed chat (else "Reconnect to allow chat"); `chatLine` is set while chat comes through TCG Bridge; `bot` is the optional bot account. */
export interface TwitchChannelView {
  login: string; scopes: string[]; since: string; by: string; testing: boolean; testingLine: string; awardsPaused: boolean; listening: string | null; problem: string; events: { text: string; ago: string }[];
  chat: boolean; chatLine: string | null; bot: { login: string; since: string; by: string } | null; replyAs: 'channel' | 'bot';
}

/** Connection → Twitch channel (ROADMAP 58.1): connect the channel TCG Bridge reads Twitch events from, see who it is, disconnect. Never shows a token. 58.6 adds chat: the reconnect prompt and the optional bot account. */
export function TwitchChannelCard({ channel, ready }: { channel: TwitchChannelView | null; ready: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Panel title="Twitch channel" icon="link" hint="The Twitch account whose channel points, bits, gifted subs, raids and chat commands TCG Bridge listens to. Any Twitch account works, so a spare one can be used to test.">
      {channel ? (
        <div className="space-y-2 text-sm">
          <p className="text-gray-200">Connected as <strong>{channel.login}</strong> since {channel.since}, by {channel.by}.</p>
          {channel.testing && <p role="status" className="text-amber-300">{channel.testingLine}</p>}
          <p className="text-xs text-gray-500">Allowed: {channel.scopes.join(', ')}.</p>
          {channel.awardsPaused && <p role="status" className="text-amber-300">Channel point awards are paused (from TCG Bridge). Redemptions are recorded, but no award runs.</p>}
          {channel.listening ? <p className="text-emerald-300">{channel.listening}.</p> : <p className="text-amber-300">{channel.problem}.</p>}
          {!channel.chat && <p role="status" className="text-amber-300">Reconnect to allow chat. Chat commands stay off until the channel is connected again; everything else keeps working.</p>}
          {channel.chatLine && <p className="text-emerald-300">{channel.chatLine}</p>}
          {channel.events.length > 0 && (
            <ul className="text-xs text-gray-400 space-y-0.5" aria-label="Recent Twitch events">
              {channel.events.map((e, i) => <li key={i}>{e.text} <span className="text-gray-600">({e.ago})</span></li>)}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <a href="/admin/mixitup/twitch" className={channel.chat ? 'btn btn-sm btn-outline' : 'btn btn-sm btn-primary'}>{channel.chat ? 'Connect another account' : 'Reconnect to allow chat'}</a>
            <ArmedButton
              disabled={pending}
              onConfirm={() => start(async () => { await disconnectTwitchChannelAction(); router.refresh(); })}
              className="btn btn-sm btn-outline"
              armedClassName="btn btn-sm btn-error"
            >Disconnect</ArmedButton>
          </div>

          <div className="border-t border-gray-800 pt-3 space-y-2">
            <h3 className="text-sm font-semibold text-gray-200">Chat replies</h3>
            <p className="text-xs text-gray-500">Replies to chat commands are sent as the channel account. A bot account (any other Twitch account) can send them instead.</p>
            {channel.bot
              ? <p className="text-gray-200">Bot account <strong>{channel.bot.login}</strong> connected since {channel.bot.since}, by {channel.bot.by}.</p>
              : <p className="text-gray-400">No bot account connected.</p>}
            <label className="flex items-center gap-2 text-xs text-gray-300">
              Reply as
              <select
                className="select select-sm"
                value={channel.replyAs}
                disabled={pending || !channel.bot}
                onChange={e => start(async () => { await setReplyAsAction(e.target.value); router.refresh(); })}
              >
                <option value="channel">Channel</option>
                <option value="bot" disabled={!channel.bot}>Bot</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <a href="/admin/mixitup/twitch-bot" className="btn btn-sm btn-outline">{channel.bot ? 'Connect another bot account' : 'Connect bot account'}</a>
              {channel.bot && (
                <ArmedButton
                  disabled={pending}
                  onConfirm={() => start(async () => { await disconnectTwitchBotAction(); router.refresh(); })}
                  className="btn btn-sm btn-outline"
                  armedClassName="btn btn-sm btn-error"
                >Disconnect bot</ArmedButton>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-gray-400">Not connected.</p>
          {ready
            ? <a href="/admin/mixitup/twitch" className="btn btn-sm btn-primary">Connect Twitch channel</a>
            : <p className="text-xs text-amber-300">Needs TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET and BACKUP_ENCRYPTION_KEY set on the site.</p>}
        </div>
      )}
    </Panel>
  );
}
