import { BrandMark } from '../admin/components/BrandMark';
import { isPasswordLoginEnabled } from '@/lib/admin-token';
import { loginConfigured } from '@/lib/session';
import { PasswordLogin } from './PasswordLogin';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

const ERRORS: Record<string, string> = {
  'not-staff': 'That Twitch account isn\'t on the staff list. Ask an admin to add you.',
  unavailable: 'Twitch sign-in isn\'t set up on this site yet.',
};

/** Staff sign-in: Twitch first; the old password is a small emergency option underneath (unless it has been switched off). */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string; out?: string }> }) {
  const { error, returnTo, out } = await searchParams;
  // Only an admin or mod page may be the destination.
  const dest = returnTo && /^\/(admin|mod)(\/|\?|$)/.test(returnTo) && !returnTo.startsWith('//') ? returnTo : '/admin';
  const twitchHref = `/auth/twitch?returnTo=${encodeURIComponent(dest)}`;
  const passwordOn = isPasswordLoginEnabled();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card rounded-3xl w-full max-w-sm overflow-hidden shadow-glow">
        <div className="holo-strip" />
        <div className="p-8 space-y-5">
          <div className="flex flex-col items-center gap-2">
            <BrandMark size={56} />
            <h1 className="text-yellow-400 font-bold text-2xl">The Cheesy TCG</h1>
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest">Staff sign-in</p>
          </div>

          {error && ERRORS[error] && <p role="alert" className="text-sm font-semibold text-red-400 text-center">{ERRORS[error]}</p>}

          {out === '1' && (
            <div role="status" className="text-sm text-center space-y-2">
              <p className="font-semibold text-gray-300">You&rsquo;re logged out of the staff panels.</p>
              <form action="/auth/logout" method="post">
                <button type="submit" className="btn btn-ghost btn-sm">Log out of the website too</button>
              </form>
            </div>
          )}

          {loginConfigured() ? (
            <a href={twitchHref} className="flex items-center justify-center gap-2 w-full rounded-xl py-3 font-bold text-white bg-[#9146ff] hover:bg-[#a36bff] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.3 3 3 6.3v13.4h4.6V22h2.6l2.3-2.3h3.7L21 14.6V3H4.3Zm14.9 10.6-2.9 2.9h-4.6l-2.3 2.3v-2.3H6.7V4.7h12.5v8.9ZM16.4 7.9v4.6h-1.7V7.9h1.7Zm-4.6 0v4.6h-1.7V7.9h1.7Z" /></svg>
              Log in with Twitch
            </a>
          ) : (
            <p className="text-sm text-gray-400 text-center">Twitch sign-in isn&rsquo;t configured (it needs SESSION_SECRET and the Twitch app keys).</p>
          )}
          <p className="text-xs text-gray-500 text-center leading-relaxed">Admins and mods sign in with the Twitch account that is on the staff list.</p>

          {passwordOn && <PasswordLogin />}
        </div>
      </div>
    </div>
  );
}
