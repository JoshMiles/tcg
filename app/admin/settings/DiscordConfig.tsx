'use client';
import { Icon } from '@/app/components/Icon';
import { PendingButton } from '../components/PendingButton';
import { useActionState, useState } from 'react';
import { DISCORD_CATEGORIES, type DiscordSettings } from '@/lib/discord-config';
import type { ActionResult } from '../action-types';
import { discordAction } from '../actions';

const inputClass =
  'bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 transition-colors';
const secondaryBtn =
  'px-3.5 py-2 text-sm font-bold bg-gray-800 hover:bg-gray-700 text-gray-100 rounded-xl transition-colors disabled:opacity-50 disabled:pointer-events-none';

const MIN_STARS = [
  { value: 1, label: 'All pulls' },
  { value: 2, label: '2★ and up' },
  { value: 3, label: '3★ and up' },
  { value: 4, label: '4★ and up' },
  { value: 5, label: '5★ only (Legendary)' },
];

/**
 * Settings for posting the live activity feed to a Discord channel. One form: Save stores the
 * settings, while "Send test" / "Send last activity" post using whatever is currently in the form
 * (so you can verify a webhook before saving it). Fields are controlled so they survive a submit.
 */
export function DiscordConfig({ settings }: { settings: DiscordSettings }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(discordAction, null);

  const [url, setUrl] = useState(settings.url);
  const [showUrl, setShowUrl] = useState(false);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [cats, setCats] = useState(settings.categories);
  const [minStars, setMinStars] = useState(String(settings.minStars));
  const [newOnly, setNewOnly] = useState(settings.newOnly);

  const live = settings.enabled && !!settings.url;

  return (
    <section className="tcg-panel rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-800 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Icon name="chat" /> Discord activity feed
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Post pulls, grants and other activity to a Discord channel as it happens</p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider rounded-full px-2.5 py-0.5 border ${
            live ? 'text-green-300 bg-green-500/10 border-green-400/30' : 'text-gray-500 bg-gray-800/60 border-gray-700'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-green-400' : 'bg-gray-600'}`} />
          {live ? 'Sending' : 'Off'}
        </span>
      </div>

      <form action={formAction} className="px-6 py-5 space-y-6">
        {/* Webhook URL */}
        <div className="space-y-1.5">
          <label htmlFor="discord-url" className="block text-xs text-gray-500 font-bold uppercase tracking-wider">Webhook URL</label>
          <div className="flex gap-2">
            <input
              id="discord-url"
              name="url"
              type={showUrl ? 'text' : 'password'}
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/…"
              autoComplete="off"
              spellCheck={false}
              className={`${inputClass} flex-1 font-mono`}
            />
            <button type="button" onClick={() => setShowUrl(s => !s)} className={secondaryBtn}>
              {showUrl ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="text-xs text-gray-600">
            In Discord: <strong className="text-gray-400">Channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL</strong>.
            Treat it like a password — anyone with it can post to your channel.
          </p>
        </div>

        {/* Master switch */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input type="checkbox" name="enabled" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="accent-yellow-500 w-4 h-4" />
          <span className="text-sm text-white font-semibold">Post activity to Discord</span>
        </label>

        {/* What to post */}
        <fieldset className="space-y-2">
          <legend className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">What to post</legend>
          {DISCORD_CATEGORIES.map(c => (
            <label key={c.key} className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                name={`cat_${c.key}`}
                checked={cats[c.key]}
                onChange={e => setCats(prev => ({ ...prev, [c.key]: e.target.checked }))}
                className="accent-yellow-500 w-4 h-4 mt-0.5"
              />
              <span>
                <span className="text-sm text-gray-200 font-semibold">{c.label}</span>
                <span className="block text-xs text-gray-600">{c.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {/* Pull filters */}
        <div className={`rounded-xl border border-gray-800 bg-gray-950/50 p-4 space-y-3 ${cats.pulls ? '' : 'opacity-50'}`}>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Pull filters</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              Minimum rarity
              <select
                name="minStars"
                value={minStars}
                onChange={e => setMinStars(e.target.value)}
                disabled={!cats.pulls}
                className={`${inputClass} py-1.5`}
              >
                {MIN_STARS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
              <input type="checkbox" name="newOnly" checked={newOnly} onChange={e => setNewOnly(e.target.checked)} disabled={!cats.pulls} className="accent-yellow-500 w-4 h-4" />
              Only cards the viewer didn&apos;t have yet
            </label>
          </div>
          <p className="text-xs text-gray-600">Handy on a busy stream — e.g. 3★ and up, new cards only keeps the channel readable.</p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <PendingButton type="submit" name="intent" value="save" disabled={pending} className="px-5 py-2 tcg-btn rounded-xl text-sm">
            Save
          </PendingButton>
          <PendingButton type="submit" name="intent" value="test" disabled={pending} className={secondaryBtn} title="Posts a sample message using the URL above — nothing is saved">
            Send test message
          </PendingButton>
          <PendingButton type="submit" name="intent" value="last" disabled={pending} className={secondaryBtn} title="Re-posts the most recent activity event using the URL above, regardless of your filters">
            Send last activity
          </PendingButton>
        </div>

        {state && (
          <p
            role="status"
            className={`text-sm rounded-lg px-3 py-2 border ${
              state.ok ? 'text-green-300 bg-green-500/10 border-green-400/30' : 'text-amber-200 bg-amber-500/10 border-amber-400/30'
            }`}
          >
            {state.ok ? <Icon name="check" className="mr-1" /> : <Icon name="warning" className="mr-1" />}{state.message}
          </p>
        )}
      </form>
    </section>
  );
}
