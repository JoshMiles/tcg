'use client';
import { PRONOUN_CHOICES, PRONOUN_MODE_LABELS, sanitizePronouns, type PronounMode, type Pronouns } from '@/lib/pronouns';

const select = 'select select-sm w-fit max-w-full';

/** Pronouns: off (the default), one pick from a fixed list, or the ones set on pr.alejo.io. Used in Settings and in the profile editor. */
export function PronounPicker({ value, onChange, id = 'pronouns' }: { value: Pronouns; onChange: (v: Pronouns) => void; id?: string }) {
  const setMode = (mode: PronounMode) => onChange(mode === 'set' ? sanitizePronouns({ mode, value: value.value ?? PRONOUN_CHOICES[0].id }) : { mode });
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <select id={id} value={value.mode} onChange={e => setMode(e.target.value as PronounMode)} aria-label="Pronouns" className={select}>
          {(Object.keys(PRONOUN_MODE_LABELS) as PronounMode[]).map(m => <option key={m} value={m}>{PRONOUN_MODE_LABELS[m]}</option>)}
        </select>
        {value.mode === 'set' && (
          <select value={value.value ?? ''} onChange={e => onChange(sanitizePronouns({ mode: 'set', value: e.target.value }))} aria-label="Your pronouns" className={select}>
            {PRONOUN_CHOICES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )}
      </div>
      {value.mode === 'alejo' && <p className="text-xs text-gray-500">Your Twitch login is sent to pr.alejo.io to look them up; the answer is remembered for a day. Off by default.</p>}
    </div>
  );
}
