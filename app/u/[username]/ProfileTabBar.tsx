import Link from 'next/link';
import { TabFace, TabStrip } from '@/app/components/site/TabStrip';
import { Icon } from '@/app/components/Icon';
import { PROFILE_TABS, profileHref, type ProfileTab } from '@/lib/profile-url';

/** The profile's tab strip: plain links (`?tab=`), so each tab has an address you can share and the back button works. */
export function ProfileTabBar({ username, active, counts, isOwner = false }: { username: string; active: ProfileTab; isOwner?: boolean; counts?: Partial<Record<ProfileTab, number>> }) {
  return (
    <TabStrip label="Profile sections">
      {PROFILE_TABS.filter(t => !t.ownerOnly || isOwner).map(t => (
        <Link
          key={t.id} href={profileHref(username, t.id)} scroll={false} aria-current={t.id === active ? 'page' : undefined}
          className={`flex items-center gap-1.5 px-4 py-2.5 max-md:py-3 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${t.id === active ? 'border-yellow-500 text-yellow-300' : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'}`}
        >
          <TabFace><Icon name={t.icon} />{t.label}</TabFace>
          {counts?.[t.id] ? <span className={`text-[11px] tabular-nums rounded-full px-1.5 py-px ${t.id === active ? 'bg-yellow-500/15 text-yellow-300' : 'bg-gray-800 text-gray-400'}`}>{counts[t.id]}</span> : null}
        </Link>
      ))}
    </TabStrip>
  );
}
