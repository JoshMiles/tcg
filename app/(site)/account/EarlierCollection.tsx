import { Icon } from '@/app/components/Icon';
import type { Session } from '@/lib/session';
import { findEarlierAccount } from '@/lib/account-restore';
import { cardsOf } from '@/lib/account-move';
import { keepSeparateAction, restoreEarlierAction } from './actions';

/** "We found your earlier collection": a collection this Twitch account left under another login (moved aside, or before a rename). Only its owner is offered it. */
export async function EarlierCollection({ session, restored }: { session: Session; restored?: string }) {
  const found = session.sandbox ? null : await findEarlierAccount(session.username, session.twitchId).catch(() => null);
  const mine = found ? await cardsOf(session.username) : 0;
  return (
    <>
      {restored === 'ok' && <p className="rind rounded-2xl p-4 text-sm text-emerald-200"><Icon name="check" className="mr-2" />Your earlier collection is back under @{session.username}.</p>}
      {restored === 'failed' && <p className="rind rounded-2xl p-4 text-sm text-red-300"><Icon name="alert" className="mr-2" />We couldn&rsquo;t restore it. Try again, or ask the staff if it keeps happening.</p>}
      {found && (
        <section className="rind rounded-2xl p-5 space-y-3" aria-label="Earlier collection">
          <h2 className="font-display text-xl font-bold text-white"><Icon name="cards" className="mr-2 text-yellow-400" />We found your earlier collection</h2>
          <p className="text-sm text-gray-300">We found your earlier collection as <strong className="text-white">@{found.original}</strong> ({found.cards.toLocaleString()} {found.cards === 1 ? 'card' : 'cards'}).{' '}
            {mine === 0
              ? <>Restore it to bring every edition, trade and setting over to @{session.username}.</>
              : <>@{session.username} already has cards, so we can&rsquo;t move it automatically. Ask the staff and they can merge the two.</>}
          </p>
          <div className="flex flex-wrap gap-2">
            {mine === 0 && <form action={restoreEarlierAction}><button type="submit" className="btn btn-primary px-4 py-2 text-sm rounded-xl">Restore it here</button></form>}
            <form action={keepSeparateAction}><button type="submit" className="btn px-4 py-2 text-sm rounded-xl">Keep it separate</button></form>
          </div>
        </section>
      )}
    </>
  );
}
