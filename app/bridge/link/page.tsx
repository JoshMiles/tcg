import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { BrandMark } from '@/app/admin/components/BrandMark';
import { NO_ROLE_MESSAGE, readLink } from '@/lib/bridge-link';
import { getSession, loginConfigured } from '@/lib/session';
import { decideLinkAction } from './actions';

export const metadata: Metadata = { title: 'Link TCG Bridge', robots: { index: false, follow: false } };

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

const RESULTS: Record<string, { title: string; text: string; bad?: boolean }> = {
  allowed: { title: 'TCG Bridge is linked', text: 'You can close this tab and go back to TCG Bridge.' },
  denied: { title: 'Link denied', text: 'Nothing was linked. You can close this tab.' },
  'no-role': { title: 'Not allowed', text: `${NO_ROLE_MESSAGE}. Ask an admin to add you, then start again from TCG Bridge.`, bad: true },
  gone: { title: 'Link expired', text: 'This link request has expired or was already used. Start again from TCG Bridge.', bad: true },
};

function Card({ title, bad, children }: { title: string; bad?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card rounded-3xl w-full max-w-sm overflow-hidden shadow-glow">
        <div className="holo-strip" />
        <div className="p-8 space-y-5 text-center">
          <div className="flex flex-col items-center gap-2">
            <BrandMark size={56} />
            <h1 className={`font-bold text-2xl flex items-center gap-2 ${bad ? 'text-red-400' : 'text-yellow-400'}`}><Icon name="link" />{title}</h1>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

/** "Link TCG Bridge on <PC>?" (ROADMAP 58.0): the app opens this in the browser. Sign in with the site's Twitch login, check the code matches the app's, then Allow. */
export default async function BridgeLinkPage({ searchParams }: { searchParams: Promise<{ id?: string; result?: string }> }) {
  const { id = '', result } = await searchParams;
  const shown = result ? RESULTS[result] : undefined;
  if (shown) return <Card title={shown.title} bad={shown.bad}><p role="status" className="text-sm text-gray-300 leading-relaxed">{shown.text}</p></Card>;

  const req = await readLink(id);
  if (!req || req.status !== 'pending') {
    const gone = RESULTS.gone;
    return <Card title={gone.title} bad><p role="alert" className="text-sm text-gray-300 leading-relaxed">{gone.text}</p></Card>;
  }
  if (!loginConfigured()) return <Card title="Sign-in unavailable" bad><p role="alert" className="text-sm text-gray-300">Twitch sign-in isn&rsquo;t set up on this site yet.</p></Card>;
  if (!(await getSession())) redirect(`/auth/twitch?returnTo=${encodeURIComponent(`/bridge/link?id=${id}`)}`);

  return (
    <Card title="Link TCG Bridge">
      <p className="text-sm text-gray-300 leading-relaxed">Link TCG Bridge on <strong className="text-white">{req.name}</strong>?</p>
      <p className="text-sm text-gray-400">Code <strong className="font-mono text-2xl tracking-widest text-white">{req.code}</strong></p>
      <p className="text-xs text-gray-500 leading-relaxed">Only allow this if the same code shows in TCG Bridge.</p>
      <form action={decideLinkAction} className="flex gap-3">
        <input type="hidden" name="id" value={id} />
        <button type="submit" name="choice" value="allow" className="btn btn-primary flex-1 rounded-xl">Allow</button>
        <button type="submit" name="choice" value="deny" className="btn btn-ghost flex-1 rounded-xl">Deny</button>
      </form>
      <Link href="/" className="block text-xs text-gray-500 hover:text-gray-300">Back to the site</Link>
    </Card>
  );
}
