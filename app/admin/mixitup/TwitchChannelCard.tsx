'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArmedButton } from '@/app/components/ArmedButton';
import { Panel } from '../components/ui';
import { disconnectTwitchChannelAction } from './bridge-actions';

/** `listening`: "TCG Bridge listening on STREAM-PC since ..., last event ..." (58.2), null when the app is not; `problem` says why not; `events` are the newest forwarded events. */
export interface TwitchChannelView { login: string; scopes: string[]; since: string; by: string; testing: boolean; testingLine: string; listening: string | null; problem: string; events: { text: string; ago: string }[] }

/** Connection → Twitch channel (ROADMAP 58.1): connect the channel TCG Bridge reads Twitch events from, see who it is, disconnect. Never shows a token. */
export function TwitchChannelCard({ channel, ready }: { channel: TwitchChannelView | null; ready: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Panel title="Twitch channel" icon="link" hint="The Twitch account whose channel points, bits, gifted subs and raids TCG Bridge listens to. Any Twitch account works, so a spare one can be used to test.">
      {channel ? (
        <div className="space-y-2 text-sm">
          <p className="text-gray-200">Connected as <strong>{channel.login}</strong> since {channel.since}, by {channel.by}.</p>
          {channel.testing && <p role="status" className="text-amber-300">{channel.testingLine}</p>}
          <p className="text-xs text-gray-500">Allowed: {channel.scopes.join(', ')}.</p>
          {channel.listening ? <p className="text-emerald-300">{channel.listening}.</p> : <p className="text-amber-300">{channel.problem}.</p>}
          {channel.events.length > 0 && (
            <ul className="text-xs text-gray-400 space-y-0.5" aria-label="Recent Twitch events">
              {channel.events.map((e, i) => <li key={i}>{e.text} <span className="text-gray-600">({e.ago})</span></li>)}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <a href="/admin/mixitup/twitch" className="btn btn-sm btn-outline">Connect another account</a>
            <ArmedButton
              disabled={pending}
              onConfirm={() => start(async () => { await disconnectTwitchChannelAction(); router.refresh(); })}
              className="btn btn-sm btn-outline"
              armedClassName="btn btn-sm btn-error"
            >Disconnect</ArmedButton>
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
