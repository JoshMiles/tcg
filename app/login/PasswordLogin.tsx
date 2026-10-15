'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/** The emergency admin password, tucked away: staff are expected to use Twitch. */
export function PasswordLogin() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const field = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    if (res.ok) {
      router.push('/admin');
    } else {
      const body = await res.json().catch(() => ({}));
      setError(res.status === 403 ? body.error ?? 'Password login is switched off.' : 'Incorrect password.');
      setLoading(false);
    }
  }

  return (
    <details className="group pt-1" onToggle={e => { if (e.currentTarget.open) field.current?.focus(); }}>
      <summary className="cursor-pointer list-none text-center text-xs text-gray-500 hover:text-gray-300">Use the admin password instead</summary>
      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <input
          ref={field} type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} aria-label="Admin password"
          className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 focus:shadow-glow transition"
        />
        {error && <p role="alert" className="text-poke-red text-sm font-semibold">{error}</p>}
        <button type="submit" disabled={loading || !password} className="w-full rounded-xl py-2.5 text-sm font-bold text-gray-200 bg-white/[0.06] border border-white/10 hover:bg-white/10 disabled:opacity-60">
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </details>
  );
}
