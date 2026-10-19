'use client';
import { Icon } from '@/app/components/Icon';
import { PendingButton } from '../components/PendingButton';
import { ArmedButton } from '../components/ArmedButton';
import { useActionState, useId, useState } from 'react';
import {
  DEPLOY_STEPS, DISCORD_CATEGORIES, FEEDBACK_FILTER_KINDS, FEEDBACK_FILTER_OPTIONS, DISCORD_PRESETS, MAX_DISCORD_CHANNELS, presetChannel,
  type DiscordChannel, type DiscordLogEntry, type DiscordSettings,
} from '@/lib/discord-config';
import type { ActionResult } from '../action-types';
import { discordAction } from '../actions/settings';

const inputClass =
  'input';
const secondaryBtn =
  'px-3.5 py-2 text-sm font-bold bg-gray-800 hover:bg-gray-700 text-gray-100 rounded-xl transition-colors disabled:opacity-50 disabled:pointer-events-none';

const COLLAPSE_AFTER = 8;

const MIN_STARS = [
  { value: 1, label: 'All pulls' },
  { value: 2, label: '2★ and up' },
  { value: 3, label: '3★ and up' },
  { value: 4, label: '4★ and up' },
  { value: 5, label: '5★ only (Legendary)' },
];

/**
 * Settings for posting the live activity feed to Discord: any number of channels (one webhook each), every one with its own
 * switch and its own choice of what to post. One form: Save stores everything, while a channel's "Send test" / "Send last
 * activity" post using whatever is currently typed (so a webhook can be verified before saving). The whole settings object
 * travels in one hidden JSON field, so the controlled state below is the single source of truth.
 */
export function DiscordConfig({ settings, logs = {} }: { settings: DiscordSettings; logs?: Record<string, DiscordLogEntry[]> }) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(discordAction, null);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [channels, setChannels] = useState<DiscordChannel[]>(settings.channels);
  const [showDeploys, setShowDeploys] = useState(false);
  // Past COLLAPSE_AFTER channels the list collapses to one line each, and one card is open at a time.
  const [openId, setOpenId] = useState<string | null>(null);
  const collapsed = channels.length > COLLAPSE_AFTER;

  const patch = (id: string, p: Partial<DiscordChannel>) => setChannels(cs => cs.map(c => (c.id === id ? { ...c, ...p } : c)));
  const live = settings.enabled && settings.channels.some(c => c.enabled && c.url);
  const full = channels.length >= MAX_DISCORD_CHANNELS;

  return (
    <section className="card rounded-2xl overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-800 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Icon name="chat" /> Discord channels
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Post pulls, grants and other activity to Discord as it happens, each channel with its own events</p>
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
        <input type="hidden" name="settings" value={JSON.stringify({ enabled, channels })} />

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input type="checkbox" role="switch" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="toggle toggle-primary" />
          <span className="text-sm text-white font-semibold">Post to Discord <span className="text-gray-500 font-normal">(master switch for every channel)</span></span>
        </label>

        {channels.length === 0 && (
          <p className="text-sm text-gray-500 rounded-xl border border-dashed border-gray-800 px-4 py-6 text-center">
            No channels yet. Add one below, paste its webhook URL and choose what it should receive.
          </p>
        )}

        <div className="space-y-4">
          {channels.map(c => {
            const card = (
              <ChannelCard
                key={c.id}
                channel={c}
                log={logs[c.id] ?? []}
                pending={pending}
                onChange={p => patch(c.id, p)}
                onRemove={() => setChannels(cs => cs.filter(x => x.id !== c.id))}
              />
            );
            if (!collapsed) return card;
            if (openId === c.id) return (
              <div key={c.id} className="space-y-2">
                <button type="button" onClick={() => setOpenId(null)} aria-expanded className="text-xs font-bold text-gray-400 hover:text-white"><Icon name="chevronDown" className="mr-1" />Collapse {c.name || 'channel'}</button>
                {card}
              </div>
            );
            return <ChannelSummary key={c.id} channel={c} log={logs[c.id] ?? []} onOpen={() => setOpenId(c.id)} />;
          })}
        </div>

        {/* Add channel */}
        <div className="space-y-2">
          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Add channel</p>
          <div className="flex flex-wrap gap-2">
            {DISCORD_PRESETS.map(p => (
              <button key={p.key} type="button" disabled={full} title={p.hint} onClick={() => { const ch = presetChannel(p.key); setChannels(cs => [...cs, ch]); setOpenId(ch.id); }} className={secondaryBtn}>
                + {p.name}
              </button>
            ))}
            <button type="button" onClick={() => setShowDeploys(s => !s)} aria-expanded={showDeploys} className={secondaryBtn} title="GitHub and Vercel changes, posted by GitHub itself">
              Deploys &amp; code
            </button>
          </div>
          {full && <p className="text-xs text-gray-600">That is the most channels ({MAX_DISCORD_CHANNELS}).</p>}
        </div>

        {showDeploys && (
          <div className="rounded-xl border border-gray-800 bg-gray-950/50 p-4 space-y-2">
            <p className="text-sm font-semibold text-white">GitHub and Vercel changes in Discord</p>
            <p className="text-xs text-gray-500">Nothing to set up here: GitHub posts these itself, using a webhook of its own. It needs no category boxes.</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-gray-300">
              {DEPLOY_STEPS.map(t => <li key={t}>{t}</li>)}
            </ol>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <PendingButton type="submit" name="intent" value="save" disabled={pending} className="px-5 py-2 btn btn-primary rounded-xl text-sm">
            Save
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

function ChannelSummary({ channel: c, log, onOpen }: { channel: DiscordChannel; log: DiscordLogEntry[]; onOpen: () => void }) {
  const cats = DISCORD_CATEGORIES.filter(cat => c.categories[cat.key]).map(cat => cat.label);
  return (
    <button type="button" onClick={onOpen} aria-expanded={false} className="w-full text-left rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 hover:border-gray-700 transition-colors">
      <span className={`w-2 h-2 rounded-full shrink-0 ${c.enabled ? 'bg-green-500' : 'bg-gray-600'}`} aria-hidden />
      <span className="font-semibold text-sm text-white min-w-0 truncate">{c.name || 'Unnamed channel'}</span>
      <span className="text-xs text-gray-500">{c.enabled ? 'On' : 'Off'}</span>
      <span className="text-xs text-gray-500 min-w-0 truncate flex-1">{cats.length > 0 ? cats.join(', ') : 'Nothing selected'}</span>
      <span className={`text-xs ${!log[0] ? 'text-gray-600' : log[0].ok ? 'text-gray-500' : 'text-red-300'}`}>{!log[0] ? 'No sends yet' : log[0].ok ? 'Last send worked' : 'Last send failed'}</span>
      <Icon name="chevronRight" className="text-gray-500" />
    </button>
  );
}

function ChannelCard({ channel: c, log, pending, onChange, onRemove }: {
  channel: DiscordChannel;
  log: DiscordLogEntry[];
  pending: boolean;
  onChange: (p: Partial<DiscordChannel>) => void;
  onRemove: () => void;
}) {
  const uid = useId();
  const [showUrl, setShowUrl] = useState(false);
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={`${uid}-name`} className="sr-only">Channel name</label>
        <input id={`${uid}-name`} value={c.name} onChange={e => onChange({ name: e.target.value })} maxLength={40} className={`${inputClass} font-semibold w-48`} />
        <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
          <input type="checkbox" role="switch" checked={c.enabled} onChange={e => onChange({ enabled: e.target.checked, ...(e.target.checked ? { offReason: undefined } : {}) })} className="toggle toggle-sm toggle-primary" />
          On
        </label>
        {log[0] && (
          <span className={`inline-flex items-center gap-1.5 text-xs ${log[0].ok ? 'text-gray-500' : 'text-red-300'}`}>
            <span className={`w-2 h-2 rounded-full ${log[0].ok ? 'bg-green-500' : 'bg-red-500'}`} aria-hidden />
            {log[0].ok ? 'Last send worked' : 'Last send failed'}
          </span>
        )}
        <span className="flex-1" />
        <ArmedButton onConfirm={onRemove} className="text-xs font-bold text-gray-500 hover:text-red-300 transition-colors" armedClassName="text-xs font-bold text-red-300">
          <Icon name="trash" className="mr-1" />Remove
        </ArmedButton>
      </div>

      {c.offReason && <p role="status" className="text-sm rounded-lg px-3 py-2 border text-amber-200 bg-amber-500/10 border-amber-400/30"><Icon name="warning" className="mr-1" />{c.offReason}. Fix the webhook, then tick On and Save.</p>}

      <fieldset className="fieldset">
        <legend className="fieldset-legend"><label htmlFor={`${uid}-url`}>Webhook URL</label></legend>
        <div className="flex gap-2">
          <input
            id={`${uid}-url`}
            type={showUrl ? 'text' : 'password'}
            value={c.url}
            onChange={e => onChange({ url: e.target.value })}
            placeholder="https://discord.com/api/webhooks/…"
            autoComplete="off"
            spellCheck={false}
            className={`${inputClass} flex-1 min-w-0 font-mono`}
          />
          <button type="button" onClick={() => setShowUrl(s => !s)} className={secondaryBtn}>{showUrl ? 'Hide' : 'Show'}</button>
        </div>
        <p className="fieldset-label">
          In Discord: <strong className="text-gray-400">Channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL</strong>.
          Treat it like a password. Anyone with it can post to your channel.
        </p>
      </fieldset>

      <fieldset className="fieldset">
        <legend className="fieldset-legend">What to post</legend>
        {DISCORD_CATEGORIES.map(cat => (
          <div key={cat.key} className="space-y-2">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={c.categories[cat.key]}
              onChange={e => onChange({ categories: { ...c.categories, [cat.key]: e.target.checked } })}
              className="accent-yellow-500 w-4 h-4 mt-0.5"
            />
            <span>
              <span className="text-sm text-gray-200 font-semibold">{cat.label}</span>
              <span className="block text-xs text-gray-600">{cat.hint}</span>
            </span>
          </label>
          {cat.key === 'feedback' && c.categories.feedback && (
                <div className="ml-7 -mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {FEEDBACK_FILTER_OPTIONS.map(o => {
                    const on = !c.feedbackKinds || c.feedbackKinds.includes(o.key);
                    return (
                      <label key={o.key} className="inline-flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={e => {
                            const cur = c.feedbackKinds ?? FEEDBACK_FILTER_KINDS;
                            const next = e.target.checked ? [...new Set([...cur, o.key])] : cur.filter(k => k !== o.key);
                            onChange({ feedbackKinds: next.length === FEEDBACK_FILTER_KINDS.length ? undefined : FEEDBACK_FILTER_KINDS.filter(k => next.includes(k)) });
                          }}
                          className="accent-yellow-500 w-3.5 h-3.5"
                        />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
              )}
          </div>
        ))}
      </fieldset>

      <div className={`rounded-xl border border-gray-800 bg-gray-950/50 p-4 space-y-3 ${c.categories.pulls ? '' : 'opacity-50'}`}>
        <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Pull filters</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            Minimum rarity
            <select value={String(c.minStars)} onChange={e => onChange({ minStars: Number(e.target.value) })} disabled={!c.categories.pulls} className="select">
              {MIN_STARS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
            <input type="checkbox" role="switch" checked={c.newOnly} onChange={e => onChange({ newOnly: e.target.checked })} disabled={!c.categories.pulls} className="toggle toggle-sm toggle-primary" />
            Only cards the viewer didn&apos;t have yet
          </label>
        </div>
      </div>

      {log.length > 0 && (
        <details className="text-xs text-gray-400">
          <summary className="cursor-pointer select-none font-semibold text-gray-300">Recent sends ({log.length})</summary>
          <ul className="mt-2 space-y-1">
            {log.map(e => (
              <li key={`${e.at}-${e.kind}`} className="flex flex-wrap items-baseline gap-x-2">
                <span className={`w-1.5 h-1.5 rounded-full self-center ${e.ok ? 'bg-green-500' : 'bg-red-500'}`} aria-hidden />
                <span className="tabular-nums text-gray-500">{new Date(e.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC</span>
                <span className="text-gray-300">{e.kind}</span>
                <span className={e.ok ? 'text-gray-500' : 'text-red-300'}>{e.ok ? `HTTP ${e.status}` : `${e.error ?? 'Failed'}${e.status ? ` (HTTP ${e.status})` : ''}`}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <PendingButton type="submit" name="intent" value={`test:${c.id}`} disabled={pending} className={secondaryBtn} title="Posts a sample message using the URL above. Nothing is saved">
          Send test message
        </PendingButton>
        <PendingButton type="submit" name="intent" value={`last:${c.id}`} disabled={pending} className={secondaryBtn} title="Re-posts the most recent activity event that matches this channel's categories and filters">
          Send last activity
        </PendingButton>
      </div>
      {DISCORD_CATEGORIES.some(cat => c.categories[cat.key]) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500">Test a category:</span>
          {DISCORD_CATEGORIES.filter(cat => c.categories[cat.key]).map(cat => (
            <PendingButton key={cat.key} type="submit" name="intent" value={`sample:${c.id}:${cat.key}`} disabled={pending} className={secondaryBtn} title={`Posts the newest real ${cat.label.toLowerCase()} message, or a made-up one when there is none. Nothing is saved`}>
              {cat.label}
            </PendingButton>
          ))}
        </div>
      )}
    </div>
  );
}
