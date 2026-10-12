'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { SANDBOX_COOKIE } from '@/lib/db';
import { createSandbox, deleteSandbox, getSandbox, resetSandbox, resetTestData, type SandboxSource } from '@/lib/sandbox';
import { cleanTestUsername, grantCopies, seedUsers, simulatePulls, type SeedShape } from '@/lib/sandbox-tools';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '@/lib/session';
import { ensureUserProfile } from '@/lib/kv';
import { runInSandbox } from '@/lib/db';
import { VARIANTS } from '@/lib/variants';
import type { Variant } from '@/lib/types';

// Server actions behind /admin/sandbox. Each one re-checks the admin cookie (see lib/admin-guard.ts) and works on the sandbox
// it is given, wherever the admin currently is. Results go back in the redirect URL (?msg=...) so the page is plain server HTML.

const back = (id: string, msg: string, kind: 'ok' | 'error' = 'ok', tab = 'setup') =>
  redirect(`/admin/sandbox/${id}?tab=${tab}&${kind === 'ok' ? 'msg' : 'err'}=${encodeURIComponent(msg)}`);

const COOKIE_OPTS = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 30 };

export async function createSandboxAction(formData: FormData) {
  await requireAdmin();
  const source = (['config', 'collections', 'empty'].includes(String(formData.get('source'))) ? String(formData.get('source')) : 'config') as SandboxSource;
  const sandbox = await createSandbox({ name: String(formData.get('name') ?? ''), source });
  (await cookies()).set(SANDBOX_COOKIE, sandbox.id, COOKIE_OPTS); // creating one drops you straight into it
  revalidatePath('/admin', 'layout');
  redirect(`/admin/sandbox/${sandbox.id}?msg=${encodeURIComponent('Sandbox created. You are now in it: nothing you do here reaches production.')}`);
}

export async function enterSandboxAction(id: string) {
  await requireAdmin();
  if (!(await getSandbox(id))) return redirect('/admin/sandbox');
  (await cookies()).set(SANDBOX_COOKIE, id, COOKIE_OPTS);
  revalidatePath('/admin', 'layout');
  redirect(`/admin/sandbox/${id}`);
}

export async function exitSandboxAction() {
  await requireAdmin();
  const jar = await cookies();
  jar.delete(SANDBOX_COOKIE);
  // A sandbox test login is meaningless outside its sandbox: drop it too so the public site doesn't look half-logged-in.
  jar.delete(SESSION_COOKIE);
  revalidatePath('/admin', 'layout');
  redirect('/admin/sandbox');
}

export async function resetSandboxAction(id: string) {
  await requireAdmin();
  await resetSandbox(id);
  revalidatePath('/admin', 'layout');
  back(id, 'Sandbox reset to a fresh copy of its source.', 'ok', 'reset');
}

export async function deleteSandboxAction(id: string) {
  await requireAdmin();
  await deleteSandbox(id);
  const jar = await cookies();
  if (jar.get(SANDBOX_COOKIE)?.value === id) { jar.delete(SANDBOX_COOKIE); jar.delete(SESSION_COOKIE); }
  revalidatePath('/admin', 'layout');
  redirect('/admin/sandbox');
}

export async function resetTestDataAction(id: string) {
  await requireAdmin();
  const n = await resetTestData(id);
  back(id, `Removed all viewer data (${n} records). The setup is untouched.`, 'ok', 'reset');
}

export async function simulatePullsAction(id: string, formData: FormData) {
  await requireAdmin();
  const username = String(formData.get('username') ?? '');
  try {
    const { pulls, byVariant } = await simulatePulls(id, username, Number(formData.get('count')));
    const bits = VARIANTS.filter(v => byVariant[v] > 0).map(v => `${byVariant[v]} ${v}`).join(', ');
    back(id, `${cleanTestUsername(username)} pulled ${pulls} card${pulls === 1 ? '' : 's'} (${bits}).`, 'ok', 'drive');
  } catch (e) {
    if (isRedirect(e)) throw e;
    back(id, e instanceof Error ? e.message : 'Could not simulate pulls.', 'error', 'drive');
  }
}

export async function seedUsersAction(id: string, formData: FormData) {
  await requireAdmin();
  try {
    const shape: SeedShape = formData.get('shape') === 'even' ? 'even' : 'realistic';
    const r = await seedUsers(id, { count: Number(formData.get('count')), minPulls: Number(formData.get('minPulls')), maxPulls: Number(formData.get('maxPulls')), shape });
    const bits = VARIANTS.filter(v => r.byVariant[v] > 0).map(v => `${r.byVariant[v].toLocaleString()} ${v}`).join(', ');
    back(id, `Created ${r.users} test users with ${r.pulls.toLocaleString()} pulls between them (${bits}). The heaviest collector pulled ${r.heaviest}.`, 'ok', 'drive');
  } catch (e) {
    if (isRedirect(e)) throw e;
    back(id, e instanceof Error ? e.message : 'Could not seed users.', 'error', 'drive');
  }
}

export async function grantCopiesAction(id: string, formData: FormData) {
  await requireAdmin();
  const username = String(formData.get('username') ?? '');
  const variant = String(formData.get('variant') ?? 'regular') as Variant;
  try {
    const n = await grantCopies(id, username, Number(formData.get('cardNumber')), variant, Number(formData.get('count')));
    back(id, `Gave ${cleanTestUsername(username)} ${n} ${variant} cop${n === 1 ? 'y' : 'ies'} of card #${formData.get('cardNumber')}.`, 'ok', 'drive');
  } catch (e) {
    if (isRedirect(e)) throw e;
    back(id, e instanceof Error ? e.message : 'Could not grant copies.', 'error', 'drive');
  }
}

export async function addTestUserAction(id: string, formData: FormData) {
  await requireAdmin();
  const username = cleanTestUsername(String(formData.get('username') ?? ''));
  if (!username) return back(id, 'Enter a username (letters, numbers and underscores).', 'error');
  await runInSandbox(id, () => ensureUserProfile(username));
  back(id, `Test user ${username} created. Give them pulls or copies to start testing.`);
}

/** Logs the browser in as a test user, valid only inside this sandbox. No Twitch involved. */
export async function loginAsAction(id: string, username: string) {
  await requireAdmin();
  const user = cleanTestUsername(username);
  const token = signSession({ username: user, twitchId: `sandbox-${user}`, displayName: user, sandbox: id });
  if (!token) return back(id, 'Logging in as a test user needs SESSION_SECRET to be set.', 'error');
  const jar = await cookies();
  jar.set(SANDBOX_COOKIE, id, COOKIE_OPTS);
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
  redirect('/account');
}

function isRedirect(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_REDIRECT');
}
