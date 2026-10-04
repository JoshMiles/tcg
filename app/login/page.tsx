'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandMark } from '../admin/components/BrandMark';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push('/admin');
    } else {
      setError('Incorrect password.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="tcg-panel rounded-3xl w-full max-w-sm overflow-hidden shadow-glow">
        <div className="holo-strip" />
        <div className="p-8 space-y-5">
          <div className="flex flex-col items-center gap-2">
            <BrandMark size={56} />
            <h1 className="text-yellow-400 font-bold text-2xl">TCG Admin</h1>
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest">Trainer sign-in</p>
          </div>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 focus:shadow-glow transition"
            autoFocus
          />
          {error && <p className="text-poke-red text-sm font-semibold">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="tcg-btn w-full rounded-xl py-3"
          >
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </div>
      </form>
    </div>
  );
}
