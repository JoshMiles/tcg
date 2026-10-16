'use client';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { PushAlerts } from '@/app/components/site/PushAlerts';
import { AccentPicker } from '@/app/components/site/AccentPicker';
import { PronounPicker } from '@/app/components/site/PronounPicker';
import { BIO_MAX, EXPERIMENTS, WANTED_MAX, WATCH_MAX, sanitizeUserSettings, type UserSettings } from '@/lib/user-settings';
import { watchLabel } from '@/lib/watch-core';
import { VARIANTS, VARIANT_LABELS } from '@/lib/variants';
import type { Variant } from '@/lib/types';

type BoolKey = 'privateProfile' | 'notifyOffers' | 'notifyResults' | 'notifyWatch' | 'notifyFeedback' | 'noticeSound' | 'allowOffers' | 'hideStaffBadge' | 'hideUncollected' | 'compactGrids';

function Section({ icon, title, hint, children }: { icon: Parameters<typeof Icon>[0]['name']; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="tcg-panel rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold text-white"><Icon name={icon} className="mr-2 text-yellow-400" />{title}</h2>
        {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
      </div>
      <div className="divide-y divide-gray-800/70">{children}</div>
    </section>
  );
}

function Row({ label, help, checked, onChange, id }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <label htmlFor={id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0 cursor-pointer">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-100">{label}</span>
        <span className="block text-xs text-gray-500 mt-0.5">{help}</span>
      </span>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-yellow-500" />
    </label>
  );
}

export function SettingsForm({ initial, username, cards, isStaff = false }: { initial: UserSettings; username: string; isStaff?: boolean; cards: { number: number; name: string; stars: number }[] }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [s, setS] = useState(initial);
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'ok' | 'error'; msg?: string }>({ kind: 'idle' });
  const [find, setFind] = useState('');
  const toggleWanted = (n: number) => setS(p => ({ ...p, wanted: p.wanted.includes(n) ? p.wanted.filter(x => x !== n) : p.wanted.length < WANTED_MAX ? [...p.wanted, n] : p.wanted }));
  const matches = find.trim() ? cards.filter(c => c.name.toLowerCase().includes(find.trim().toLowerCase()) || String(c.number) === find.trim()).slice(0, 8) : [];
  const nameOf = (n: number) => cards.find(c => c.number === n)?.name ?? `#${n}`;
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  // Listing alerts: a card and a version (or any) to watch for on the board.
  const [watchFind, setWatchFind] = useState('');
  const [watchVariant, setWatchVariant] = useState<Variant | ''>('');
  const watchMatches = watchFind.trim() ? cards.filter(c => c.name.toLowerCase().includes(watchFind.trim().toLowerCase()) || String(c.number) === watchFind.trim()).slice(0, 6) : [];
  const addWatch = (card: number) => setS(p => (p.watches.length >= WATCH_MAX || p.watches.some(w => w.card === card && w.variant === (watchVariant || null))) ? p : { ...p, watches: [...p.watches, { card, variant: watchVariant || null }] });
  const removeWatch = (i: number) => setS(p => ({ ...p, watches: p.watches.filter((_, j) => j !== i) }));

  const flip = (k: BoolKey) => (v: boolean) => setS(p => ({ ...p, [k]: v }));
  const toggleExp = (id: string, on: boolean) => setS(p => ({ ...p, experiments: on ? [...p.experiments, id] : p.experiments.filter(x => x !== id) }));

  async function save() {
    setState({ kind: 'saving' });
    try {
      const res = await fetch('/api/account/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save.');
      const next = sanitizeUserSettings(data.settings);
      setS(next); setSaved(next);
      setState({ kind: 'ok', msg: 'Saved.' });
      router.refresh(); // the nav, profile and grids read these
    } catch (e) {
      setState({ kind: 'error', msg: e instanceof Error ? e.message : 'Could not save.' });
    }
  }

  return (
    <form onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-6">
      <Section icon="user" title="Profile" hint="What other collectors see on your page.">
        <div className="pb-3 space-y-1.5">
          <label htmlFor="bio" className="block text-sm font-semibold text-gray-100">About you</label>
          <textarea id="bio" value={s.bio} maxLength={BIO_MAX} rows={2} onChange={e => setS(p => ({ ...p, bio: e.target.value }))}
            placeholder="A line about your collection, favourite card, trading wishes..." className="w-full rounded-xl bg-gray-950 border border-gray-700 focus:border-yellow-500 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none" />
          <p className="text-xs text-gray-500 text-right tabular-nums">{s.bio.length}/{BIO_MAX}</p>
        </div>
        <div className="py-3 space-y-2">
          <p className="text-sm font-semibold text-gray-100">Header colour</p>
          <AccentPicker id="settings-accent" value={s.accent} onChange={v => setS(p => ({ ...p, accent: v }))} />
          <p className="text-xs text-gray-500">You can also edit your bio, colour and pronouns on your profile.</p>
        </div>
        <div className="py-3 space-y-1.5">
          <label htmlFor="settings-pronouns" className="block text-sm font-semibold text-gray-100">Pronouns</label>
          <PronounPicker id="settings-pronouns" value={s.pronouns} onChange={v => setS(p => ({ ...p, pronouns: v }))} />
          <p className="text-xs text-gray-500">Shown after your name on your profile. Off until you choose.</p>
        </div>
        <div className="py-3 space-y-1.5">
          <label htmlFor="collection-view" className="block text-sm font-semibold text-gray-100">Show visitors my collection as</label>
          <select id="collection-view" value={s.collectionView} onChange={e => setS(p => ({ ...p, collectionView: e.target.value === 'binder' ? 'binder' : 'grid' }))} className="rounded-xl bg-gray-950 border border-gray-700 px-3 py-1.5 text-sm text-gray-200">
            <option value="grid">A card grid</option>
            <option value="binder">My binder</option>
          </select>
          <p className="text-xs text-gray-500">Visitors can still switch views; their own choice wins.</p>
        </div>
        <div className="py-3 space-y-2" id="looking-for">
          <p className="text-sm font-semibold text-gray-100">Looking for</p>
          <p className="text-xs text-gray-500">Up to 6 cards you want. They show in the Looking for widget on your profile, and collectors who own one get a one-click trade offer.</p>
          <div className="flex flex-wrap gap-1.5">
            {s.wanted.length === 0 && <span className="text-xs text-gray-600">Nothing listed yet.</span>}
            {s.wanted.map(n => (
              <button key={n} type="button" onClick={() => toggleWanted(n)} title="Remove" className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2.5 py-1 text-xs font-bold text-yellow-200 hover:bg-yellow-500/20">{nameOf(n)} <Icon name="x" /></button>
            ))}
            <span className="text-xs text-gray-600 self-center">{s.wanted.length}/{WANTED_MAX}</span>
          </div>
          <input type="search" value={find} onChange={e => setFind(e.target.value)} placeholder="Search a card to add" aria-label="Search cards to add" className="w-full rounded-xl bg-gray-950 border border-gray-700 focus:border-yellow-500 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none" />
          {matches.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {matches.map(c => (
                <li key={c.number}><button type="button" disabled={s.wanted.includes(c.number) || s.wanted.length >= WANTED_MAX} onClick={() => toggleWanted(c.number)} className="rounded-full border border-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:text-white disabled:opacity-40">+ #{c.number} {c.name}</button></li>
              ))}
            </ul>
          )}
        </div>
        {isStaff && <Row id="staff-badge" label="Show my staff badge" help="Your Streamer, Admin or Mod badge appears next to your name on your profile, the leaderboard and trades. Turn off to play as a normal player." checked={!s.hideStaffBadge} onChange={v => flip('hideStaffBadge')(!v)} />}
        <Row id="private" label="Private profile" help="Hide my profile page and leave me off the public leaderboard, card owner lists and recent pulls. Anyone else who opens my page sees only that it is private; I still see it." checked={s.privateProfile} onChange={flip('privateProfile')} />
      </Section>

      <Section icon="bell" title="Trading and notifications" hint="Admin notices about your offers always come through.">
        <Row id="allow" label="Accept direct offers" help="Turn off to stop other collectors offering you trades. The open board and counter-offers to your own offers still work." checked={s.allowOffers} onChange={flip('allowOffers')} />
        <Row id="n-offers" label="New offers and counters" help="A bell notice when someone offers you a trade or counters yours." checked={s.notifyOffers} onChange={flip('notifyOffers')} />
        <Row id="n-results" label="How my offers ended" help="A bell notice when an offer of yours is accepted, declined, withdrawn or runs out of time." checked={s.notifyResults} onChange={flip('notifyResults')} />
        <Row id="n-watch" label="Listing alerts" help="A bell notice when someone posts a card on the open board that is on your Looking for list or one of your saved alerts below." checked={s.notifyWatch} onChange={flip('notifyWatch')} />
        <Row id="n-feedback" label="Answers to my feedback" help="A bell notice when staff reply to a suggestion or problem report you sent, or change its status." checked={s.notifyFeedback} onChange={flip('notifyFeedback')} />
        <Row id="n-sound" label="Play a sound" help="A short chime when a new notice arrives while the site is open in your browser. Off by default." checked={s.noticeSound} onChange={flip('noticeSound')} />
        <PushAlerts kinds={s.pushKinds} onKinds={pushKinds => setS(p => ({ ...p, pushKinds }))} />
      </Section>

      <Section icon="search" title="Saved alerts" hint="Tell me when someone lists a card, in a version you choose. Cards on your Looking for list alert in every version automatically.">
        <div className="space-y-2 pb-1" id="watches">
          <div className="flex flex-wrap gap-1.5">
            {s.watches.length === 0 && <span className="text-xs text-gray-600">No saved alerts yet.</span>}
            {s.watches.map((w, i) => (
              <button key={`${w.card}-${w.variant}`} type="button" onClick={() => removeWatch(i)} title="Remove" className="rounded-full border border-sky-400/40 bg-sky-500/10 px-2.5 py-1 text-xs font-bold text-sky-200 hover:bg-sky-500/20">{watchLabel(w, nameOf)} <Icon name="x" /></button>
            ))}
            <span className="text-xs text-gray-600 self-center">{s.watches.length}/{WATCH_MAX}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <input type="search" value={watchFind} onChange={e => setWatchFind(e.target.value)} placeholder="Search a card to watch" aria-label="Search a card to watch"
              className="min-w-0 flex-1 basis-44 rounded-xl bg-gray-950 border border-gray-700 focus:border-yellow-500 px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none" />
            <select value={watchVariant} onChange={e => setWatchVariant(e.target.value as Variant | '')} aria-label="Version to watch for" className="rounded-xl bg-gray-950 border border-gray-700 px-2 py-1.5 text-sm text-gray-200">
              <option value="">Any version</option>
              {VARIANTS.map(v => <option key={v} value={v}>{VARIANT_LABELS[v]}</option>)}
            </select>
          </div>
          {watchMatches.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {watchMatches.map(c => (
                <li key={c.number}><button type="button" disabled={s.watches.length >= WATCH_MAX} onClick={() => { addWatch(c.number); setWatchFind(''); }} className="rounded-full border border-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:text-white disabled:opacity-40">+ #{c.number} {c.name}</button></li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section icon="eye" title="Display" hint="Saved to your account, so it follows you between devices.">
        <Row id="hide" label="Hide uncollected cards" help="Collection grids start with the ? tiles hidden." checked={s.hideUncollected} onChange={flip('hideUncollected')} />
        <Row id="compact" label="Compact grids" help="Smaller card tiles, more cards on screen." checked={s.compactGrids} onChange={flip('compactGrids')} />
        <Row id="motion" label="Reduce motion" help="Calm the site's animations even if your device doesn't ask for it." checked={s.motion === 'reduce'} onChange={v => setS(p => ({ ...p, motion: v ? 'reduce' : 'system' }))} />
      </Section>

      <Section icon="flask" title="Experimental" hint="Early features that may change or go away.">
        {EXPERIMENTS.map(x => (
          <div key={x.id}>
            <Row id={`x-${x.id}`} label={x.label} help={x.description} checked={s.experiments.includes(x.id)} onChange={v => toggleExp(x.id, v)} />
          </div>
        ))}
      </Section>

      <Section icon="download" title="Your data" hint="Cards, trades and settings are stored against your Twitch login name.">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <a href="/api/account/export" className="inline-flex items-center gap-1.5 rounded-full border border-gray-700 hover:border-yellow-500/60 px-3 py-1.5 text-gray-200 hover:text-white"><Icon name="download" />Download my data (JSON)</a>
          <a href="/privacy" className="text-yellow-400 hover:text-yellow-300">Privacy policy</a>
          <span className="text-xs text-gray-600">Signed in as @{username}</span>
        </div>
      </Section>

      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-950/90 backdrop-blur px-4 py-3">
        <p role="status" aria-live="polite" className={`text-sm ${state.kind === 'error' ? 'text-red-300' : state.kind === 'ok' ? 'text-emerald-300' : 'text-gray-500'}`}>
          {state.kind === 'saving' ? 'Saving...' : state.msg ?? (dirty ? 'Unsaved changes' : 'Up to date')}
        </p>
        <div className="flex gap-2">
          <button type="button" disabled={!dirty} onClick={() => { setS(saved); setState({ kind: 'idle' }); }} className="rounded-xl px-3 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-40">Discard</button>
          <button type="submit" disabled={!dirty || state.kind === 'saving'} className="tcg-btn rounded-xl px-5 py-2 text-sm disabled:opacity-50">Save</button>
        </div>
      </div>
    </form>
  );
}
