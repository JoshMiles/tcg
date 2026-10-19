import Link from 'next/link';
import { Icon, type IconName } from '@/app/components/Icon';

export type PageTab = { id: string; label: string; icon?: IconName; count?: number | string; hint?: string };

/**
 * Server-rendered tab bar driven by `?tab=`. Each tab is a plain link, so there is no client state and the
 * address bar always says where you are. `keep` carries other query params across tabs (e.g. ?season=).
 */
export function PageTabs({ tabs, active, base, keep, label = 'Page sections' }: {
  tabs: readonly PageTab[]; active: string; base: string; keep?: Record<string, string | undefined>; label?: string;
}) {
  const href = (id: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(keep ?? {})) if (v) q.set(k, v);
    q.set('tab', id);
    return `${base}?${q.toString()}`;
  };
  return (
    <nav aria-label={label} className="tabs tabs-border no-scrollbar w-full flex-nowrap overflow-x-auto overflow-y-hidden border-b border-gray-800">
      {tabs.map(t => (
        <Link
          key={t.id}
          href={href(t.id)}
          scroll={false}
          aria-current={t.id === active ? 'page' : undefined}
          className={`tab gap-1.5 font-semibold whitespace-nowrap ${t.id === active ? 'tab-active text-yellow-300' : ''}`}
        >
          {t.icon && <Icon name={t.icon} />}{t.label}
          {t.count !== undefined && <span className={`text-[11px] tabular-nums rounded-full px-1.5 py-px ${t.id === active ? 'bg-yellow-500/15 text-yellow-300' : 'bg-gray-800 text-gray-400'}`}>{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Resolve `?tab=` to a known tab id, falling back to the first. */
export function pickTab<T extends string>(tabs: readonly { id: T }[], raw: string | undefined): T {
  return tabs.find(t => t.id === raw)?.id ?? tabs[0].id;
}
