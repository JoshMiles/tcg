import { PendingButton } from '@/app/components/PendingButton';
import { AdminNav } from './components/AdminNav';
import { AdminKeyboard, PaletteButton } from './components/AdminKeyboard';
import { AdminShell } from './components/AdminShell';
import { BrandMark } from './components/BrandMark';
import { BuildBadge } from './components/BuildBadge';
import { OverlayStatus } from './components/OverlayStatus';
import { OverlayStatusProvider } from './components/OverlayStatusContext';
import { CopyUrlButton } from './components/copy-url-button';
import { Icon } from '@/app/components/Icon';
import { SandboxPill } from '@/app/components/SandboxPill';
import { UpdatePrompt } from '@/app/components/UpdatePrompt';
import { getBuildInfo } from '@/lib/version';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { countNewFeedback } from '@/lib/feedback';
import { getStaff } from '@/lib/staff-guard';
import { ROLE_LABELS, roleCan } from '@/lib/staff-core';
import { getOverlayKey, overlayUrl } from '@/lib/overlay-key';
import { SITE_URL } from '@/lib/site';
import { adminSiteText, getSiteLabel } from '@/lib/site-label';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The middleware already turned strangers away from the cookie alone; this re-checks the live staff list (a removed or demoted
  // person with an unexpired cookie stops here).
  const staff = await getStaff();
  if (!staff || !roleCan(staff.role, 'admin')) redirect(staff ? '/mod' : '/login?error=not-staff');
  const overlayKey = await getOverlayKey().catch(() => '');
  const build = getBuildInfo();
  const siteText = adminSiteText(await getSiteLabel());
  return (
    <OverlayStatusProvider>
      <AdminShell
        brand={
          <Link href="/admin" aria-label="The Cheesy TCG, dashboard" className="flex items-center gap-3 min-w-0 rounded-lg text-inherit no-underline">
            <BrandMark />
            <div className="aside-label min-w-0">
              <p className="font-display text-yellow-400 font-bold text-lg leading-none tracking-tight">The Cheesy TCG</p>
              <p className="text-gray-500 text-[10px] mt-1.5 font-bold uppercase tracking-[0.18em]">Card Manager</p>
            </div>
          </Link>
        }
        nav={<><div className="px-3 pt-1"><PaletteButton /></div><AdminNav badges={{ '/admin/feedback': await countNewFeedback().catch(() => 0) }} /></>}
        status={<OverlayStatus variant="compact" />}
        footer={
          <>
            <div className="aside-stack flex items-stretch gap-1.5">
              <CopyUrlButton url={overlayUrl(SITE_URL, overlayKey)} />
              <a
                href="/overlay.html"
                target="_blank"
                title="Preview the overlay in a new tab"
                className="aside-item flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-white/4 hover:bg-white/9 text-gray-300 hover:text-white text-xs font-semibold transition-colors"
              >
                <Icon name="external" /><span className="aside-label truncate">Preview</span>
              </a>
            </div>
            <div className="aside-stack flex items-stretch gap-1.5">
              <a
                href="/"
                title="Back to the public site"
                className="aside-item flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-white/4 hover:bg-white/9 text-gray-300 hover:text-white text-xs font-semibold transition-colors"
              >
                <Icon name="home" /><span className="aside-label truncate">Public site</span>
              </a>
              <a
                href="/mod"
                title="Open the mod panel"
                className="aside-item flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg bg-white/4 hover:bg-white/9 text-gray-300 hover:text-white text-xs font-semibold transition-colors"
              >
                <Icon name="shield" /><span className="aside-label truncate">Mod view</span>
              </a>
            </div>
            <div className="aside-stack flex items-center gap-2 pt-2.5 border-t border-white/6">
              <div className="aside-item flex items-center gap-2.5 min-w-0 flex-1">
                <span className="w-8 h-8 rounded-full bg-linear-to-br from-yellow-400/30 to-yellow-600/10 border border-yellow-400/30 text-yellow-200 flex items-center justify-center shrink-0" aria-hidden><Icon name="user" /></span>
                <div className="aside-label min-w-0 leading-tight">
                  <p className="text-xs font-bold text-gray-200 truncate">{staff.displayName}</p>
                  <p className="text-[10px] text-gray-500 truncate">{ROLE_LABELS[staff.role]}{staff.via === 'password' ? ' (password)' : ''}</p>
                </div>
              </div>
              <form action="/api/auth/logout" method="POST" className="aside-label">
                <PendingButton title="Log out" aria-label="Log out" className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-red-300 hover:bg-red-500/10 transition-colors">
                  <Icon name="logout" />
                </PendingButton>
              </form>
            </div>
            <div className="aside-label flex justify-center"><BuildBadge /></div>
          </>
        }
      >
        <SandboxPill />
        <UpdatePrompt commit={build.commit} env={build.env} />
        {siteText && <p className="fixed bottom-2 right-3 z-30 rounded-full border border-purple-400/40 bg-purple-950/80 px-2.5 py-1 text-[11px] font-semibold text-purple-200" role="status">Site: {siteText}</p>}
        <AdminKeyboard overlayKey={overlayKey} />
        {children}
      </AdminShell>
    </OverlayStatusProvider>
  );
}
