'use client';
import { useOverlayStatus } from './OverlayStatusContext';

function ago(at: number | null, now: number): string {
  if (!at) return 'never';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/**
 * Shows whether an OBS overlay is open, and (when OBS reports it) whether the stream is live.
 * Reads the shared poller from OverlayStatusProvider.
 *  - compact: one muted line for the sidebar
 *  - full: a pill with chips, for the dashboard
 */
export function OverlayStatus({ variant = 'full' }: { variant?: 'compact' | 'full' }) {
  const { status, failed, now } = useOverlayStatus();

  // --- derive what to show ---
  let dot = 'bg-gray-600';
  let label = 'Checking overlay…';
  let detail = '';
  const chips: { text: string; tone: 'red' | 'gray' | 'amber' | 'blue' }[] = [];

  if (failed && !status) {
    label = 'Overlay status unavailable';
  } else if (status) {
    if (status.connected > 0) {
      dot = 'bg-green-400 animate-pulse';
      label = status.connected === 1 ? 'Overlay connected' : `${status.connected} overlays connected`;
      const allBrowser = status.clients.every(c => !c.obs);
      if (allBrowser) chips.push({ text: 'browser tab', tone: 'blue' });
      if (status.clients.some(c => c.dev)) chips.push({ text: 'dev', tone: 'amber' });

      if (status.streaming === true) chips.unshift({ text: '● LIVE', tone: 'red' });
      else if (status.streaming === false) chips.unshift({ text: 'not streaming', tone: 'gray' });
      if (status.recording === true) chips.push({ text: 'REC', tone: 'red' });

      detail = status.streaming === null
        ? 'Connected, but OBS isn’t sharing stream status. To detect when you’re live, set this browser source’s Page permissions to “Read access to OBS status information”.'
        : status.streaming ? 'OBS reports the stream is live.' : 'OBS reports the stream is not live.';
    } else {
      label = 'Overlay not connected';
      detail = status.lastSeen
        ? `Last heard from an overlay ${ago(status.lastSeen, now)}. Open the OBS browser source (or overlay.html) to connect.`
        : 'No overlay has connected yet. Add the overlay as an OBS browser source.';
      if (status.queued > 0) chips.push({ text: `${status.queued} waiting`, tone: 'amber' });
    }
  }

  const chipClass = (tone: string) =>
    ({
      red: 'text-red-300 bg-red-500/10 border-red-400/40',
      gray: 'text-gray-400 bg-gray-800/60 border-gray-700',
      amber: 'text-amber-300 bg-amber-500/10 border-amber-400/30',
      blue: 'text-blue-300 bg-blue-500/10 border-blue-400/30',
    } as Record<string, string>)[tone];

  const title = [label, detail].filter(Boolean).join('\n');

  if (variant === 'compact') {
    const live = status?.connected ? status.streaming === true : false;
    const sub = !status ? (failed ? 'Unavailable' : 'Checking…')
      : status.connected > 0 ? (status.streaming === true ? 'Live on stream' : status.streaming === false ? 'Not streaming' : 'Connected to OBS')
      : status.queued > 0 ? `${status.queued} waiting` : 'Open it in OBS';
    return (
      <div className="aside-item aside-card flex items-center gap-2.5 rounded-xl bg-white/3 border border-white/6 px-3 py-2" title={title}>
        <span className="relative flex w-2.5 h-2.5 shrink-0">
          <span className={`absolute inset-0 rounded-full ${live ? 'bg-red-400' : status?.connected ? 'bg-green-400' : 'bg-gray-600'}`} />
          {(live || status?.connected) && <span className={`absolute inset-0 rounded-full animate-ping opacity-60 ${live ? 'bg-red-400' : 'bg-green-400'}`} />}
        </span>
        <span className="aside-label min-w-0 leading-tight">
          <span className="block text-xs font-bold text-gray-200 truncate">{status?.connected ? (status.connected === 1 ? 'Overlay' : `${status.connected} overlays`) : 'Overlay offline'}</span>
          <span className={`block text-[11px] truncate ${live ? 'text-red-300 font-bold' : 'text-gray-500'}`}>{sub}</span>
        </span>
      </div>
    );
  }

  return (
    <div
      title={title}
      className="inline-flex flex-wrap items-center gap-2 tcg-panel rounded-xl px-3 py-1.5 text-xs font-bold text-gray-200"
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span>{label}</span>
      {chips.map(c => (
        <span key={c.text} className={`text-[10px] font-extrabold uppercase tracking-wider rounded-full px-1.5 py-px border ${chipClass(c.tone)}`}>
          {c.text}
        </span>
      ))}
      {status && status.connected === 0 && status.lastSeen && (
        <span className="text-[11px] font-medium text-gray-500">last seen {ago(status.lastSeen, now)}</span>
      )}
    </div>
  );
}
