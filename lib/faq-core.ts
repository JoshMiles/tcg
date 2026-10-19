import type { IconName } from '@/app/components/Icon';

export interface FaqSectionMeta {
  id: string;
  title: string;
  icon: IconName;
  builtin?: boolean;
  hidden?: boolean;
}

export interface FaqQuestion {
  id: string;
  sectionId: string;
  question: string;
  answer: string;
  order?: number;
  enabled?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface FaqStoreData {
  sections: FaqSectionMeta[];
  questions: FaqQuestion[];
}

export const QUESTION_TITLE_MAX = 200;
export const QUESTION_ANSWER_MAX = 10000;
export const SECTION_TITLE_MAX = 60;
export const SECTION_ID_MAX = 40;

export const DEFAULT_FAQ_SECTIONS: FaqSectionMeta[] = [
  { id: 'start', title: 'Getting started', icon: 'cheese', builtin: true },
  { id: 'commands', title: 'Chat commands', icon: 'chat', builtin: true },
  { id: 'cards', title: 'Cards & versions', icon: 'cards', builtin: true },
  { id: 'trading', title: 'Trading', icon: 'trade', builtin: true },
  { id: 'upgrades', title: 'Upgrading', icon: 'sparkles', builtin: true },
  { id: 'profile', title: 'Your profile', icon: 'user', builtin: true },
  { id: 'show', title: 'Showing off', icon: 'tv', builtin: true },
  { id: 'points', title: 'Points & leaderboard', icon: 'trophy', builtin: true },
  { id: 'seasons', title: 'Seasons', icon: 'calendar', builtin: true },
  { id: 'extension', title: 'Twitch extension', icon: 'puzzle', builtin: true },
  { id: 'privacy', title: 'Privacy & data', icon: 'lock', builtin: true },
  { id: 'help', title: 'Something not working?', icon: 'wrench', builtin: true },
];

export function getDefaultFaqStore(): FaqStoreData {
  return {
    sections: DEFAULT_FAQ_SECTIONS.map(s => ({ ...s })),
    questions: [],
  };
}

export function normalizeFaqStore(raw: unknown): FaqStoreData {
  const defaults = getDefaultFaqStore();
  if (!raw || typeof raw !== 'object') return defaults;

  const r = raw as Record<string, unknown>;
  const rawSections = Array.isArray(r.sections) ? r.sections : [];
  const rawQuestions = Array.isArray(r.questions) ? r.questions : [];

  // Parse sections
  const sections: FaqSectionMeta[] = [];
  const seenIds = new Set<string>();

  for (const s of rawSections) {
    if (!s || typeof s !== 'object') continue;
    const item = s as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id.trim().toLowerCase() : '';
    if (!id || seenIds.has(id)) continue;

    const builtinDefault = DEFAULT_FAQ_SECTIONS.find(d => d.id === id);
    const title = typeof item.title === 'string' && item.title.trim()
      ? item.title.trim().slice(0, SECTION_TITLE_MAX)
      : (builtinDefault?.title ?? id);
    const icon = typeof item.icon === 'string'
      ? (item.icon as IconName)
      : (builtinDefault?.icon ?? 'help');
    const builtin = !!builtinDefault;
    const hidden = item.hidden === true;

    sections.push({ id, title, icon, builtin, hidden });
    seenIds.add(id);
  }

  // Ensure all built-in sections exist even if omitted from stored data
  for (const def of DEFAULT_FAQ_SECTIONS) {
    if (!seenIds.has(def.id)) {
      sections.push({ ...def });
      seenIds.add(def.id);
    }
  }

  // Parse questions
  const questions: FaqQuestion[] = [];
  for (const q of rawQuestions) {
    if (!q || typeof q !== 'object') continue;
    const item = q as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const sectionId = typeof item.sectionId === 'string' ? item.sectionId.trim().toLowerCase() : '';
    const question = typeof item.question === 'string' ? item.question.trim().slice(0, QUESTION_TITLE_MAX) : '';
    const answer = typeof item.answer === 'string' ? item.answer.trim().slice(0, QUESTION_ANSWER_MAX) : '';
    if (!id || !sectionId || !question || !answer) continue;

    const order = typeof item.order === 'number' && Number.isFinite(item.order) ? item.order : questions.length;
    const enabled = item.enabled !== false;
    const createdAt = typeof item.createdAt === 'number' ? item.createdAt : Date.now();
    const updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : Date.now();

    questions.push({
      id,
      sectionId,
      question,
      answer,
      order,
      enabled,
      createdAt,
      updatedAt,
    });
  }

  // Stable sort by order
  questions.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return { sections, questions };
}

export function cleanQuestionInput(
  input: unknown,
  id: string,
): { ok: true; question: FaqQuestion } | { ok: false; message: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, message: 'Invalid question payload.' };
  }
  const r = input as Record<string, unknown>;
  const sectionId = typeof r.sectionId === 'string' ? r.sectionId.trim().toLowerCase() : '';
  const question = typeof r.question === 'string' ? r.question.trim() : '';
  const answer = typeof r.answer === 'string' ? r.answer.trim() : '';
  const enabled = r.enabled !== false;

  if (!sectionId) return { ok: false, message: 'Section is required.' };
  if (!question) return { ok: false, message: 'Question cannot be empty.' };
  if (question.length > QUESTION_TITLE_MAX) {
    return { ok: false, message: `Question must be ${QUESTION_TITLE_MAX} characters or fewer.` };
  }
  if (!answer) return { ok: false, message: 'Answer cannot be empty.' };
  if (answer.length > QUESTION_ANSWER_MAX) {
    return { ok: false, message: `Answer must be ${QUESTION_ANSWER_MAX} characters or fewer.` };
  }

  const now = Date.now();
  return {
    ok: true,
    question: {
      id,
      sectionId,
      question,
      answer,
      enabled,
      order: typeof r.order === 'number' ? r.order : 0,
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : now,
      updatedAt: now,
    },
  };
}

export function cleanSectionInput(
  input: unknown,
): { ok: true; section: FaqSectionMeta } | { ok: false; message: string } {
  if (!input || typeof input !== 'object') {
    return { ok: false, message: 'Invalid section payload.' };
  }
  const r = input as Record<string, unknown>;
  const rawId = typeof r.id === 'string' ? r.id.trim().toLowerCase() : '';
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  const icon = (typeof r.icon === 'string' ? r.icon.trim() : 'help') as IconName;

  if (!rawId) return { ok: false, message: 'Section identifier is required.' };
  if (!/^[a-z0-9_-]{2,40}$/.test(rawId)) {
    return { ok: false, message: 'Section identifier must be 2 to 40 lowercase letters, numbers, hyphens or underscores.' };
  }
  if (!title) return { ok: false, message: 'Section title is required.' };
  if (title.length > SECTION_TITLE_MAX) {
    return { ok: false, message: `Section title must be ${SECTION_TITLE_MAX} characters or fewer.` };
  }

  return {
    ok: true,
    section: {
      id: rawId,
      title,
      icon,
      builtin: DEFAULT_FAQ_SECTIONS.some(d => d.id === rawId),
      hidden: r.hidden === true,
    },
  };
}

export function reorderArray<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
    return [...items];
  }
  const result = [...items];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

export interface ParsedParagraph {
  type: 'p';
  text: string;
}

export interface ParsedList {
  type: 'ul';
  items: string[];
}

export type ParsedBlock = ParsedParagraph | ParsedList;

/** Splits markdown-like text into structured paragraphs and bullet lists. */
export function parseFaqAnswerBlocks(text: string): ParsedBlock[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const rawBlocks = normalized.split(/\n\s*\n+/);
  const blocks: ParsedBlock[] = [];

  for (const block of rawBlocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    // Check if every line is a bullet item
    const isBulletList = lines.every(l => /^[-*•]\s+/.test(l));
    if (isBulletList) {
      blocks.push({
        type: 'ul',
        items: lines.map(l => l.replace(/^[-*•]\s+/, '')),
      });
    } else {
      // Paragraph with joined lines
      blocks.push({
        type: 'p',
        text: lines.join(' '),
      });
    }
  }

  return blocks;
}

export type InlineToken =
  | { type: 'text'; content: string }
  | { type: 'bold'; content: string }
  | { type: 'link'; content: string; href: string };

export function parseInlineTokens(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined && match[2] !== undefined) {
      tokens.push({ type: 'link', content: match[1], href: match[2] });
    } else if (match[3] !== undefined) {
      tokens.push({ type: 'bold', content: match[3] });
    }
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return tokens;
}

