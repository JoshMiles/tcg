import { kv } from './db';
import {
  DEFAULT_FAQ_SECTIONS,
  getDefaultFaqStore,
  normalizeFaqStore,
  type FaqQuestion,
  type FaqSectionMeta,
  type FaqStoreData,
} from './faq-core';

export const FAQ_KV_KEY = 'site:faq';

/** Reads the current FAQ configuration, falling back to defaults if not yet configured. */
export async function getFaqStore(): Promise<FaqStoreData> {
  const raw = await kv.get<unknown>(FAQ_KV_KEY).catch(() => null);
  return normalizeFaqStore(raw);
}

/** Saves the full FAQ configuration to KV. */
export async function saveFaqStore(data: FaqStoreData): Promise<void> {
  const normalized = normalizeFaqStore(data);
  await kv.set(FAQ_KV_KEY, normalized);
}

/** Resets FAQ configuration to default sections and empty custom questions. */
export async function resetFaqStore(): Promise<FaqStoreData> {
  const defaults = getDefaultFaqStore();
  await kv.set(FAQ_KV_KEY, defaults);
  return defaults;
}

/** Finds a custom question by ID. */
export async function getFaqQuestion(id: string): Promise<FaqQuestion | null> {
  const store = await getFaqStore();
  return store.questions.find(q => q.id === id) ?? null;
}

/** Upserts a custom question. */
export async function upsertFaqQuestion(question: FaqQuestion): Promise<void> {
  const store = await getFaqStore();
  const index = store.questions.findIndex(q => q.id === question.id);
  if (index >= 0) {
    store.questions[index] = question;
  } else {
    // Append to end of section questions
    const sectionQuestions = store.questions.filter(q => q.sectionId === question.sectionId);
    const maxOrder = sectionQuestions.length
      ? Math.max(...sectionQuestions.map(q => q.order ?? 0)) + 1
      : 0;
    question.order = maxOrder;
    store.questions.push(question);
  }
  await saveFaqStore(store);
}

/** Deletes a custom question by ID. */
export async function deleteFaqQuestion(id: string): Promise<boolean> {
  const store = await getFaqStore();
  const initialLength = store.questions.length;
  store.questions = store.questions.filter(q => q.id !== id);
  if (store.questions.length === initialLength) return false;
  await saveFaqStore(store);
  return true;
}

/** Reorders questions within a specific section based on an ordered array of question IDs. */
export async function reorderFaqQuestions(sectionId: string, orderedIds: string[]): Promise<void> {
  const store = await getFaqStore();
  const idToOrder = new Map(orderedIds.map((id, index) => [id, index]));

  store.questions = store.questions.map(q => {
    if (q.sectionId === sectionId && idToOrder.has(q.id)) {
      return { ...q, order: idToOrder.get(q.id)! };
    }
    return q;
  });

  await saveFaqStore(store);
}

/** Reorders section blocks based on an ordered array of section IDs. */
export async function reorderFaqSections(orderedSectionIds: string[]): Promise<void> {
  const store = await getFaqStore();
  const sectionMap = new Map(store.sections.map(s => [s.id, s]));
  const reordered: FaqSectionMeta[] = [];

  for (const id of orderedSectionIds) {
    const s = sectionMap.get(id);
    if (s) {
      reordered.push(s);
      sectionMap.delete(id);
    }
  }

  // Append any sections not mentioned in the ordered list
  for (const remaining of sectionMap.values()) {
    reordered.push(remaining);
  }

  store.sections = reordered;
  await saveFaqStore(store);
}

/** Toggles or sets the hidden flag of a section. */
export async function setFaqSectionHidden(sectionId: string, hidden: boolean): Promise<void> {
  const store = await getFaqStore();
  const section = store.sections.find(s => s.id === sectionId);
  if (!section) return;
  section.hidden = hidden;
  await saveFaqStore(store);
}

/** Creates or updates a custom section. */
export async function upsertFaqSection(section: FaqSectionMeta): Promise<void> {
  const store = await getFaqStore();
  const index = store.sections.findIndex(s => s.id === section.id);
  if (index >= 0) {
    store.sections[index] = {
      ...store.sections[index],
      title: section.title,
      icon: section.icon,
      hidden: section.hidden ?? store.sections[index].hidden,
    };
  } else {
    store.sections.push(section);
  }
  await saveFaqStore(store);
}

/** Deletes a custom section. Cannot delete built-in sections or sections with questions. */
export async function deleteFaqSection(sectionId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const store = await getFaqStore();
  const isBuiltin = DEFAULT_FAQ_SECTIONS.some(d => d.id === sectionId);
  if (isBuiltin) {
    return { ok: false, message: 'Built-in sections cannot be deleted. You can hide them instead.' };
  }

  const hasQuestions = store.questions.some(q => q.sectionId === sectionId);
  if (hasQuestions) {
    return { ok: false, message: 'Cannot delete section with questions. Move or delete its questions first.' };
  }

  store.sections = store.sections.filter(s => s.id !== sectionId);
  await saveFaqStore(store);
  return { ok: true };
}
