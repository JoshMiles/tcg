import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/app/components/Icon';

export function Section({ id, title, icon, children }: { id: string; title: string; icon: IconName; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-3">
      <h2 className="font-display text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
        <span aria-hidden className="w-10 h-10 rounded-full bg-yellow-500/15 flex items-center justify-center text-xl"><Icon name={icon} className="w-5 h-5 text-yellow-400" /></span>
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export function Q({ q, open, id, children }: { q: string; open?: boolean; id?: string; children: ReactNode }) {
  return (
    <details id={id} open={open} className="group rind rounded-xl overflow-hidden">
      <summary className="flex items-center justify-between gap-4 px-4 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="font-semibold text-white">{q}</span>
        <span aria-hidden className="text-yellow-500 text-lg leading-none transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="px-4 pb-4 text-sm text-gray-300 leading-relaxed">{children}</div>
    </details>
  );
}
