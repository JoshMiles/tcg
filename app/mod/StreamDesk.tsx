'use client';
import { useEffect, useState } from 'react';
import type { OverlayStatus } from '@/lib/overlay';
import { Icon } from '@/app/components/Icon';

// TRIAL (ROADMAP 51.2, four weeks): read-only stream desk for mods. Remove it if mods do not use it during streams.
type Desk = OverlayStatus & { pullsBlocked: string | null };

export function StreamDesk() {
  const [d, setD] = useState<Desk | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    async function poll() {
      try {
        const res = await fetch('/api/admin/overlay-status', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        setD(await res.json());
        setFailed(false);
      } catch { setFailed(true); }
    }
    // Same pace as the admin status; nothing runs while the tab is hidden.
    function sync() {
      clearInterval(interval);
      if (document.visibilityState !== 'visible') return;
      poll();
      interval = setInterval(poll, 5000);
    }
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', sync); };
  }, []);

  const overlay = failed && !d ? 'Unavailable' : !d ? 'Checking' : d.connected === 0 ? 'Not connected' : d.connected === 1 ? 'Connected' : `${d.connected} connected`;
  const stream = !d || d.connected === 0 ? 'Unknown' : d.streaming === true ? 'Live' : d.streaming === false ? 'Not live' : 'Not shared by OBS';
  const pulls = !d ? 'Checking' : d.pullsBlocked ? 'Paused' : 'Accepting';
  const queue = d ? String(d.queued) : '-';

  return (
    <div role="status" className="card rounded-xl px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
      <Cell label="Overlay" value={overlay} good={d ? d.connected > 0 : null} />
      <Cell label="Stream" value={stream} good={d?.streaming ?? null} />
      <Cell label="Pulls" value={pulls} good={d ? !d.pullsBlocked : null} title={d?.pullsBlocked ?? undefined} />
      <Cell label="Pull queue" value={queue} good={null} />
    </div>
  );
}

function Cell({ label, value, good, title }: { label: string; value: string; good: boolean | null; title?: string }) {
  return (
    <div title={title}>
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="font-bold text-gray-100">
        {good !== null && <Icon name={good ? 'check' : 'x'} className={`mr-1.5 ${good ? 'text-green-400' : 'text-amber-400'}`} />}
        {value}
      </p>
    </div>
  );
}
