import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { BrandMark } from '../admin/components/BrandMark';
import { PendingButton } from '@/app/components/PendingButton';
import { getStaff } from '@/lib/staff-guard';
import { ROLE_LABELS, roleCan } from '@/lib/staff-core';
import { ModNav } from './ModNav';
import { countNewFeedback } from '@/lib/feedback';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/** The mod panel's frame: a slim top bar (mods get overview, activity, viewers, trades, feedback, guide, testers and what's new). Re-checks the live staff list on every load. */
export default async function ModLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaff();
  if (!staff || !roleCan(staff.role, 'mod')) redirect('/login?error=not-staff');

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-white/6 bg-gray-950/90 backdrop-blur-sm">
        {/* On phones the nav drops to its own row so it and the right-hand links both fit. */}
        <div className="max-w-7xl mx-auto px-4 sm:h-14 py-2 sm:py-0 flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-2">
          <Link href="/mod" className="flex items-center gap-2.5 shrink-0">
            <BrandMark size={28} />
            <span className="leading-none">
              <span className="block font-display text-yellow-400 font-bold">The Cheesy TCG</span>
              <span className="block text-[9px] text-gray-500 font-bold uppercase tracking-[0.18em] mt-0.5">Mod panel</span>
            </span>
          </Link>
          <ModNav newFeedback={await countNewFeedback().catch(() => 0)} />
          <div className="ml-auto flex items-center gap-3 shrink-0">
            {/* Back to the site viewers see (staff are signed in as viewers too, so nothing changes about their login). */}
            <Link href="/" title="Back to the public site" aria-label="Back to the public site" className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-white"><Icon name="home" /><span className="hidden sm:inline">Public site</span></Link>
            {roleCan(staff.role, 'admin') && (
              <Link href="/admin" title="Admin panel" aria-label="Admin panel" className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-300 hover:text-white"><Icon name="settings" /><span className="hidden sm:inline">Admin panel</span></Link>
            )}
            <div className="text-right leading-tight hidden sm:block">
              <p className="text-xs font-bold text-gray-200 truncate max-w-40">{staff.displayName}</p>
              <p className="text-[10px] text-gray-500">{ROLE_LABELS[staff.role]}</p>
            </div>
            <form action="/api/auth/logout" method="POST">
              <PendingButton title="Log out" aria-label="Log out" className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-300 hover:bg-red-500/10 transition-colors">
                <Icon name="logout" />
              </PendingButton>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
