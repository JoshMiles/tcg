'use client';
import { Icon } from '@/app/components/Icon';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_GROUPS, isActive } from '@/lib/admin-nav';

// The pages come from lib/admin-nav.ts, which the command palette and the "g then a letter" shortcuts share.
export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="flex-1 min-h-0 px-3 pt-3 pb-2 overflow-y-auto">
      {NAV_GROUPS.map((g, gi) => (
        <div key={g.title} className={gi > 0 ? 'mt-4' : ''}>
          <p className="aside-label px-3 pb-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-gray-600">{g.title}</p>
          {gi > 0 && <div className="aside-rule" aria-hidden />}
          <ul className="space-y-0.5">
            {g.items.map(item => {
              const active = isActive(item, pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={`${item.label}  (g then ${item.key})`}
                    aria-current={active ? 'page' : undefined}
                    className={`aside-item group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                      active ? 'bg-yellow-500/10 text-yellow-200' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {active && <span aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.6)]" />}
                    <Icon name={item.icon} className={`w-[1.15rem] h-[1.15rem] shrink-0 transition-colors ${active ? 'text-yellow-400' : 'text-gray-500 group-hover:text-gray-300'}`} />
                    <span className="aside-label truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
