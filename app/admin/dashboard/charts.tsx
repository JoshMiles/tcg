import type { ReactNode } from 'react';

/** A tiny line chart with a filled area, for a row of numbers. */
export function Sparkline({ values, className = '', stroke = '#eab308' }: { values: number[]; className?: string; stroke?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const w = 100;
  const h = 28;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - (v / max) * (h - 4)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`w-full h-7 ${className}`} aria-hidden>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={stroke} opacity="0.14" />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export interface BarLayer { label: string; color: string; values: number[] }

/** Stacked columns, one per time bucket, with a tooltip each and a few axis labels. */
export function StackedBars({ layers, labels, height = 150 }: { layers: BarLayer[]; labels: string[]; height?: number }) {
  const n = labels.length;
  const totals = labels.map((_, i) => layers.reduce((s, l) => s + (l.values[i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const ticks = [0, Math.floor((n - 1) / 2), n - 1];
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height }} role="img" aria-label="Pulls per period">
        {labels.map((label, i) => (
          <div key={i} className="group relative flex-1 min-w-0 h-full flex flex-col-reverse justify-start" title={`${label}: ${totals[i]}`}>
            {totals[i] === 0 ? <div className="w-full h-px bg-gray-800" /> : layers.map(l => {
              const v = l.values[i] ?? 0;
              return v > 0 ? <div key={l.label} style={{ height: `${(v / max) * 100}%`, background: l.color }} className="w-full first:rounded-b-[2px] last:rounded-t-[2px]" /> : null;
            })}
          </div>
        ))}
      </div>
      <div className="relative mt-1.5 h-4 text-[10px] text-gray-600">
        {ticks.map((t, k) => (
          <span key={k} className="absolute" style={{ left: `${((t + 0.5) / n) * 100}%`, transform: 'translateX(-50%)' }}>{labels[t]}</span>
        ))}
      </div>
    </div>
  );
}

/** "+12%" / "-4%" against the previous period, or nothing when there is nothing to compare. */
export function Delta({ now, prev, className = '' }: { now: number; prev: number; className?: string }): ReactNode {
  if (prev <= 0 && now <= 0) return null;
  if (prev <= 0) return <span className={`text-[11px] font-semibold text-emerald-300 ${className}`}>new</span>;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return <span className={`text-[11px] text-gray-500 ${className}`}>no change</span>;
  return <span className={`text-[11px] font-semibold ${pct > 0 ? 'text-emerald-300' : 'text-red-300'} ${className}`}>{pct > 0 ? '+' : ''}{pct}%</span>;
}
