import { Icon } from '@/app/components/Icon';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentSandboxId, isPreview } from '@/lib/db';
import { PreviewOff } from '../../PreviewOff';
import { getSandbox } from '@/lib/sandbox';
import { listSandboxUsers } from '@/lib/sandbox-tools';
import { CHANNEL_NAME } from '@/lib/site';
import { PendingButton } from '../../../components/PendingButton';
import { enterSandboxAction } from '../../actions';
import { FakeTwitch } from './FakeTwitch';

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function FakeTwitchPage({ params }: { params: Promise<{ id: string }> }) {
  if (isPreview()) return <PreviewOff />;
  const { id } = await params;
  const sandbox = await getSandbox(id);
  if (!sandbox) notFound();
  const here = (await currentSandboxId()) === id;
  const users = here ? (await listSandboxUsers(id)).map(u => u.username) : [];

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Link href={`/admin/sandbox/${id}`} className="text-sm text-gray-500 hover:text-white">← {sandbox.name}</Link>
        <h1 className="text-3xl font-bold text-white"><Icon name="tv" className="mr-2 text-purple-300" />Fake Twitch</h1>
        <p className="text-sm text-gray-400 max-w-3xl">
          Test the Twitch extension without Twitch. This page stands in for a channel page and runs the <strong className="text-gray-200">real panel</strong> (panel, mobile and video-component views)
          with a pretend Twitch helper, against this sandbox only: log in, the share-identity prompt, upgrades with the animation, the leaderboard and logout all go through the real API routes.
          Pick who is watching from the sandbox&rsquo;s test users (add more, or seed a crowd, on the sandbox page).
        </p>
      </div>
      {here ? (
        <FakeTwitch sandboxId={id} users={users} channel={CHANNEL_NAME} />
      ) : (
        <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-6 space-y-3">
          <p className="text-sm text-gray-300">Enter this sandbox first: the panel reads and writes whichever sandbox this browser is in, so it can never touch production.</p>
          <form action={enterSandboxAction.bind(null, id)}><PendingButton pendingLabel="Entering…" className="btn btn-primary px-4 py-2 text-sm rounded-xl">Enter {sandbox.name}</PendingButton></form>
        </div>
      )}
    </div>
  );
}
