import type { ScoreSample } from '@/lib/score-history-core';

/** Points over time as a line (server-rendered SVG). Needs at least two samples. */
export function ScoreChart({ samples }: { samples: ScoreSample[] }) {
  if (samples.length < 2) return null;
  const min = Math.min(...samples.map(s => s.score));
  const max = Math.max(...samples.map(s => s.score));
  const span = Math.max(1, max - min);
  const t0 = samples[0].at, t1 = samples[samples.length - 1].at;
  const tspan = Math.max(1, t1 - t0);
  const pts = samples.map(s => [((s.at - t0) / tspan) * 100, 36 - ((s.score - min) / span) * 32] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const gained = samples[samples.length - 1].score - samples[0].score;
  const fmt = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <div className="space-y-2">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="w-full h-28" role="img" aria-label={`Your score from ${samples[0].score} to ${samples[samples.length - 1].score} between ${fmt(t0)} and ${fmt(t1)}`}>
        <polygon points={`0,40 ${line} 100,40`} fill="rgba(250,204,21,0.12)" />
        <polyline points={line} fill="none" stroke="#facc15" strokeWidth="0.9" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <div className="flex justify-between text-[11px] text-gray-500"><span>{fmt(t0)}</span><span className={gained >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{gained >= 0 ? '+' : '−'}{Math.abs(gained).toLocaleString()} pts since then</span><span>{fmt(t1)}</span></div>
    </div>
  );
}
