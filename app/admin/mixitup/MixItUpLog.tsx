import type { MixItUpLogEntry } from '@/lib/mixitup';

/** Mix It Up → Log: the last requests to and refusals for Mix It Up. */
export function MixItUpLog({ log }: { log: MixItUpLogEntry[] }) {
  return (
  <section className="card tcg-panel rounded-2xl overflow-hidden">
    <div className="px-6 py-5 border-b border-gray-800">
      <h2 className="font-semibold text-white">Recent requests</h2>
      <p className="text-xs text-gray-500 mt-0.5">The last 20 calls to and refusals for Mix It Up, and the last 20 chat commands. A <em>revoked</em> line is a pull taken back; refund that viewer by hand if Mix It Up did take the currency.</p>
    </div>
    {log.length === 0 ? <p className="px-6 py-5 text-sm text-gray-500">Nothing yet.</p> : (
      <ul className="divide-y divide-gray-800/70 text-sm">
        {log.map((e, i) => (
          <li key={i} className="px-6 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${e.ok ? 'text-emerald-300' : 'text-red-300'}`}>{e.what}</span>
            <span className="font-semibold text-white">{e.username}</span>
            <span className="text-gray-400 min-w-0 wrap-break-word">{e.detail}</span>
            <time className="ml-auto text-xs text-gray-600 tabular-nums" dateTime={new Date(e.at).toISOString()}>{new Date(e.at).toISOString().replace('T', ' ').slice(0, 19)} UTC</time>
          </li>
        ))}
      </ul>
    )}
  </section>
  );
}
