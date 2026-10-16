import { listSeasons } from '@/lib/kv';
import { serialStats } from '@/lib/serials';
import { Panel, Chip } from '../components/ui';
import { ConfirmButton } from '../components/ConfirmButton';
import { backfillSerialsAction } from './actions';

/** Card serials: which seasons are tracked, and the one-off numbering of copies that existed before serials. */
export async function SerialsPanel() {
  const seasons = (await listSeasons()).filter(s => s.status !== 'draft');
  const rows = await Promise.all(seasons.map(async s => ({ s, st: await serialStats(s.collectionName) })));
  return (
    <Panel title="Card prints" icon="cheese" hint="Every print of a card gets an edition number that counts up per card and version, so a card and its duplicates each have their own history. Existing prints are numbered once, as estimates; everything after that is exact.">
      {rows.length === 0 ? <p className="text-sm text-gray-500">No published seasons yet.</p> : (
        <ul className="divide-y divide-gray-800/70">
          {rows.map(({ s, st }) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{s.name} {st.tracking ? <Chip tone="green">Tracking</Chip> : <Chip tone="amber">Not numbered yet</Chip>}</p>
                <p className="text-xs text-gray-500">{st.tracking ? `${st.minted.toLocaleString()} made · ${st.live.toLocaleString()} in collections or offers · ${st.retired.toLocaleString()} retired` : 'New pulls get no edition number until the existing prints are numbered.'}</p>
              </div>
              {!st.tracking && (
                <form action={backfillSerialsAction.bind(null, s.id)}>
                  <ConfirmButton
                    title={`Number the prints in ${s.name}?`}
                    confirmLabel="Number them"
                    message={<>Every print that exists now is given an edition number, in the order the collection stores them, marked <strong className="text-white">estimated</strong> because the true pull order wasn&apos;t recorded. Nothing in any collection changes. Do this once, ideally when no packs are being opened.</>}
                    className="tcg-btn px-4 py-2 text-sm rounded-xl"
                  >
                    Number existing prints
                  </ConfirmButton>
                </form>
              )}
              {st.tracking && (
                <form action={backfillSerialsAction.bind(null, s.id)}>
                  <ConfirmButton
                    title={`Give print numbers in ${s.name}?`}
                    confirmLabel="Give numbers"
                    message={<>Every print that has no <strong className="text-white">print number</strong> yet (like #1023381) gets one, oldest print first. Prints that already have one keep it, so it is safe to run again. Nothing in any collection changes.</>}
                    className="px-4 py-2 text-sm rounded-xl border border-gray-700 text-gray-200 hover:border-yellow-500/60"
                  >
                    Give print numbers
                  </ConfirmButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
