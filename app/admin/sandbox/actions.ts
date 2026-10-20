'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { SANDBOX_COOKIE, isPreview } from '@/lib/db';
import { createSandbox, deleteSandbox, getSandbox, resetSandbox, resetTestData, setSandboxExpiry, touchSandbox, type SandboxSource } from '@/lib/sandbox';
import { logEvent, undoLast, withUndo } from '@/lib/sandbox-log';
import { applyScenario, SCENARIOS, type ScenarioId } from '@/lib/sandbox-scenarios';
import { cleanTestUsername, grantCopies, removeTestUsers, seedUsers, simulatePulls, type SeedShape } from '@/lib/sandbox-tools';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/session';
import { ensureUserProfile } from '@/lib/kv';
import { runInSandbox } from '@/lib/db';
import { escapeMd, notifySystem } from '@/lib/discord';
import { VARIANTS } from '@/lib/variants';
import type { Variant } from '@/lib/types';

// Server actions behind /admin/sandbox. Each one re-checks the admin cookie (see lib/admin-guard.ts) and works on the sandbox
// it is given, wherever the admin currently is. Results go back in the redirect URL (?msg=...) so the page is plain server HTML.

const back = (id: string, msg: string, kind: 'ok' | 'error' = 'ok', tab = 'overview') =>
  redirect(`/admin/sandbox/${id}?tab=${tab}&${kind === 'ok' ? 'msg' : 'err'}=${encodeURIComponent(msg)}`);

/** Admin check, and sandboxes are switched off on preview deployments (one level of isolation is enough there). */
async function admin() {
  await requireAdmin();
  if (isPreview()) redirect('/admin/sandbox');
}

const COOKIE_OPTS = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 30 };

/**
 * Runs one tool action: admin check, the sandbox must exist (a missing id would otherwise write into a dead namespace),
 * then report the outcome on the right tab. `fn` returns the message to show.
 */
async function guarded(id: string, tab: string, fn: () => Promise<string>): Promise<never> {
  await admin();
  if (!(await getSandbox(id))) redirect('/admin/sandbox');
  let msg: string;
  try {
    msg = await fn();
  } catch (e) {
    if (isRedirect(e)) throw e;
    return back(id, e instanceof Error ? e.message : 'Something went wrong.', 'error', tab);
  }
  await touchSandbox(id);
  return back(id, msg, 'ok', tab);
}

export async function createSandboxAction(formData: FormData) {
  await admin();
  const source = (['config', 'collections', 'empty'].includes(String(formData.get('source'))) ? String(formData.get('source')) : 'config') as SandboxSource;
  let sandbox;
  try {
    sandbox = await createSandbox({ name: String(formData.get('name') ?? ''), source, expiresInDays: Number(formData.get('expiresInDays')) || 0 });
  } catch (e) {
    redirect(`/admin/sandbox?err=${encodeURIComponent(e instanceof Error ? e.message : 'Could not create the sandbox.')}`);
  }
  await logEvent(sandbox.id, 'Sandbox created', `From: ${source}`);
  await runInSandbox(null, () => notifySystem({ title: '🧪 Sandbox created', text: `**${escapeMd(sandbox.name)}**, from ${source}`, tone: 'info' }));
  (await cookies()).set(SANDBOX_COOKIE, sandbox.id, COOKIE_OPTS); // creating one drops you straight into it
  revalidatePath('/admin', 'layout');
  redirect(`/admin/sandbox/${sandbox.id}?msg=${encodeURIComponent('Sandbox created. You are now in it: nothing you do here reaches production.')}`);
}

export async function enterSandboxAction(id: string) {
  await admin();
  if (!(await getSandbox(id))) return redirect('/admin/sandbox');
  (await cookies()).set(SANDBOX_COOKIE, id, COOKIE_OPTS);
  await touchSandbox(id);
  revalidatePath('/admin', 'layout');
  redirect(`/admin/sandbox/${id}`);
}

export async function exitSandboxAction() {
  await admin();
  const jar = await cookies();
  jar.delete(SANDBOX_COOKIE);
  // A sandbox test login is meaningless outside its sandbox: drop it too so the public site doesn't look half-logged-in.
  jar.delete(SESSION_COOKIE);
  revalidatePath('/admin', 'layout');
  redirect('/admin/sandbox');
}

export async function resetSandboxAction(id: string) {
  await guarded(id, 'reset', async () => {
    await resetSandbox(id);
    await logEvent(id, 'Sandbox reset', 'Wiped and copied from its source again');
    revalidatePath('/admin', 'layout');
    return 'Sandbox reset to a fresh copy of its source.';
  });
}

export async function deleteSandboxAction(id: string) {
  await admin();
  const gone = await getSandbox(id);
  await deleteSandbox(id);
  if (gone) await runInSandbox(null, () => notifySystem({ title: '🧪 Sandbox deleted', text: `**${escapeMd(gone.name)}**`, tone: 'info' }));
  const jar = await cookies();
  if (jar.get(SANDBOX_COOKIE)?.value === id) { jar.delete(SANDBOX_COOKIE); jar.delete(SESSION_COOKIE); }
  revalidatePath('/admin', 'layout');
  redirect('/admin/sandbox');
}

export async function resetTestDataAction(id: string) {
  await guarded(id, 'reset', async () => {
    const n = await withUndo(id, 'Cleared all viewer data', [], () => resetTestData(id), r => `${r} records`);
    return `Removed all viewer data (${n} records). The setup is untouched. You can undo this from the Activity tab.`;
  });
}

export async function simulatePullsAction(id: string, formData: FormData) {
  const username = String(formData.get('username') ?? '');
  await guarded(id, 'drive', async () => {
    const user = cleanTestUsername(username);
    const { pulls, byVariant } = await withUndo(id, `Simulated pulls for ${user}`, [user], () => simulatePulls(id, username, Number(formData.get('count'))), r => `${r.pulls} pulls`);
    const bits = VARIANTS.filter(v => byVariant[v] > 0).map(v => `${byVariant[v]} ${v}`).join(', ');
    return `${user} pulled ${pulls} card${pulls === 1 ? '' : 's'} (${bits}).`;
  });
}

export async function seedUsersAction(id: string, formData: FormData) {
  await guarded(id, 'drive', async () => {
    const shape: SeedShape = formData.get('shape') === 'even' ? 'even' : 'realistic';
    const r = await withUndo(id, 'Seeded a crowd of test users', [], () => seedUsers(id, { count: Number(formData.get('count')), minPulls: Number(formData.get('minPulls')), maxPulls: Number(formData.get('maxPulls')), shape }), x => `${x.users} users, ${x.pulls} pulls`);
    const bits = VARIANTS.filter(v => r.byVariant[v] > 0).map(v => `${r.byVariant[v].toLocaleString()} ${v}`).join(', ');
    return `Created ${r.users} test users with ${r.pulls.toLocaleString()} pulls between them (${bits}). The heaviest collector pulled ${r.heaviest}.`;
  });
}

export async function grantCopiesAction(id: string, formData: FormData) {
  const username = String(formData.get('username') ?? '');
  const variant = String(formData.get('variant') ?? 'regular') as Variant;
  await guarded(id, 'drive', async () => {
    const user = cleanTestUsername(username);
    const card = Number(formData.get('cardNumber'));
    const n = await withUndo(id, `Gave ${user} editions of card #${card}`, [user], () => grantCopies(id, username, card, variant, Number(formData.get('count'))), r => `${r} ${variant}`);
    return `Gave ${user} ${n} ${variant} edition${n === 1 ? '' : 's'} of card #${card}.`;
  });
}

export async function addTestUserAction(id: string, formData: FormData) {
  await guarded(id, 'users', async () => {
    const username = cleanTestUsername(String(formData.get('username') ?? ''));
    if (!username) throw new Error('Enter a username (letters, numbers and underscores).');
    await withUndo(id, `Added test user ${username}`, [username], () => runInSandbox(id, () => ensureUserProfile(username)));
    return `Test user ${username} created. Give them pulls or editions to start testing.`;
  });
}

const isScenario = (v: string): v is ScenarioId => SCENARIOS.some(s => s.id === v);

export async function applyScenarioAction(id: string, scenario: string) {
  await guarded(id, 'drive', async () => {
    if (!isScenario(scenario)) throw new Error('Unknown scenario.');
    const title = SCENARIOS.find(s => s.id === scenario)!.title;
    const r = await withUndo(id, `Scenario: ${title}`, ['upgrade_ready', 'upgrade_one_short', 'one_card_short', 'completionist', 'trader_a', 'trader_b', 'shiny_hunter'], () => applyScenario(id, scenario), x => x.note);
    return `${title}: ${r.note}`;
  });
}

/** Clears (keeps the profile) or deletes the viewers ticked on the Users tab. */
export async function removeUsersAction(id: string, mode: 'clear' | 'delete', formData: FormData) {
  const names = formData.getAll('username').map(String);
  await guarded(id, 'users', async () => {
    const clean = names.map(cleanTestUsername).filter(Boolean);
    const label = `${mode === 'delete' ? 'Deleted' : 'Cleared'} ${clean.length} viewer${clean.length === 1 ? '' : 's'}`;
    await withUndo(id, label, clean, () => removeTestUsers(id, clean, mode), () => clean.slice(0, 8).join(', ') + (clean.length > 8 ? '…' : ''));
    return `${label}. You can undo this from the Activity tab.`;
  });
}

export async function undoLastAction(id: string) {
  await guarded(id, 'log', async () => {
    const r = await undoLast(id);
    if (!r.ok) throw new Error(r.error);
    return `Undid: ${r.label}.`;
  });
}

export async function setExpiryAction(id: string, formData: FormData) {
  await guarded(id, 'reset', async () => {
    const days = Number(formData.get('days')) || 0;
    await setSandboxExpiry(id, days);
    await logEvent(id, days > 0 ? `Set to delete itself in ${days} days` : 'Automatic deletion switched off');
    return days > 0 ? `This sandbox will delete itself in ${days} days.` : 'This sandbox will no longer delete itself.';
  });
}

/** Logs the browser in as a test user, valid only inside this sandbox. No Twitch involved. */
export async function loginAsAction(id: string, username: string) {
  await admin();
  if (!(await getSandbox(id))) redirect('/admin/sandbox');
  const user = cleanTestUsername(username);
  const token = signSession({ username: user, twitchId: `sandbox-${user}`, displayName: user, sandbox: id });
  if (!token) return back(id, 'Logging in as a test user needs SESSION_SECRET to be set.', 'error', 'users');
  const jar = await cookies();
  jar.set(SANDBOX_COOKIE, id, COOKIE_OPTS);
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
  await touchSandbox(id);
  redirect('/account');
}

function isRedirect(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_REDIRECT');
}

/** Form version of loginAsAction (the Users table posts the viewer in a hidden field). */
export async function loginAsFormAction(id: string, formData: FormData) {
  return loginAsAction(id, String(formData.get('username') ?? ''));
}
