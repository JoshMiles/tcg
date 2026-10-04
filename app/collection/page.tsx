import { redirect } from 'next/navigation';

export default function CollectionLanding() {
  async function goToCollection(formData: FormData) {
    'use server';
    const username = (formData.get('username') as string).trim().toLowerCase();
    if (username) redirect(`/collection/${username}`);
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <div className="text-4xl mb-3">🃏</div>
          <h1 className="text-2xl font-bold text-white">TCG Collection</h1>
          <p className="text-gray-500 text-sm mt-1">Enter your Twitch username to view your cards</p>
        </div>
        <form action={goToCollection} className="flex gap-2">
          <input
            name="username"
            type="text"
            placeholder="your_username"
            autoComplete="off"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500 transition-colors text-sm"
          />
          <button
            type="submit"
            className="px-5 py-3 tcg-btn rounded-xl text-sm transition-colors shrink-0"
          >
            Go →
          </button>
        </form>
      </div>
    </div>
  );
}
