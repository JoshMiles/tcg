'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { ensureUserProfile, getCollection, getSeason, saveCollection, withCollectionLock } from '@/lib/kv';
import { getCopy } from '@/lib/serials';
import { entryOf, isEscrow, parseCopyId } from '@/lib/serials-core';
import { recordActivity } from '@/lib/activity';
import { recordAudit } from '@/lib/audit';
import { VARIANT_LABELS } from '@/lib/variants';
import { currentStaffLogin } from '@/lib/staff-actor';
import { clearPotw, featureCopy, pickNow } from '@/lib/print-of-week-store';

// Admin actions on ONE specific copy (by id). Each re-checks the admin cookie and re-reads the copy, so a stale page can't act on
// a copy that has since moved. The collection and the copy ledger are changed together under the collection lock.

const back = (seasonId: string, copyId: string, msg: string, ok = true): never =>
  redirect(`/admin/serials/${encodeURIComponent(seasonId)}/${copyId}?${ok ? 'done' : 'err'}=${encodeURIComponent(msg)}`);

async function load(seasonId: string, copyId: string) {
  const parsed = parseCopyId(copyId);
  const season = await getSeason(seasonId);
  if (!parsed || !season) return null;
  return { season, parsed };
}

/** Gives one exact copy to another viewer (its history records an admin transfer). Refused while the copy sits in a trade offer. */
export async function transferCopyAction(seasonId: string, copyId: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const ctx = await load(seasonId, copyId);
  if (!ctx) return back(seasonId, copyId, 'That print or season does not exist.', false);
  const to = String(formData.get('to') ?? '').trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(to)) return back(seasonId, copyId, 'Enter a valid Twitch username to give it to.', false);
  const c = ctx.season.collectionName;

  const result = await withCollectionLock(c, async (): Promise<string | null> => {
    const copy = await getCopy(c, copyId);
    if (!copy || !copy.owner) return 'That print no longer exists.';
    if (isEscrow(copy.owner)) return 'It is held by an open trade offer. Cancel the offer first.';
    if (copy.owner === to) return 'They already have it.';
    const data = await getCollection(c);
    const entry = entryOf(copy);
    const i = data[copy.owner]?.indexOf(entry) ?? -1;
    if (i < 0) return 'The collection does not match the ledger for this print; nothing was changed.';
    data[copy.owner] = [...data[copy.owner].slice(0, i), ...data[copy.owner].slice(i + 1)];
    if (data[copy.owner].length === 0) delete data[copy.owner];
    data[to] = [...(data[to] ?? []), entry];
    await saveCollection(c, data, { moves: [{ from: copy.owner, to, entry, count: 1, ids: [copy.id], note: 'admin transfer' }] });
    return null;
  });
  if (result) return back(seasonId, copyId, result, false);

  await ensureUserProfile(to).catch(() => { /* a profile is a convenience */ });
  const label = `${ctx.parsed.variant === 'regular' ? '' : `${VARIANT_LABELS[ctx.parsed.variant]} `}#${ctx.parsed.card} edition ${ctx.parsed.n}`;
  await recordAudit(to, 'Print received from an admin', label);
  revalidatePath('/admin/serials');
  return back(seasonId, copyId, `Given to @${to}.`);
}

/** Removes one exact copy from its holder's collection (it is retired, with its history kept). Refused while it sits in a trade offer. */
export async function removeCopyAction(seasonId: string, copyId: string): Promise<void> {
  await requireAdmin();
  const ctx = await load(seasonId, copyId);
  if (!ctx) return back(seasonId, copyId, 'That print or season does not exist.', false);
  const c = ctx.season.collectionName;

  let holder = '';
  const result = await withCollectionLock(c, async (): Promise<string | null> => {
    const copy = await getCopy(c, copyId);
    if (!copy || !copy.owner) return 'That print no longer exists.';
    if (isEscrow(copy.owner)) return 'It is held by an open trade offer. Cancel the offer first.';
    const data = await getCollection(c);
    const entry = entryOf(copy);
    const i = data[copy.owner]?.indexOf(entry) ?? -1;
    if (i < 0) return 'The collection does not match the ledger for this print; nothing was changed.';
    holder = copy.owner;
    data[copy.owner] = [...data[copy.owner].slice(0, i), ...data[copy.owner].slice(i + 1)];
    if (data[copy.owner].length === 0) delete data[copy.owner];
    await saveCollection(c, data, { retire: { owner: copy.owner, ids: [copy.id], who: copy.owner, note: 'removed by an admin' } });
    return null;
  });
  if (result) return back(seasonId, copyId, result, false);

  await recordActivity({ type: 'remove', username: holder, cardNumber: ctx.parsed.card, variant: ctx.parsed.variant, collectionName: c });
  await recordAudit(holder, 'Print removed', `#${ctx.parsed.card} ${VARIANT_LABELS[ctx.parsed.variant]} edition ${ctx.parsed.n}`);
  revalidatePath('/admin/serials');
  return back(seasonId, copyId, `Removed from @${holder}'s collection.`);
}

// ── Print of the week (ROADMAP 6.2) ──

const potwBack = (msg: string, ok = true): never => redirect(`/admin/serials?${ok ? 'done' : 'err'}=${encodeURIComponent(msg)}`);

/** Features one exact print on the home page (replaces the current pick). The staff login is kept as `by`; an audit entry names the holder. */
export async function featurePrintAction(seasonId: string, copyId: string): Promise<void> {
  await requireAdmin();
  const ctx = await load(seasonId, copyId);
  if (!ctx) return back(seasonId, copyId, 'That print or season does not exist.', false);
  const copy = await getCopy(ctx.season.collectionName, copyId);
  if (!copy) return back(seasonId, copyId, 'That print no longer exists.', false);
  const refused = await featureCopy(ctx.season, copy, (await currentStaffLogin()) ?? 'admin');
  if (refused) return back(seasonId, copyId, refused, false);
  await recordAudit(copy.owner, 'Print featured as print of the week', `Print #${copy.uid}`);
  revalidatePath('/');
  revalidatePath('/admin/serials');
  return back(seasonId, copyId, 'Featured as the print of the week. It is on the home page now.');
}

/** Scans the active season and picks again right now (skips prints picked in the last 8 weeks). */
export async function pickPotwAgainAction(): Promise<void> {
  await requireAdmin();
  const out = await pickNow((await currentStaffLogin()) ?? 'admin');
  if (!out.ok) return potwBack(out.reason, false);
  const picked = await getSeason(out.pick.seasonId).then(se => (se ? getCopy(se.collectionName, out.pick.copyId) : null)).catch(() => null);
  await recordAudit(picked?.owner || 'unknown', 'Print of the week picked again', `Print #${out.pick.uid}, ${out.pick.reason}`);
  revalidatePath('/');
  revalidatePath('/admin/serials');
  return potwBack(`Picked Print #${out.pick.uid} (scanned ${out.scan.prints.toLocaleString()} prints in ${out.scan.ms} ms).`);
}

/** Takes the print of the week off the home page until the next pick. */
export async function clearPotwAction(): Promise<void> {
  await requireAdmin();
  await clearPotw();
  revalidatePath('/');
  revalidatePath('/admin/serials');
  return potwBack('Print of the week cleared.');
}
