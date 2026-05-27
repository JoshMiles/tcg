'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-700 rounded-xl p-8 w-80 space-y-4">
        <h1 className="text-yellow-400 font-bold text-xl text-center">🃏 TCG Admin</h1>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
          autoFocus
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-gray-950 font-bold rounded-lg py-2 transition-colors"
        >
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
