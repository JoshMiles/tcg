'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArmedButton } from '../components/ArmedButton';
import { removeTesterAction, setUserTesterAction } from './access-actions';

/** The Remove button on a tester row: the first click arms it, the second removes them. */
export function RemoveTesterButton({ login }: { login: string }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <ArmedButton
      onConfirm={() => start(async () => { await removeTesterAction(login); router.refresh(); })}
      className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs font-semibold text-gray-300 hover:border-red-500/50 hover:text-red-300"
      armedClassName="rounded-lg border border-red-500/60 bg-red-950/50 px-2.5 py-1 text-xs font-semibold text-red-200"
    >
      Remove
    </ArmedButton>
  );
}

/** The user page's Tester picker: none / beta / alpha. Saves on change and says what happened. */
export function UserTesterPicker({ login, current }: { login: string; current: 'none' | 'alpha' | 'beta' }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-3 text-sm text-gray-200">
        <span className="font-semibold">Tester</span>
        <select
          value={value}
          disabled={pending}
          onChange={e => {
            const next = e.target.value as 'none' | 'alpha' | 'beta';
            setValue(next);
            start(async () => { const r = await setUserTesterAction(login, next); setMsg({ ok: r.ok, text: r.message }); if (!r.ok) setValue(current); router.refresh(); });
          }}
          className="select"
        >
          <option value="none">None</option>
          <option value="beta">Beta tester</option>
          <option value="alpha">Alpha tester</option>
        </select>
      </label>
      {msg && <p role="status" className={`text-xs ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>}
    </div>
  );
}
