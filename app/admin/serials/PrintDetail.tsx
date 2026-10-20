import Link from 'next/link';
import { Icon } from '@/app/components/Icon';
import { UserInput } from '@/app/components/UserInput';
import { CardTile } from '@/app/components/CardTile';
import { FlipCard } from '@/app/components/FlipCard';
import { cardBackFor } from '@/lib/card-back-store';
import { engravedDate, flipBackFor, histText } from '@/lib/flip-back';
import { getPackCards, getPacksForSeason, getSeason } from '@/lib/kv';
import { getRarity } from '@/lib/rarity';
import { mintedCounts } from '@/lib/serials';
import { SITE_URL } from '@/lib/site';
import { entryOf } from '@/lib/serials-core';
import { EVENT_LABELS, ORIGIN_LABELS, isEscrow, type Copy } from '@/lib/serials-core';
import { getPotw } from '@/lib/print-of-week-store';
import { usesFullArt } from '@/lib/variants';
import { ConfirmButton } from '../components/ConfirmButton';
import { PendingButton } from '../components/PendingButton';
import { Chip, Panel } from '../components/ui';
import { featurePrintAction, removeCopyAction, transferCopyAction } from '../serial-actions';

const when = (t: number) => `${new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC`;
const field = 'input';

/**
 * One print's details, actions and history. Shared by the edition's own page (/admin/serials/<season>/<copy>) and the Prints list's
 * side panel. In the panel `ret` is the list address the actions come back to (and `hrefFor` keeps links to other editions inside
 * the list); on the page both are left out.
 */
export async function PrintDetail({ seasonId, copy, label, ret, hrefFor }: { seasonId: string; copy: Copy; label: string; ret?: string; hrefFor: (copyId: string) => string }) {
  const retired = !copy.owner;
  const inOffer = !!copy.owner && isEscrow(copy.owner);
  const user = (name?: string) => !name ? null : isEscrow(name) ? <span className="text-amber-300">a trade offer ({name.slice(7)})</span> : <Link href={`/admin/users/${encodeURIComponent(name)}`} className="text-yellow-300 hover:text-yellow-200 font-bold">@{name}</Link>;
  const potw = await getPotw();
  const isFeatured = potw?.uid === copy.uid && !!copy.uid;
  const hidden = ret ? <input type="hidden" name="ret" value={ret} /> : null;

  // The edition as a viewer sees it: the card, and its back with the pack's design (staff see the real holder and every history line).
  const season = await getSeason(seasonId);
  let found: { card: Awaited<ReturnType<typeof getPackCards>>[number]; pack: Awaited<ReturnType<typeof getPacksForSeason>>[number] } | null = null;
  if (season) for (const pk of await getPacksForSeason(season)) { const c = (await getPackCards(pk.id)).find(x => x.number === copy.card); if (c) { found = { card: c, pack: pk }; break; } }
  const rarity = found ? getRarity(found.card.stars) : null;
  const art = found && usesFullArt(copy.variant) && found.card.fullArtImageUrl ? found.card.fullArtImageUrl : found?.card.imageUrl;
  const total = season ? (await mintedCounts(season.collectionName)).get(entryOf(copy)) ?? copy.n : copy.n;
  const back = found && season ? flipBackFor({
    n: copy.n, uid: copy.uid, total, variant: copy.variant, name: found.card.name, at: copy.at, est: copy.est, hex: rarity?.hex, origin: ORIGIN_LABELS[copy.origin],
    holder: !copy.owner ? null : isEscrow(copy.owner) ? 'a trade offer' : `@${copy.owner}`,
    history: copy.ev.slice(-3).map(e => ({ text: histText(e, new Set<string>(), copy.origin), date: engravedDate(e.t) })),
    qrUrl: `${SITE_URL}/copy/${encodeURIComponent(season.id)}/${copy.id}`,
  }, await cardBackFor(found.pack, season.name)) : null;

  return (
    <div className="space-y-6">
      {back && art && (
        <Panel title="The edition" icon="cheese" hint="Tap the card to turn it over: the back is the pack's design, as players see it.">
          <div className="mx-auto w-full max-w-[220px]">
            <FlipCard back={back}>
              <CardTile imageUrl={art} alt={label} className={`relative aspect-2/3 rounded-xl overflow-hidden border-2 ${copy.variant !== 'regular' ? `vfx-${copy.variant}` : ''}`} style={{ borderColor: rarity?.hex, boxShadow: `0 0 24px -6px ${rarity?.hex}` }} />
            </FlipCard>
          </div>
        </Panel>
      )}
      <Panel title="Details" icon="info">
        <dl className="grid grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
          <div><dt className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Edition id</dt><dd className="font-mono text-gray-200 break-all">{copy.id}</dd></div>
          <div><dt className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">{retired ? 'Status' : 'Held by'}</dt><dd className="text-gray-200">{retired ? <Chip tone="gray">retired</Chip> : user(copy.owner)}</dd></div>
          <div><dt className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Created</dt><dd className="text-gray-200">{when(copy.at)}</dd></div>
          <div><dt className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Origin</dt><dd className="text-gray-200">{ORIGIN_LABELS[copy.origin]}{copy.est && <> <Chip tone="amber">estimated number</Chip></>}</dd></div>
        </dl>
        {copy.madeFrom && copy.madeFrom.length > 0 && (
          <p className="text-sm text-gray-400">Made by spending {copy.madeFrom.map((id, i) => <span key={id}>{i > 0 && ', '}<Link href={hrefFor(id)} className="text-yellow-300 hover:text-yellow-200 tabular-nums">#{id.split('.')[2]}</Link></span>)}.</p>
        )}
      </Panel>

      <Panel title="Actions" icon="wrench" hint="These change the holder's collection and this edition's history together. Neither works while the edition sits in an open trade offer.">
        {retired ? (
          <p className="text-sm text-gray-500">This edition no longer exists, so there is nothing to do with it. Its history is below.</p>
        ) : inOffer ? (
          <p className="text-sm text-amber-200">It is held by an open trade offer. Cancel the offer from <Link href="/admin/trades" className="underline">Trades</Link> and it comes back to its owner, then you can act on it.</p>
        ) : (
          <div className="space-y-5">
            <form action={transferCopyAction.bind(null, seasonId, copy.id)} className="flex flex-wrap items-end gap-2">
              {hidden}
              <label className="text-xs text-gray-500 space-y-1">Give to another viewer
                <UserInput name="to" required placeholder="their Twitch username" wrapperClassName="relative block" className={`${field} block w-56 max-w-full`} />
              </label>
              <ConfirmButton
                title="Give this edition away?"
                confirmLabel="Give it"
                tone="primary"
                message={<>This moves the edition, with any edition bonus it earns, from <strong className="text-white">@{copy.owner}</strong> to the viewer you typed. It is logged as an admin transfer in the edition&rsquo;s history. If nobody has used that name yet, it becomes a new account, so check the spelling.</>}
                className="px-4 py-2 text-sm font-bold rounded-lg border border-gray-600 text-gray-100 hover:border-yellow-500/60"
              >
                <Icon name="send" className="mr-1.5" />Give
              </ConfirmButton>
            </form>
            <form action={featurePrintAction.bind(null, seasonId, copy.id)} className="flex flex-wrap items-center gap-3">
              {hidden}
              <PendingButton type="submit" disabled={isFeatured || !copy.uid} className="px-4 py-2 text-sm font-bold rounded-lg border border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/10 disabled:opacity-50">
                <Icon name="sparkles" className="mr-1.5" />Feature as edition of the week
              </PendingButton>
              <span className="text-xs text-gray-500">{isFeatured ? 'It is the edition of the week now.' : 'Shows it on the home page in place of the current pick.'}</span>
            </form>
            <form action={removeCopyAction.bind(null, seasonId, copy.id)}>
              {hidden}
              <ConfirmButton
                title={`Remove ${label} #${copy.n}?`}
                confirmLabel="Remove it"
                message={<>This takes the edition out of <strong className="text-white">@{copy.owner}</strong>&rsquo;s collection for good. Its number is never reused, and its history stays here.</>}
                className="px-4 py-2 text-sm font-bold rounded-lg border border-red-500/40 text-red-300 hover:bg-red-950/40"
              >
                <Icon name="trash" className="mr-1.5" />Remove from {copy.owner}&rsquo;s collection
              </ConfirmButton>
            </form>
          </div>
        )}
      </Panel>

      <Panel title="History" icon="history">
        <ol className="space-y-3 border-l border-gray-800 pl-5">
          {copy.ev.map((e, i) => (
            <li key={i} className="relative text-sm">
              <span className="absolute left-[-26px] top-1.5 h-2 w-2 rounded-full bg-yellow-400" />
              <p className="text-gray-200">
                {e.type === 'minted' && <>Created{e.who ? <> for {user(e.who)}</> : null}</>}
                {e.type === 'traded' && <>Moved from {user(e.who)} to {user(e.to)}{e.note ? <span className="text-gray-500"> · {e.note}</span> : null}</>}
                {e.type === 'escrowed' && <>Put up in a trade offer by {user(e.who)}</>}
                {e.type === 'returned' && <>Came back to {user(e.who)} from a trade offer</>}
                {e.type === 'upgraded' && <>Spent by {user(e.who)} in an upgrade{e.note ? <> into <Link href={hrefFor(e.note)} className="text-yellow-300 hover:text-yellow-200">{e.note}</Link></> : null}</>}
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
