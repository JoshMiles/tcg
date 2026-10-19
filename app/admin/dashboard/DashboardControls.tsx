'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Icon } from '@/app/components/Icon';
import { Spinner } from '../components/PendingButton';

const RANGES = [['24h', '24 hours'], ['7d', '7 days'], ['season', 'Season']] as const;

/** Season and time-range pickers for the dashboard; the choice lives in the URL (?season=&range=) so it can be shared and survives a refresh. */
export function DashboardControls({ seasons, seasonId, range }: { seasons: { id: string; name: string; active: boolean }[]; seasonId: string; range: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const go = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) next.set(k, v);
    startTransition(() => router.push(`/admin?${next.toString()}`));
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {seasons.length > 1 && (
        <label className="flex items-center gap-2 text-xs text-gray-500">
          <Icon name="calendar" />
          <span className="sr-only">Season</span>
          <select value={seasonId} onChange={e => go({ season: e.target.value })} className="select select-sm">
            {seasons.map(s => <option key={s.id} value={s.id}>{s.name}{s.active ? ' (active)' : ''}</option>)}
          </select>
        </label>
      )}
      <div role="group" aria-label="Time range" className="flex rounded-lg border border-gray-700 overflow-hidden">
        {RANGES.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={range === id} onClick={() => go({ range: id })} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${range === id ? 'bg-yellow-500/15 text-yellow-300' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>{label}</button>
        ))}
      </div>
      {pending && <Spinner />}
    </div>
  );
}
