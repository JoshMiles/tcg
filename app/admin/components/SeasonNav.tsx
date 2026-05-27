'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Pack } from '@/lib/types';

export function SeasonNav({ seasonId, seasonName, packs }: { seasonId: string; seasonName: string; packs: Pack[] }) {
  const pathname = usePathname();

  const link = (href: string, label: React.ReactNode, exact = false) => {
    const active = exact ? pathname === href : pathname.startsWith(href);
    return (
      <Link
        href={href}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors truncate ${
          active ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="space-y-1">
      <div className="px-3 pb-2 mb-1 border-b border-gray-800">
        <Link href="/admin/seasons" className="text-xs text-gray-600 hover:text-gray-400">
          ← All Seasons
        </Link>
        <p className="text-sm font-semibold text-white mt-1 truncate">{seasonName}</p>
      </div>

      {link(`/admin/seasons/${seasonId}`, 'Season Settings', true)}

      <div className="pt-2">
        <p className="text-xs text-gray-600 uppercase tracking-wide px-3 mb-1">Packs</p>
        {packs.length === 0 && (
          <p className="px-3 py-1 text-xs text-gray-600">No packs yet</p>
        )}
        {packs.map(pack => {
          const href = `/admin/seasons/${seasonId}/packs/${pack.id}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={pack.id}
              href={href}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                active ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <span className="truncate flex-1">{pack.name}</span>
              {!pack.active && <span className="text-xs text-gray-600 shrink-0">off</span>}
            </Link>
          );
        })}
        {link(
          `/admin/seasons/${seasonId}/packs/new`,
          '+ New Pack',
          true,
        )}
      </div>
    </nav>
  );
}
