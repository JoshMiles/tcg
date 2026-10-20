'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { recordAudit } from '@/lib/audit';
import {
  cleanQuestionInput,
  cleanSectionInput,
  normalizeFaqOverride,
  QUESTION_ANSWER_MAX,
  QUESTION_TITLE_MAX,
  type FaqQuestion,
  type FaqSectionMeta,
} from '@/lib/faq-core';
import { getFaqBuiltin } from '@/lib/faq-builtins';
import {
  deleteFaqQuestion,
  deleteFaqSection,
  getFaqQuestion,
  getFaqStore,
  reorderFaqQuestions,
  reorderFaqSections,
  resetFaqStore,
  setFaqOverride,
  setFaqSectionHidden,
  upsertFaqQuestion,
  upsertFaqSection,
} from '@/lib/faq';

export type FaqActionResult = { ok: true; question?: FaqQuestion; section?: FaqSectionMeta } | { ok: false; message: string };

async function sectionIds(): Promise<string[]> {
  return (await getFaqStore()).sections.map(s => s.id);
}

function revalidateAll() {
  revalidatePath('/admin/faq');
  revalidatePath('/faq');
}

export async function createFaqQuestionAction(input: Record<string, unknown>): Promise<FaqActionResult> {
  await requireAdmin();
  const id = crypto.randomUUID();
  const cleaned = cleanQuestionInput(input, id, await sectionIds());
  if (!cleaned.ok) return cleaned;

  await upsertFaqQuestion(cleaned.question);
  await recordAudit(`faq:q:${id}`, 'FAQ question created', `"${cleaned.question.question}" in #${cleaned.question.sectionId}`);
  revalidateAll();
  return { ok: true, question: cleaned.question };
}

export async function updateFaqQuestionAction(id: string, input: Record<string, unknown>): Promise<FaqActionResult> {
  await requireAdmin();
  const existing = await getFaqQuestion(id);
  if (!existing) return { ok: false, message: 'Question no longer exists.' };

  // An edit keeps the question's place and its creation date; the form does not send them.
  const cleaned = cleanQuestionInput({ ...input, order: existing.order, createdAt: existing.createdAt }, id, await sectionIds());
  if (!cleaned.ok) return cleaned;

  await upsertFaqQuestion(cleaned.question);
  await recordAudit(`faq:q:${id}`, 'FAQ question edited', `"${cleaned.question.question}" in #${cleaned.question.sectionId}`);
  revalidateAll();
  return { ok: true, question: cleaned.question };
}

export async function deleteFaqQuestionAction(id: string): Promise<FaqActionResult> {
  await requireAdmin();
  const existing = await getFaqQuestion(id);
  if (!existing) return { ok: false, message: 'Question no longer exists.' };

  const deleted = await deleteFaqQuestion(id);
  if (!deleted) return { ok: false, message: 'Could not delete question.' };

  await recordAudit(`faq:q:${id}`, 'FAQ question deleted', `"${existing.question}" from #${existing.sectionId}`);
  revalidateAll();
  return { ok: true };
}

export async function reorderFaqQuestionsAction(sectionId: string, orderedIds: string[]): Promise<FaqActionResult> {
  await requireAdmin();
  if (!sectionId || !Array.isArray(orderedIds)) return { ok: false, message: 'Invalid reorder parameters.' };
  if (!(await sectionIds()).includes(sectionId)) return { ok: false, message: 'That section does not exist.' };

  await reorderFaqQuestions(sectionId, orderedIds);
  await recordAudit(`faq:sec:${sectionId}`, 'FAQ questions reordered', `${orderedIds.length} questions in #${sectionId}`);
  revalidateAll();
  return { ok: true };
}

export async function reorderFaqSectionsAction(orderedSectionIds: string[]): Promise<FaqActionResult> {
  await requireAdmin();
  if (!Array.isArray(orderedSectionIds)) return { ok: false, message: 'Invalid sections parameter.' };

  await reorderFaqSections(orderedSectionIds);
  await recordAudit('faq:sections', 'FAQ sections reordered', orderedSectionIds.join(', '));
  revalidateAll();
  return { ok: true };
}

export async function createFaqSectionAction(input: Record<string, unknown>): Promise<FaqActionResult> {
  await requireAdmin();
  const cleaned = cleanSectionInput(input);
  if (!cleaned.ok) return cleaned;

  await upsertFaqSection(cleaned.section);
  await recordAudit(`faq:sec:${cleaned.section.id}`, 'FAQ section created', `"${cleaned.section.title}" (#${cleaned.section.id})`);
  revalidateAll();
  return { ok: true, section: cleaned.section };
}

export async function deleteFaqSectionAction(sectionId: string): Promise<FaqActionResult> {
  await requireAdmin();
  const res = await deleteFaqSection(sectionId);
  if (!res.ok) return res;

  await recordAudit(`faq:sec:${sectionId}`, 'FAQ section deleted', `#${sectionId}`);
  revalidateAll();
  return { ok: true };
}

export async function toggleFaqSectionAction(sectionId: string, hidden: boolean): Promise<FaqActionResult> {
  await requireAdmin();
  if (!(await sectionIds()).includes(sectionId)) return { ok: false, message: 'That section does not exist.' };
  await setFaqSectionHidden(sectionId, hidden);
  await recordAudit(`faq:sec:${sectionId}`, hidden ? 'FAQ section hidden' : 'FAQ section shown', `#${sectionId}`);
  revalidateAll();
  return { ok: true };
}

/** Saves new wording for a built-in question. Text equal to the built-in text is not stored, so the question follows later copy fixes. */
export async function saveFaqBuiltinAction(id: string, input: { question: string; answer: string }): Promise<FaqActionResult> {
  await requireAdmin();
  if (!getFaqBuiltin(id)) return { ok: false, message: 'Unknown built-in question.' };
  const question = typeof input?.question === 'string' ? input.question.trim() : '';
  const answer = typeof input?.answer === 'string' ? input.answer.trim() : '';
  if (!question) return { ok: false, message: 'Question cannot be empty.' };
  if (question.length > QUESTION_TITLE_MAX) return { ok: false, message: `Question must be ${QUESTION_TITLE_MAX} characters or fewer.` };
  if (!answer) return { ok: false, message: 'Answer cannot be empty.' };
  if (answer.length > QUESTION_ANSWER_MAX) return { ok: false, message: `Answer must be ${QUESTION_ANSWER_MAX} characters or fewer.` };

  const hidden = (await getFaqStore()).overrides[id]?.hidden;
  await setFaqOverride(id, normalizeFaqOverride(id, { question, answer, hidden }));
  await recordAudit(`faq:b:${id}`, 'FAQ built-in question edited', `"${question}" (${id})`);
  revalidateAll();
  return { ok: true };
}

export async function setFaqBuiltinHiddenAction(id: string, hidden: boolean): Promise<FaqActionResult> {
  await requireAdmin();
  if (!getFaqBuiltin(id)) return { ok: false, message: 'Unknown built-in question.' };
  const current = (await getFaqStore()).overrides[id];
  await setFaqOverride(id, normalizeFaqOverride(id, { ...current, hidden: hidden === true }));
  await recordAudit(`faq:b:${id}`, hidden ? 'FAQ built-in question hidden' : 'FAQ built-in question shown', id);
  revalidateAll();
  return { ok: true };
}

export async function resetFaqBuiltinAction(id: string): Promise<FaqActionResult> {
  await requireAdmin();
  if (!getFaqBuiltin(id)) return { ok: false, message: 'Unknown built-in question.' };
  await setFaqOverride(id, null);
  await recordAudit(`faq:b:${id}`, 'FAQ built-in question reset', id);
  revalidateAll();
  return { ok: true };
}

export async function resetFaqAction(): Promise<FaqActionResult> {
  await requireAdmin();
  await resetFaqStore();
  await recordAudit('faq:reset', 'FAQ reset to defaults', 'Restored default section blocks and cleared custom questions and built-in edits');
  revalidateAll();
  return { ok: true };
}
