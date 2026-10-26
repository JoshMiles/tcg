'use client';
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { AccentPicker } from '@/app/components/site/AccentPicker';
import { PronounPicker } from '@/app/components/site/PronounPicker';
import type { Pronouns } from '@/lib/pronouns';
import { BIO_MAX } from '@/lib/user-settings';
import { saveProfileBasics } from './actions';

type Basics = {
  bio: string;
  open: boolean;
  pending: boolean;
  error: string;
  draftBio: string;
  draftAccent: string;
  draftPronouns: Pronouns;
  begin: () => void;
  close: () => void;
  save: () => void;
  setDraftBio: (bio: string) => void;
  setDraftAccent: (accent: string) => void;
  setDraftPronouns: (pronouns: Pronouns) => void;
};

const BasicsContext = createContext<Basics | null>(null);

function useBasics(): Basics {
  const value = useContext(BasicsContext);
  if (!value) throw new Error('Profile edit controls must sit inside ProfileBasics');
  return value;
}

/** Owner-only state for the inline bio, header colour and pronouns editor. Visitors never get this. */
export function ProfileBasics({ bio, accent, pronouns, children }: { bio: string; accent: string; pronouns: Pronouns; children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draftBio, setDraftBio] = useState(bio);
  const [draftAccent, setDraftAccent] = useState(accent);
  const [draftPronouns, setDraftPronouns] = useState(pronouns);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const begin = () => { setDraftBio(bio); setDraftAccent(accent); setDraftPronouns(pronouns); setError(''); setOpen(true); };
  const save = () => start(async () => {
    try {
      await saveProfileBasics({ bio: draftBio, accent: draftAccent, pronouns: draftPronouns });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  });

  return (
    <BasicsContext.Provider value={{
      bio, open, pending, error, draftBio, draftAccent, draftPronouns, begin,
      close: () => setOpen(false), save, setDraftBio, setDraftAccent, setDraftPronouns,
    }}>
      {children}
    </BasicsContext.Provider>
  );
}

/** Saved bio under the name, or the open editor. The edit control lives in the action row. */
export function ProfileBioLine({ hideWhenClosed = false }: { hideWhenClosed?: boolean }) {
  const b = useBasics();
  if (hideWhenClosed && !b.open) return null;
  if (b.open) {
    return (
      <form onSubmit={e => { e.preventDefault(); b.save(); }} className="card mt-3 max-w-xl space-y-3 rounded-2xl p-4">
        <fieldset className="fieldset">
          <legend className="fieldset-legend"><label htmlFor="profile-bio">About you</label></legend>
          <textarea id="profile-bio" value={b.draftBio} maxLength={BIO_MAX} rows={2} onChange={e => b.setDraftBio(e.target.value)} placeholder="A line about your collection, favourite card, trading wishes..."
            className="textarea w-full" />
          <p className="text-xs text-gray-500 text-right tabular-nums">{b.draftBio.length}/{BIO_MAX}</p>
        </fieldset>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-gray-100">Header colour</p>
          <AccentPicker id="profile-accent" value={b.draftAccent} onChange={b.setDraftAccent} />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-gray-100">Pronouns</p>
          <PronounPicker id="profile-pronouns" value={b.draftPronouns} onChange={b.setDraftPronouns} />
        </div>
        {b.error && <p role="alert" className="text-sm text-red-300">{b.error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={b.pending} className="rounded-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 px-4 py-1.5 text-sm font-bold text-gray-950">{b.pending ? 'Saving...' : 'Save'}</button>
          <button type="button" disabled={b.pending} onClick={b.close} className="rounded-full border border-gray-700 px-4 py-1.5 text-sm font-bold text-gray-300 hover:text-white">Cancel</button>
        </div>
      </form>
    );
  }
  return (
    <div className="mt-2">
      {b.bio ? <p className="text-sm text-gray-300 max-w-xl wrap-break-word">{b.bio}</p> : <p className="text-sm text-gray-600">No bio yet.</p>}
    </div>
  );
}

/** The owner's "More" menu in the action row (Leaderboard, Edit profile, Settings). Render it inside ProfileBasics. */
export function ProfileOwnerMenu({ leaderboardHref }: { leaderboardHref: string }) {
  const { open: editing, begin } = useBasics();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const item = 'w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-white/10 focus:bg-white/10 focus:outline-hidden';
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-200 bg-white/6 border border-white/10 hover:bg-white/10 rounded-full px-3 py-1.5 transition-colors">
        <Icon name="settings" />More<Icon name="chevronDown" className="w-3 h-3 text-gray-400" />
      </button>
      {open && (
        <div role="menu" aria-label="Profile" className="absolute right-0 z-30 mt-2 w-52 overflow-hidden rounded-xl border border-gray-700 bg-gray-900 shadow-2xl py-1">
          <Link role="menuitem" href={leaderboardHref} onClick={() => setOpen(false)} className={item}><Icon name="trophy" className="text-gray-400" />Leaderboard</Link>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); if (!editing) begin(); }} className={item}><Icon name="pencil" className="text-gray-400" />Edit profile</button>
          <Link role="menuitem" href="/settings" onClick={() => setOpen(false)} className={item}><Icon name="settings" className="text-gray-400" />Settings</Link>
        </div>
      )}
    </div>
  );
}
