'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin-guard';
import { recordAudit } from '@/lib/audit';
import {
  cleanQuestionInput,
  cleanSectionInput,
  type FaqQuestion,
  type FaqSectionMeta,
} from '@/lib/faq-core';
import {
  deleteFaqQuestion,
  deleteFaqSection,
  getFaqQuestion,
  reorderFaqQuestions,
  reorderFaqSections,
  resetFaqStore,
  setFaqSectionHidden,
  upsertFaqQuestion,
  upsertFaqSection,
} from '@/lib/faq';

export type FaqActionResult = { ok: true; question?: FaqQuestion; section?: FaqSectionMeta } | { ok: false; message: string };

function revalidateAll() {
  revalidatePath('/admin/faq');
  revalidatePath('/faq');
}

export async function createFaqQuestionAction(input: Record<string, unknown>): Promise<FaqActionResult> {
  await requireAdmin();
  const id = crypto.randomUUID();
  const cleaned = cleanQuestionInput(input, id);
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

  const cleaned = cleanQuestionInput(input, id);
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
  await setFaqSectionHidden(sectionId, hidden);
  await recordAudit(`faq:sec:${sectionId}`, hidden ? 'FAQ section hidden' : 'FAQ section shown', `#${sectionId}`);
  revalidateAll();
  return { ok: true };
}

export async function resetFaqAction(): Promise<FaqActionResult> {
  await requireAdmin();
  await resetFaqStore();
  await recordAudit('faq:reset', 'FAQ reset to defaults', 'Restored default section blocks and cleared custom questions');
  revalidateAll();
  return { ok: true };
}
