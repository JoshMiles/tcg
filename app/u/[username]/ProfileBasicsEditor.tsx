'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { AccentPicker } from '@/app/components/site/AccentPicker';
import { BIO_MAX } from '@/lib/user-settings';
import { saveProfileBasics } from './actions';

/** The owner's inline editor in the profile header: the bio line now, and the accent colour. Visitors never get this component. */
export function ProfileBasicsEditor({ bio, accent }: { bio: string; accent: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draftBio, setDraftBio] = useState(bio);
  const [draftAccent, setDraftAccent] = useState(accent);
  const [error, setError] = useState('');
  const [pending, start] = useTransition();

  const begin = () => { setDraftBio(bio); setDraftAccent(accent); setError(''); setOpen(true); };
  const save = () => start(async () => {
    try {
      await saveProfileBasics({ bio: draftBio, accent: draftAccent });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  });

  if (!open) {
    return (
      <div className="mt-2 flex flex-wrap items-start gap-2">
        {bio ? <p className="text-sm text-gray-300 max-w-xl break-words">{bio}</p> : <p className="text-sm text-gray-600">No bio yet.</p>}
        <button type="button" onClick={begin} className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-200 bg-white/[0.06] border border-white/10 hover:bg-white/10 rounded-full px-3 py-1 transition-colors">
          <Icon name="pencil" />Edit profile
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={e => { e.preventDefault(); save(); }} className="mt-3 max-w-xl space-y-3 rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
      <div className="space-y-1.5">
        <label htmlFor="profile-bio" className="block text-sm font-semibold text-gray-100">About you</label>
        <textarea id="profile-bio" value={draftBio} maxLength={BIO_MAX} rows={2} onChange={e => setDraftBio(e.target.value)} placeholder="A line about your collection, favourite card, trading wishes..."
          className="w-full rounded-xl bg-gray-950 border border-gray-700 focus:border-yellow-500 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none" />
        <p className="text-xs text-gray-500 text-right tabular-nums">{draftBio.length}/{BIO_MAX}</p>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-gray-100">Header colour</p>
        <AccentPicker id="profile-accent" value={draftAccent} onChange={setDraftAccent} />
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 px-4 py-1.5 text-sm font-bold text-gray-950">{pending ? 'Saving...' : 'Save'}</button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded-full border border-gray-700 px-4 py-1.5 text-sm font-bold text-gray-300 hover:text-white">Cancel</button>
      </div>
    </form>
  );
}
