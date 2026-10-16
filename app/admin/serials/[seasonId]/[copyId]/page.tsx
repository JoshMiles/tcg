import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/app/components/Icon';
import { UserInput } from '@/app/components/UserInput';
import { CardTile } from '@/app/components/CardTile';
import { getPackCards, getPacksForSeason, getSeason } from '@/lib/kv';
import { getCopy, mintedCounts } from '@/lib/serials';
import { EVENT_LABELS, ORIGIN_LABELS, entryOf, isEscrow, parseCopyId } from '@/lib/serials-core';
import { getRarity } from '@/lib/rarity';
import { VARIANT_LABELS } from '@/lib/variants';
import { getPotw } from '@/lib/print-of-week-store';
import { ConfirmButton } from '../../../components/ConfirmButton';
import { PendingButton } from '../../../components/PendingButton';
import { Chip, PageHeader, Panel } from '../../../components/ui';
import { featurePrintAction, removeCopyAction, transferCopyAction } from '../../../serial-actions';

// The tab names the copy (its id is card.version.serial), so several open copies can be told apart.
export async function generateMetadata({ params }: { params: Promise<{ seasonId: string; copyId: string }> }) {
  return { title: `Print ${(await params).copyId} · Admin`, robots: { index: false } };
}
export const dynamic = 'force-dynamic';

const when = (t: number) => `${new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;
const field = 'rounded-lg bg-gray-950 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-yellow-500';

export default async function AdminCopyPage({ params, searchParams }: { params: Promise<{ seasonId: string; copyId: string }>; searchParams: Promise<{ done?: string; err?: string }> }) {
  const { seasonId: rawSeason, copyId } = await params;
  const sp = await searchParams;
  const seasonId = decodeURIComponent(rawSeason);
  const parsed = parseCopyId(copyId);
  const season = await getSeason(seasonId);
  if (!parsed || !season) notFound();
  const copy = await getCopy(season.collectionName, copyId);
  if (!copy) notFound();

  const packs = await getPacksForSeason(season);
  let card, pack;
  for (const p of packs) { const found = (await getPackCards(p.id)).find(x => x.number === copy.card); if (found) { card = found; pack = p; break; } }
  const made = (await mintedCounts(season.collectionName)).get(entryOf(copy)) ?? copy.n;
  const art = card && (copy.variant === 'full' || copy.variant === 'shiny') && card.fullArtImageUrl ? card.fullArtImageUrl : card?.imageUrl;
  const rarity = card ? getRarity(card.stars) : null;
  const label = `${copy.variant === 'regular' ? '' : `${VARIANT_LABELS[copy.variant]} `}${card?.name ?? `Card #${copy.card}`}`;
  const retired = !copy.owner;
  const inOffer = !!copy.owner && isEscrow(copy.owner);
  const user = (name?: string) => !name ? null : isEscrow(name) ? <span className="text-amber-300">a trade offer ({name.slice(7)})</span> : <Link href={`/admin/users/${encodeURIComponent(name)}`} className="text-yellow-300 hover:text-yellow-200 font-bold">@{name}</Link>;
  const potw = await getPotw();
  const isFeatured = potw?.uid === copy.uid && !!copy.uid;
  const here = (id: string) => `/admin/serials/${encodeURIComponent(season.id)}/${id}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={<>{label} <span className="text-yellow-400 tabular-nums">#{copy.n}</span>{copy.uid ? <span className="ml-3 text-base text-gray-400 tabular-nums">Print #{copy.uid}</span> : null}</>}
        icon="cheese"
        subtitle={`${season.name}${pack ? ` · ${pack.name}` : ''} · ${made.toLocaleString()} ${VARIANT_LABELS[copy.variant]} made`}
        back={{ href: `/admin/serials?season=${encodeURIComponent(season.id)}&card=${copy.card}&variant=${copy.variant}`, label: 'Prints' }}
        actions={<Link href={`/copy/${encodeURIComponent(season.id)}/${copy.id}`} className="px-3 py-2 text-sm font-semibold rounded-xl border border-gray-700 text-gray-300 hover:text-white">Public page ↗</Link>}
      />

      {sp.done && <p role="status" className="rounded-xl border border-green-500/30 bg-green-950/30 text-green-300 px-4 py-2.5 text-sm"><Icon name="check" className="mr-1.5" />{sp.done}</p>}
      {sp.err && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-950/30 text-red-300 px-4 py-2.5 text-sm"><Icon name="warning" className="mr-1.5" />{sp.err}</p>}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr] items-start">
        {art && (
          <CardTile imageUrl={art} alt={label} className="relative aspect-[2/3] w-full max-w-[260px] rounded-xl overflow-hidden border-2 bg-gray-900" style={{ borderColor: rarity?.hex, boxShadow: `0 0 28px -6px ${rarity?.hex}` }} />
        )}
        <div className="space-y-6 min-w-0">
          <Panel title="Details" icon="info">
            <dl className="grid grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
              <div><dt className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Print id</dt><dd className="font-mono text-gray-200">{copy.id}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{retired ? 'Status' : 'Held by'}</dt><dd className="text-gray-200">{retired ? <Chip tone="gray">retired</Chip> : user(copy.owner)}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Created</dt><dd className="text-gray-200">{when(copy.at)}</dd></div>
              <div><dt className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Origin</dt><dd className="text-gray-200">{ORIGIN_LABELS[copy.origin]}{copy.est && <> <Chip tone="amber">estimated number</Chip></>}</dd></div>
            </dl>
            {copy.madeFrom && copy.madeFrom.length > 0 && (
              <p className="text-sm text-gray-400">Made by spending {copy.madeFrom.map((id, i) => <span key={id}>{i > 0 && ', '}<Link href={here(id)} className="text-yellow-300 hover:text-yellow-200 tabular-nums">#{id.split('.')[2]}</Link></span>)}.</p>
            )}
          </Panel>

          <Panel title="Actions" icon="wrench" hint="These change the holder's collection and this print's history together. Neither works while the print sits in an open trade offer.">
            {retired ? (
              <p className="text-sm text-gray-500">This print no longer exists, so there is nothing to do with it. Its history is below.</p>
            ) : inOffer ? (
              <p className="text-sm text-amber-200">It is held by an open trade offer. Cancel the offer from <Link href="/admin/trades" className="underline">Trades</Link> and it comes back to its owner, then you can act on it.</p>
            ) : (
              <div className="space-y-5">
                <form action={transferCopyAction.bind(null, season.id, copy.id)} className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-gray-500 space-y-1">Give to another viewer
                    <UserInput name="to" required placeholder="their Twitch username" wrapperClassName="relative block" className={`${field} block w-56`} />
                  </label>
                  <ConfirmButton
                    title="Give this print away?"
                    confirmLabel="Give it"
                    tone="primary"
                    message={<>This moves the print, with any edition bonus it earns, from <strong className="text-white">@{copy.owner}</strong> to the viewer you typed. It is logged as an admin transfer in the print&rsquo;s history. If nobody has used that name yet, it becomes a new account, so check the spelling.</>}
                    className="px-4 py-2 text-sm font-bold rounded-lg border border-gray-600 text-gray-100 hover:border-yellow-500/60"
                  >
                    <Icon name="send" className="mr-1.5" />Give
                  </ConfirmButton>
                </form>
                <form action={featurePrintAction.bind(null, season.id, copy.id)} className="flex flex-wrap items-center gap-3">
                  <PendingButton type="submit" disabled={isFeatured || !copy.uid} className="px-4 py-2 text-sm font-bold rounded-lg border border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/10 disabled:opacity-50">
                    <Icon name="sparkles" className="mr-1.5" />Feature as print of the week
                  </PendingButton>
                  <span className="text-xs text-gray-500">{isFeatured ? 'It is the print of the week now.' : 'Shows it on the home page in place of the current pick.'}</span>
                </form>
                <form action={removeCopyAction.bind(null, season.id, copy.id)}>
                  <ConfirmButton
                    title={`Remove ${label} #${copy.n}?`}
                    confirmLabel="Remove it"
                    message={<>This takes the print out of <strong className="text-white">@{copy.owner}</strong>&rsquo;s collection for good. Its number is never reused, and its history stays here.</>}
                    className="px-4 py-2 text-sm font-bold rounded-lg border border-red-500/40 text-red-300 hover:bg-red-950/40"
                  >
                    <Icon name="trash" className="mr-1.5" />Remove from {copy.owner}&rsquo;s collection
                  </ConfirmButton>
                </form>
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="History" icon="history">
        <ol className="space-y-3 border-l border-gray-800 pl-5">
          {copy.ev.map((e, i) => (
            <li key={i} className="relative text-sm">
              <span className="absolute -left-[26px] top-1.5 h-2 w-2 rounded-full bg-yellow-400" />
              <p className="text-gray-200">
                {e.type === 'minted' && <>Created{e.who ? <> for {user(e.who)}</> : null}</>}
                {e.type === 'traded' && <>Moved from {user(e.who)} to {user(e.to)}{e.note ? <span className="text-gray-500"> · {e.note}</span> : null}</>}
                {e.type === 'escrowed' && <>Put up in a trade offer by {user(e.who)}</>}
                {e.type === 'returned' && <>Came back to {user(e.who)} from a trade offer</>}
                {e.type === 'upgraded' && <>Spent by {user(e.who)} in an upgrade{e.note ? <> into <Link href={here(e.note)} className="text-yellow-300 hover:text-yellow-200">{e.note}</Link></> : null}</>}
                {e.type === 'removed' && <>Removed from {user(e.who)}&rsquo;s collection{e.note ? <span className="text-gray-500"> · {e.note}</span> : null}</>}
                {!['minted', 'traded', 'escrowed', 'returned', 'upgraded', 'removed'].includes(e.type) && EVENT_LABELS[e.type]}
              </p>
              <p className="text-xs text-gray-500">{when(e.t)}</p>
            </li>
          ))}
        </ol>
        {copy.ev.length >= 40 && <p className="text-xs text-gray-600">Only the most recent events are kept.</p>}
      </Panel>
    </div>
  );
}
