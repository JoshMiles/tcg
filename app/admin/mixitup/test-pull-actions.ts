'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { recordAudit } from '@/lib/audit';
import { cleanLogin } from '@/lib/staff-core';
import { TEST_VIEWERS_MAX } from '@/lib/mixitup-core';
import { getMixItUpSettings, saveMixItUpSettings } from '@/lib/mixitup';
import { readTrace } from '@/lib/mixitup-trace';
import { startTestPull, undoTestPull } from '@/lib/mixitup-test';
import type { TestPullState, TestStep } from '@/lib/mixitup-test-core';
import type { ActionResult } from '../action-types';

// Test pulls (ROADMAP 55.14), the Overview card and the test viewers on the Connection tab. Every action is admin only and leaves an audit line.

/** "Simulate a chat pull": one test viewer, paid or free. Answers at once; the card then polls the steps. */
export async function simulatePullAction(_prev: TestPullState | null, formData: FormData): Promise<TestPullState> {
  await requireAdmin();
  const paid = formData.get('mode') === 'paid';
  const r = await startTestPull({ username: formData.get('username'), paid, force: formData.get('force') === 'on' });
  if (r.ok) await recordAudit(String(formData.get('username')), 'Test pull simulated', `${paid ? 'paid' : 'free'} (${r.id})`);
  revalidatePath('/admin/mixitup');
  revalidatePath('/admin/activity');
  return { ...r, ...(r.ok ? { startedAt: Date.now() } : {}) };
}

/** The steps so far, for the live list (polled every second while a test runs). */
export async function readTestTraceAction(id: string): Promise<TestStep[]> {
  await requireAdmin();
  return readTrace(String(id));
}

/** "Undo test pull": removes the test edition and pays a paid pull back. Refuses anything that is not a saved test pull. */
export async function undoTestPullAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  const r = await undoTestPull(id);
  if (r.ok && r.username) await recordAudit(r.username, 'Test pull undone', r.detail);
  revalidatePath('/admin/mixitup');
  return { ok: r.ok, message: r.message };
}

const back = (kind: 'note' | 'error', text: string): never => redirect(`/admin/mixitup?tab=connection&${kind}=${encodeURIComponent(text)}`);

/** Adds a test viewer (at most 5), for example a throwaway Twitch account. */
export async function addTestViewerAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const login = cleanLogin(formData.get('login'));
  if (!login) return back('error', 'A Twitch login is 3 to 25 letters, digits or underscores.');
  const s = await getMixItUpSettings();
  if (s.testViewers.includes(login)) return back('error', `${login} is already a test viewer.`);
  if (s.testViewers.length >= TEST_VIEWERS_MAX) return back('error', `At most ${TEST_VIEWERS_MAX} test viewers. Remove one first.`);
  await saveMixItUpSettings({ ...s, testViewers: [...s.testViewers, login] });
  await recordAudit(login, 'Test viewer added');
  revalidatePath('/admin/mixitup');
  return back('note', `${login} can now be used for test pulls.`);
}

export async function removeTestViewerAction(login: string): Promise<void> {
  await requireAdmin();
  const s = await getMixItUpSettings();
  await saveMixItUpSettings({ ...s, testViewers: s.testViewers.filter(v => v !== login) });
  await recordAudit(login, 'Test viewer removed');
  revalidatePath('/admin/mixitup');
  return back('note', `${login} is no longer a test viewer.`);
}
