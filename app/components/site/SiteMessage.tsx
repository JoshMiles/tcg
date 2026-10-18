import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/app/components/Icon';

/** A centred message block for the public site: empty states, "not found" and errors. */
export function SiteMessage({ icon, title, children, actions, tone = 'yellow' }: { icon: IconName; title: string; children?: ReactNode; actions?: ReactNode; tone?: 'yellow' | 'red' }) {
  const ring = tone === 'red' ? 'bg-red-500/10 border-red-400/30 text-red-300' : 'bg-yellow-500/10 border-yellow-400/30 text-yellow-300';
  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
      <span className={`mx-auto w-16 h-16 rounded-3xl border flex items-center justify-center ${ring}`}><Icon name={icon} className="w-8 h-8" /></span>
      <h1 className="font-display text-3xl font-bold text-white">{title}</h1>
      {children && <div className="text-sm text-gray-400 leading-relaxed">{children}</div>}
      {actions && <div className="flex flex-wrap justify-center gap-2 pt-1">{actions}</div>}
    </div>
  );
}

const Bar = ({ className = '' }: { className?: string }) => <div className={`rounded-lg bg-white/5 animate-pulse ${className}`} />;

/** What a public page shows while its data loads: roughly a header and a few cards, so nothing jumps when the page arrives. */
export function SiteSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6" role="status" aria-label="Loading">
      <div className="space-y-2"><Bar className="h-9 w-64" /><Bar className="h-4 w-96 max-w-full" /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[0, 1, 2, 3].map(i => <Bar key={i} className="h-20 rounded-xl" />)}</div>
      <div className="space-y-2">{[0, 1, 2, 3, 4].map(i => <Bar key={i} className="h-16 rounded-xl" />)}</div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
