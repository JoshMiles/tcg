import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/app/components/Icon';

/** A widget's frame: a titled panel that fills its grid cell. */
export function Panel({ title, icon, action, children, flush = false }: { title: string; icon?: IconName; action?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="card rounded-2xl overflow-hidden h-full flex flex-col">
      <header className="px-5 py-3.5 border-b border-gray-800 flex items-center justify-between gap-3 shrink-0">
        <h2 className="card-title text-base text-white min-w-0">{icon && <Icon name={icon} className="text-yellow-500/90" />}<span className="truncate">{title}</span></h2>
        {action}
      </header>
      <div className={`min-h-0 flex-1 ${flush ? '' : 'px-5 py-4'}`}>{children}</div>
    </section>
  );
}

export const More = ({ href, children, external }: { href: string; children: ReactNode; external?: boolean }) => (
  <Link href={href} target={external ? '_blank' : undefined} className="text-xs text-yellow-500 hover:text-yellow-300 transition-colors shrink-0">{children}</Link>
);

export const Empty = ({ children }: { children: ReactNode }) => <p className="px-5 py-8 text-center text-sm text-gray-600">{children}</p>;
